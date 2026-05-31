import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { discoverCompanies, getFriendlyAIError } from '@/lib/ai/service'
import { uniqueExternalJobs, type ExternalJob } from '@/lib/jobs/jobtech'
import { searchArbetsformedlingen } from '@/lib/jobs/sources/arbetsformedlingen'
import { isPastDeadline, pageLooksExpired } from '@/lib/jobs/liveness'
import { hasReachedAiLimit } from '@/lib/subscription'

interface DiscoveredCompany {
  name: string
  domain?: string
  industry?: string
  size?: string
  location?: string
  reason: string
  careerPageUrl?: string
  linkedinUrl?: string
  outreachMessage: string
}

function cleanJson(text: string) {
  return text.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim()
}

function isWholeSweden(location: string) {
  return ['sverige', 'sweden', 'hela sverige'].includes(location.trim().toLowerCase())
}

function companyKey(name: string) {
  return name.trim().toLowerCase()
}

function makeOutreach(companyName: string, targetRole: string, liaFocus: boolean) {
  const ask = liaFocus ? 'LIA/praktikplats' : 'roll eller framtida mojlighet'
  return `Hej ${companyName}, jag soker ${ask} inom ${targetRole}. Jag gillar det ni bygger och vill garna hora om ni tar emot kandidater med frontend-, QA- och JavaScript-erfarenhet.`
}

function isLiaLike(job: ExternalJob) {
  return job.isLia || /lia|praktik|praktikplats|praktikant|trainee|internship|intern|apprentice|larling|apl/i.test(`${job.title} ${job.description} ${job.jobType ?? ''}`)
}

function fromExternalJob(job: ExternalJob, targetRole: string, liaFocus: boolean): DiscoveredCompany {
  const opportunity = liaFocus ? 'aktiv LIA/praktik/trainee-annons' : 'aktiv jobbannons'

  return {
    name: job.companyName,
    industry: 'Tech / Digital product',
    location: job.location ?? job.city ?? 'Sverige',
    reason: `${job.companyName} har en ${opportunity} kopplad till ${targetRole}: ${job.title}.`,
    careerPageUrl: job.sourceUrl ?? undefined,
    outreachMessage: makeOutreach(job.companyName, targetRole, liaFocus),
  }
}

