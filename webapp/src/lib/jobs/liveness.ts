// Checks closing dates and source pages so expired jobs are hidden from active results.
import prisma from '@/lib/prisma'

const EXPIRED_TEXT_PATTERNS = [
  /position is no longer active/i,
  /ad has expired/i,
  /job is no longer available/i,
  /no longer accepting applications/i,
  /application deadline has passed/i,
  /annonsen.*inte.*aktiv/i,
  /tjänsten.*inte.*aktiv/i,
  /ansökningstiden.*gått ut/i,
]

export function isPastDeadline(value: Date | null) {
  if (!value) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return value < today
}

// Treat page checks as advisory: network failures must not remove valid jobs.
export async function pageLooksExpired(url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3500)

  try {
    const response = await fetch(url, {
      headers: { accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: controller.signal,
    })

    if (response.status === 404 || response.status === 410) return true
    if (!response.ok) return false

    const html = (await response.text()).slice(0, 120000)
    return EXPIRED_TEXT_PATTERNS.some((pattern) => pattern.test(html))
  } catch {
    // Network failures are treated as unknown, not expired, so good jobs are not removed accidentally.
    return false
  } finally {
    clearTimeout(timeout)
  }
}

// Mark expired records inactive while retaining them for history and diagnostics.
export async function verifyActiveJobIds(jobIds: string[], maxChecks = 12) {
  const jobs = await prisma.jobListing.findMany({
    where: { id: { in: jobIds } },
    select: { id: true, sourceUrl: true, closingAt: true },
  })

  const expiredByDeadline = jobs.filter((job) => isPastDeadline(job.closingAt)).map((job) => job.id)
  const candidates = jobs
    .filter((job) => job.sourceUrl && !expiredByDeadline.includes(job.id))
    .slice(0, maxChecks)

  const checked = await Promise.allSettled(
    candidates.map(async (job) => ({
      id: job.id,
      expired: await pageLooksExpired(job.sourceUrl!),
    }))
  )

  const expiredByPage = checked.flatMap((result) => (
    result.status === 'fulfilled' && result.value.expired ? [result.value.id] : []
  ))
  const expiredIds = Array.from(new Set([...expiredByDeadline, ...expiredByPage]))

  if (expiredIds.length) {
    // Expired postings stay in the database for audit/history but disappear from active search results.
    await prisma.jobListing.updateMany({
      where: { id: { in: expiredIds } },
      data: { isActive: false },
    })
  }

  return jobIds.filter((id) => !expiredIds.includes(id))
}
