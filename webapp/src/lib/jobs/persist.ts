// Persists normalized external jobs while updating existing records without duplicating ads.
import prisma from '@/lib/prisma'
import { slugify } from '@/lib/utils'
import type { ExternalJob } from './jobtech'

// Build a lookup key used to match incoming jobs against existing DB records.
function externalKey(externalId: string, sourceAts: string) {
  return `${externalId}::${sourceAts}`
}

// Upsert source postings and return database IDs for matching and dashboard responses.
// Uses one findMany to pre-load existing records, then parallel upserts — eliminates the N+1
// sequential find-per-job pattern that caused 60–120 DB round-trips per search.
export async function persistExternalJobs(jobs: ExternalJob[]) {
  if (!jobs.length) return { ids: [], newCount: 0 }

  // 1. Collect all (externalId, sourceAts) pairs that have a value — jobs without an
  //    externalId cannot be matched against the DB and must be created fresh.
  const keyed = jobs.filter((j) => j.externalId && j.sourceAts)
  const unkeyed = jobs.filter((j) => !j.externalId || !j.sourceAts)

  // 2. One query to fetch all existing records that match any incoming job.
  const existing = keyed.length
    ? await prisma.jobListing.findMany({
        where: {
          OR: keyed.map((j) => ({ externalId: j.externalId, sourceAts: j.sourceAts })),
        },
        select: { id: true, externalId: true, sourceAts: true },
      })
    : []

  const existingMap = new Map(existing.map((r) => [externalKey(r.externalId!, r.sourceAts!), r.id]))

  const today = new Date(new Date().setHours(0, 0, 0, 0))
  const ids: string[] = []
  let newCount = 0

  // 3. Process all jobs in parallel — updates for known records, creates for new ones.
  await Promise.all(
    jobs.map(async (job) => {
      const isExpiredByDate = job.closingAt ? job.closingAt < today : false
      const key = job.externalId && job.sourceAts ? externalKey(job.externalId, job.sourceAts) : null
      const existingId = key ? existingMap.get(key) : undefined

      if (existingId) {
        await prisma.jobListing.update({
          where: { id: existingId },
          data: {
            isActive: isExpiredByDate ? false : undefined,
            sourceUrl: job.sourceUrl === undefined ? undefined : job.sourceUrl,
            isLia: job.isLia ? true : undefined,
            isRemote: job.isRemote ? true : undefined,
            isHybrid: job.isHybrid ? true : undefined,
          },
        })
        ids.push(existingId)
        return
      }

      // New job — upsert company first, then create listing.
      const companySlug = slugify(job.companyName || 'okand-arbetsgivare')
      const company = await prisma.company.upsert({
        where: { slug: companySlug },
        create: {
          name: job.companyName,
          slug: companySlug,
          logoUrl: job.companyLogoUrl ?? undefined,
          location: job.location ?? undefined,
          city: job.city ?? undefined,
          country: job.country ?? undefined,
        },
        update: {
          logoUrl: job.companyLogoUrl ?? undefined,
          location: job.location ?? undefined,
          city: job.city ?? undefined,
          country: job.country ?? undefined,
        },
      })

      // For unkeyed jobs (no externalId), skip if a listing with the same title+company already
      // exists to avoid duplicates created by repeated searches of the same term.
      if (!key) {
        const duplicate = await prisma.jobListing.findFirst({
          where: { companyId: company.id, title: job.title },
          select: { id: true },
        })
        if (duplicate) {
          ids.push(duplicate.id)
          return
        }
      }

      const created = await prisma.jobListing.create({
        data: {
          companyId: company.id,
          title: job.title,
          description: job.description,
          salary: job.salary ?? undefined,
          location: job.location ?? undefined,
          city: job.city ?? undefined,
          country: job.country ?? undefined,
          isRemote: job.isRemote ?? false,
          isHybrid: job.isHybrid ?? false,
          isLia: job.isLia ?? false,
          jobType: job.jobType ?? undefined,
          sourceUrl: job.sourceUrl ?? undefined,
          sourceAts: job.sourceAts,
          externalId: job.externalId,
          isActive: !isExpiredByDate,
          postedAt: job.postedAt ?? undefined,
          closingAt: job.closingAt ?? undefined,
        },
      })

      ids.push(created.id)
      newCount++
    })
  )

  return { ids, newCount }
}
