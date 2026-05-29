import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { friendlyDbErrorMessage, normalizeDbError } from '@/lib/server/db-errors'

export const dynamic = 'force-dynamic'

export async function GET() {
  const startedAt = Date.now()

  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({
      status: 'ok',
      database: 'reachable',
      responseTimeMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    })
  } catch (error) {
    const normalized = normalizeDbError(error)
    console.warn('Database health check failed', {
      code: normalized.code,
      retryable: normalized.retryable,
      message: normalized.message,
    })

    return NextResponse.json(
      {
        status: 'unavailable',
        database: 'unreachable',
        responseTimeMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        code: normalized.code,
        message: friendlyDbErrorMessage(error),
      },
      { status: 200 }
    )
  }
}
