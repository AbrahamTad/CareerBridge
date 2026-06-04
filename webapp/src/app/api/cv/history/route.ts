import { NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET() {
  const auth = await requireAuth()
  if (isAuthResponse(auth)) return auth

  const cvs = await prisma.generatedCV.findMany({
    where: { userId: auth.dbUserId },
    select: { id: true, jobTitle: true, companyName: true, language: true, createdAt: true, content: true },
    orderBy: { createdAt: 'desc' },
    take: 8,
  })

  return NextResponse.json({ cvs })
}
