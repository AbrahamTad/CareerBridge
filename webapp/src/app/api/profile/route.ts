import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET() {
  const auth = await requireAuth()
  if (isAuthResponse(auth)) return auth

  const profile = await prisma.userProfile.findUnique({
    where: { userId: auth.dbUserId },
  })

  return NextResponse.json({ profile })
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthResponse(auth)) return auth

  const body = await request.json()

  const sharedFields = {
    fullName: body.fullName || null,
    phone: body.phone || null,
    city: body.city || null,
    linkedinUrl: body.linkedinUrl || null,
    githubUrl: body.githubUrl || null,
    targetSalaryMin: body.targetSalaryMin || null,
    targetSalaryMax: body.targetSalaryMax || null,
    bio: body.bio || null,
    liaEnabled: body.liaEnabled ?? false,
    liaDate1Start: body.liaDate1Start ? new Date(body.liaDate1Start) : null,
    liaDate1End: body.liaDate1End ? new Date(body.liaDate1End) : null,
    liaDate2Start: body.liaDate2Start ? new Date(body.liaDate2Start) : null,
    liaDate2End: body.liaDate2End ? new Date(body.liaDate2End) : null,
    targetRoles: body.targetRoles ?? [],
    skills: body.skills ?? [],
  }

  const profile = await prisma.userProfile.upsert({
    where: { userId: auth.dbUserId },
    create: { userId: auth.dbUserId, ...sharedFields },
    update: sharedFields,
  })

  return NextResponse.json({ profile })
}
