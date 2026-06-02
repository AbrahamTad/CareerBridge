// Scans company ATS portals (Greenhouse, Ashby, Lever) defined in portals.yml.
import { NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/auth'
import { scanPortals } from '@/lib/jobs/portal-scanner'
import { persistExternalJobs } from '@/lib/jobs/persist'

export async function POST() {
  const auth = await requireAuth()
  if (isAuthResponse(auth)) return auth

  const result = await scanPortals()

  if (result.errors.length > 0 && result.scanned === 0) {
    return NextResponse.json(
      { error: result.errors[0]?.error ?? 'Portal scan failed' },
      { status: 503 }
    )
  }

  const { ids, newCount } = await persistExternalJobs(result.jobs)

  return NextResponse.json({
    scanned: result.scanned,
    found: result.jobs.length,
    imported: ids.length,
    newJobs: newCount,
    skipped: result.skipped,
    errors: result.errors.length,
    errorDetails: result.errors.slice(0, 5),
  })
}
