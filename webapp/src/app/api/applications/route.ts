import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET() {
  const auth = await requireAuth()
  if (isAuthResponse(auth)) return auth

  const applications = await prisma.application.findMany({
    where: { userId: auth.dbUserId },
    include: {
      jobListing: {
        select: {
          title: true,
          sourceUrl: true,
          company: { select: { name: true } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({ applications })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthResponse(auth)) return auth

  const body = await request.json()
  const { jobListingId, companyName, jobTitle, jobUrl, status = 'SAVED', score, appliedAt } = body

  let resolvedCompanyName = companyName
  let resolvedJobTitle = jobTitle

  if (jobListingId && !companyName) {
    const listing = await prisma.jobListing.findUnique({
      where: { id: jobListingId },
      include: { company: true },
    })
    resolvedCompanyName = listing?.company.name ?? 'Okänt'
    resolvedJobTitle = listing?.title ?? 'Okänt'
  }

  const application = await prisma.application.create({
    data: {
      userId: auth.dbUserId,
      jobListingId: jobListingId || null,
      companyName: resolvedCompanyName,
      jobTitle: resolvedJobTitle,
      jobUrl: jobUrl || null,
      status,
      score: score ?? null,
      appliedAt: appliedAt ? new Date(appliedAt) : undefined,
    },
  })

  return NextResponse.json({ application }, { status: 201 })
}
