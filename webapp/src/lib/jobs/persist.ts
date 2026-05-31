// Persists normalized external jobs while updating existing records without duplicating ads.
import prisma from '@/lib/prisma'
import { slugify } from '@/lib/utils'
import type { ExternalJob } from './jobtech'

// Upsert source postings and return database IDs for matching and dashboard responses.
export async function persistExternalJobs(jobs: ExternalJob[]) {
  const ids: string[] = []
  let newCount = 0

  for (const job of jobs) {
    const existing = await prisma.jobListing.findFirst({
      where: { externalId: job.externalId, sourceAts: job.sourceAts },
      select: { id: true },
    })

    const isExpiredByDate = job.closingAt ? job.closingAt < new Date(new Date().setHours(0, 0, 0, 0)) : false

    if (existing) {
      // Preserve LIA/remote flags when a later AI search adds stronger context.
      await prisma.jobListing.update({
        where: { id: existing.id },
        data: {
          isActive: isExpiredByDate ? false : undefined,
          sourceUrl: job.sourceUrl === undefined ? undefined : job.sourceUrl,
          isLia: job.isLia ? true : undefined,
          isRemote: job.isRemote ? true : undefined,
          isHybrid: job.isHybrid ? true : undefined,
        },
      })
      ids.push(existing.id)
      continue
    }

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
  }

  return { ids, newCount }
}
