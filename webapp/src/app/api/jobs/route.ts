import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { buildJobLocationWhere } from '@/lib/jobs/locations'

function visibleSourceUrl(sourceUrl: string | null, sourceAts: string | null) {
  // Demo rows must never expose fake example.com URLs as real job announcements.
  if (!sourceUrl || sourceAts === 'demo' || sourceUrl.includes('example.com')) return null
  return sourceUrl
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthResponse(auth)) return auth

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') ?? ''
  const location = searchParams.get('location') ?? ''
  const ids = searchParams.get('ids')?.split(',').map((id) => id.trim()).filter(Boolean) ?? []
  const lia = searchParams.get('lia') === '1'
  const remote = searchParams.get('remote') === '1'
  const minMatch = Number(searchParams.get('minMatch') ?? '')
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = 20

  const locationWhere = buildJobLocationWhere(location)
  const where: Record<string, unknown> = {
    isActive: true,
    NOT: { sourceAts: 'demo' },
  }

  if (ids.length) {
    // Loading exact imported IDs avoids hiding fresh AI results behind active filters.
    where.id = { in: ids.slice(0, 50) }
  } else if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ]
  }
  if (!ids.length && locationWhere) {
    if (where.OR) {
      where.AND = [{ OR: where.OR }, locationWhere]
      delete where.OR
    } else {
      Object.assign(where, locationWhere)
    }
  }
  if (!ids.length && lia) where.isLia = true
  if (!ids.length && remote) where.isRemote = true
  if (Number.isFinite(minMatch) && minMatch > 0) {
    where.matches = {
      some: {
        userId: auth.dbUserId,
        score: { gte: Math.max(0, Math.min(100, minMatch)) / 20 },
      },
    }
  }

  const [jobs, total] = await Promise.all([
    prisma.jobListing.findMany({
      where,
      include: {
        company: { select: { name: true, logoUrl: true } },
        matches: {
          where: { userId: auth.dbUserId },
          select: {
            score: true,
            tier: true,
            strengths: true,
            missingSkills: true,
            recommendations: true,
            recommendation: true,
            cvImprovement: true,
            aiSummary: true,
            aiReasoning: true,
            rawAnalysis: true,
          },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.jobListing.count({ where }),
  ])

  const enriched = jobs.map((j) => {
    const match = j.matches[0]
    const raw = match?.rawAnalysis && typeof match.rawAnalysis === 'object' && !Array.isArray(match.rawAnalysis)
      ? match.rawAnalysis as Record<string, unknown>
      : {}
    const matchedSkills = Array.isArray(raw.matchedSkills)
      ? raw.matchedSkills.filter((item): item is string => typeof item === 'string')
      : match?.strengths ?? []
    const improvementTips = Array.isArray(raw.improvementTips)
      ? raw.improvementTips.filter((item): item is string => typeof item === 'string')
      : match?.recommendations ?? []

    const breakdown = raw.scoreBreakdown && typeof raw.scoreBreakdown === 'object' && !Array.isArray(raw.scoreBreakdown)
      ? raw.scoreBreakdown as Record<string, number>
      : null

    return {
      ...j,
      sourceUrl: visibleSourceUrl(j.sourceUrl, j.sourceAts),
      match: match ? {
        score: match.score,
        tier: match.tier,
        matchScore: typeof raw.matchScore === 'number' ? raw.matchScore : Math.round(match.score * 20),
        isRecommended: typeof raw.isRecommended === 'boolean' ? raw.isRecommended : match.score >= 2.75,
        matchedSkills,
        missingSkills: match.missingSkills,
        reason: match.aiReasoning ?? match.aiSummary ?? match.recommendation ?? '',
        improvementTips,
        scoreBreakdown: breakdown,
      } : null,
      matches: undefined,
    }
  })

  return NextResponse.json({ jobs: enriched, total, page, pages: Math.ceil(total / limit) })
}
