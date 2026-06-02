import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (isAuthResponse(auth)) return auth

  const { id } = await params
  const body = await request.json()

  const app = await prisma.application.findFirst({
    where: { id, userId: auth.dbUserId },
  })
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.application.update({
    where: { id },
    data: {
      status: body.status ?? undefined,
      notes: body.notes !== undefined ? (body.notes || null) : undefined,
      appliedAt: body.appliedAt ? new Date(body.appliedAt) : body.appliedAt === null ? null : undefined,
      interviewAt: body.interviewAt ? new Date(body.interviewAt) : body.interviewAt === null ? null : undefined,
    },
  })

  return NextResponse.json({ application: updated })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (isAuthResponse(auth)) return auth

  const { id } = await params

  const app = await prisma.application.findFirst({
    where: { id, userId: auth.dbUserId },
  })
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.application.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