async function findCompaniesFromDatabase(targetRole: string, location: string, liaFocus: boolean) {
  const where = {
    isActive: true,
    ...(liaFocus ? { isLia: true } : {}),
    ...(isWholeSweden(location) || !location ? {} : { location: { contains: location, mode: 'insensitive' as const } }),
    OR: [
      { title: { contains: targetRole, mode: 'insensitive' as const } },
      { description: { contains: targetRole, mode: 'insensitive' as const } },
      { requirements: { contains: targetRole, mode: 'insensitive' as const } },
    ],
  }

  const jobs = await prisma.jobListing.findMany({
    where,
    include: { company: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return jobs.map((job) => ({
    name: job.company.name,
    domain: job.company.domain ?? undefined,
    industry: job.company.industry ?? 'Tech / Product',
    size: job.company.companySize ?? undefined,
    location: job.location ?? job.company.location ?? location,
    reason: `${job.company.name} matchar ${targetRole} eftersom de har en aktiv ${liaFocus ? 'LIA/praktik/trainee-mojlighet' : 'jobbannons'}: ${job.title}.`,
    careerPageUrl: job.sourceUrl ?? job.company.careerPageUrl ?? undefined,
    linkedinUrl: job.company.linkedinUrl ?? undefined,
    outreachMessage: makeOutreach(job.company.name, targetRole, liaFocus),
  }))
}

async function findCompaniesFromJobTech(targetRole: string, location: string, liaFocus: boolean) {
  const terms = liaFocus
    ? [targetRole, `${targetRole} LIA`, `${targetRole} praktik`, `${targetRole} trainee`]
    : [targetRole]

  const results = await Promise.allSettled(
    terms.map((term) => searchArbetsformedlingen(term, isWholeSweden(location) ? '' : location, 20))
  )
  const jobs = uniqueExternalJobs(results.flatMap((result) => result.status === 'fulfilled' ? result.value : []))
    .filter((job) => !isPastDeadline(job.closingAt ?? null))
    .filter((job) => !liaFocus || isLiaLike(job))

  const checked = await Promise.allSettled(
    jobs.slice(0, 24).map(async (job) => ({
      job,
      expired: job.sourceUrl ? await pageLooksExpired(job.sourceUrl) : false,
    }))
  )

  return checked
    .flatMap((result) => result.status === 'fulfilled' && !result.value.expired ? [result.value.job] : [])
    .map((job) => fromExternalJob(job, targetRole, liaFocus))
}

function mergeCompanies(...groups: DiscoveredCompany[][]) {
  const merged = new Map<string, DiscoveredCompany>()

  for (const company of groups.flat()) {
    const key = companyKey(company.name)
    if (!key || merged.has(key)) continue
    merged.set(key, company)
  }

  return Array.from(merged.values()).slice(0, 12)
}

function parseAiCompanies(text: string): DiscoveredCompany[] {
  const parsed = JSON.parse(cleanJson(text))
  return Array.isArray(parsed) ? parsed : []
}

function filterAiToActiveSources(aiCompanies: DiscoveredCompany[], sourceCompanies: DiscoveredCompany[]) {
  const sourceNames = new Set(sourceCompanies.map((company) => companyKey(company.name)))
  return aiCompanies.filter((company) => sourceNames.has(companyKey(company.name)))
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthResponse(auth)) return auth

  const { targetRole, location = 'Sverige', liaFocus = false } = await request.json()
  const role = typeof targetRole === 'string' ? targetRole.trim() : ''
  const place = typeof location === 'string' ? location.trim() : 'Sverige'

  if (!role) return NextResponse.json({ error: 'targetRole kravs' }, { status: 400 })

  const cv = await prisma.cV.findFirst({ where: { userId: auth.dbUserId, isActive: true } })
  if (!cv) return NextResponse.json({ error: 'Inget CV hittat' }, { status: 400 })

  const subscription = await prisma.subscription.findUnique({ where: { userId: auth.dbUserId } })
  const [databaseCompanies, jobTechCompanies] = await Promise.all([
    findCompaniesFromDatabase(role, place, Boolean(liaFocus)),
    findCompaniesFromJobTech(role, place, Boolean(liaFocus)),
  ])

  const sourceCompanies = mergeCompanies(databaseCompanies, jobTechCompanies)
  let aiCompanies: DiscoveredCompany[] = []
  let fallback = false

  if (!hasReachedAiLimit(subscription) && sourceCompanies.length > 0) {
    try {
      const result = await discoverCompanies(cv.rawText, role, place, Boolean(liaFocus))
      aiCompanies = filterAiToActiveSources(parseAiCompanies(result), sourceCompanies)

      if (subscription) {
        await prisma.subscription.update({
          where: { userId: auth.dbUserId },
          data: { aiCallsThisMonth: { increment: 1 } },
        })
      }
    } catch (err: unknown) {
      const { message } = getFriendlyAIError(err, 'Sokning misslyckades')
      console.warn('Company AI discovery failed; using active job-source fallback', { message })
      fallback = true
    }
  } else {
    fallback = true
  }

  const companies = mergeCompanies(sourceCompanies, aiCompanies)

  if (!companies.length) {
    return NextResponse.json({
      companies: [],
      fallback: true,
      activeOnly: true,
      message: `Jag hittade inga aktiva ${liaFocus ? 'LIA/praktik/trainee-mojligheter' : 'jobbannonser eller LIA/praktik/trainee-mojligheter'} for ${role} i ${place}. Prova Hela Sverige eller andra sokord.`,
    })
  }

  return NextResponse.json({ companies, fallback, activeOnly: true })
}
