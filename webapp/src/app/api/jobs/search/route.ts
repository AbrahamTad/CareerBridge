import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { searchJobTech, uniqueExternalJobs } from '@/lib/jobs/jobtech'
import { expandJobSearchLocations, locationLabelForSearch } from '@/lib/jobs/locations'
import { persistExternalJobs } from '@/lib/jobs/persist'

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthResponse(auth)) return auth

  const body = await request.json()
  const { query = '', liaOnly = false } = body
  let location = typeof body.location === 'string' ? body.location.trim() : ''
  const terms = String(query || '').split(',').map((term) => term.trim()).filter(Boolean)
  const liaTerms = liaOnly ? ['LIA', 'praktik', 'praktikplats', 'trainee', 'internship', 'larling'] : []
  const searchTerms = Array.from(new Set([...(terms.length ? terms : ['']), ...liaTerms]))

  if (!location) {
    const profile = await prisma.userProfile.findUnique({
      where: { userId: auth.dbUserId },
      select: { city: true, location: true },
    })
    location = profile?.city || profile?.location || ''
  }

  const searchTask = await prisma.searchTask.create({
    data: {
      userId: auth.dbUserId,
      type: liaOnly ? 'LIA_SEARCH' : 'JOB_SCAN',
      status: 'RUNNING',
      query: { query, location: locationLabelForSearch(location), liaOnly, source: 'jobtech' },
      queryText: query || 'manual-scan',
      location,
      progress: 20,
      currentStep: 'Searching job sources',
      startedAt: new Date(),
    },
  })

  try {
    const searchLocations = expandJobSearchLocations(location)
    const expandedLocationSearch = searchLocations.length > 1
    const results = await Promise.allSettled(
      searchTerms.slice(0, 4).flatMap((term) =>
        searchLocations.map((place) => searchJobTech(term, place, expandedLocationSearch ? 8 : 25))
      )
    )
    const foundJobs = uniqueExternalJobs(results.flatMap((result) => result.status === 'fulfilled' ? result.value : []))
      .filter((job) => !liaOnly || job.isLia || /lia|praktik|trainee|internship|larling|apprentice/i.test(`${job.title} ${job.description} ${job.jobType ?? ''}`))
    const jobs = foundJobs.slice(0, 50)
    const { newCount } = await persistExternalJobs(jobs)

    await prisma.searchTask.update({
      where: { id: searchTask.id },
      data: {
        status: 'COMPLETED',
        progress: 100,
        currentStep: 'Completed',
        sourcesScanned: searchTerms.slice(0, 4).length * searchLocations.length,
        jobsFound: jobs.length,
        companiesFound: new Set(jobs.map((job) => job.companyName.toLowerCase())).size,
        completedAt: new Date(),
        results: {
          count: newCount,
          total: foundJobs.length,
          imported: jobs.length,
          source: 'jobtech',
          location: locationLabelForSearch(location),
          searchedLocations: searchLocations.filter(Boolean),
        },
      },
    })

    return NextResponse.json({
      count: newCount,
      total: foundJobs.length,
      imported: jobs.length,
      taskId: searchTask.id,
      location: locationLabelForSearch(location),
      searchedLocations: searchLocations.filter(Boolean),
    })
  } catch (err: unknown) {
    await prisma.searchTask.update({
      where: { id: searchTask.id },
      data: { status: 'FAILED', error: err instanceof Error ? err.message : 'Unknown error' },
    })
    return NextResponse.json({ error: 'Scanning misslyckades' }, { status: 500 })
  }
}
