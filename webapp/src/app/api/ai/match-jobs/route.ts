import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireAuth, isAuthResponse } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { analyzeAndSaveJobMatch, buildDeterministicMatch, saveJobMatch } from '@/lib/ai/aiMatchingService'
import { canUseLocalAIFallback, getFriendlyAIError } from '@/lib/ai/service'
import { hasReachedAiLimit } from '@/lib/subscription'

type JobMatchRecord = Awaited<ReturnType<typeof analyzeAndSaveJobMatch>>
type MatchableJob = Prisma.JobListingGetPayload<{ include: { company: true } }>

function matchResponse(jobListingId: string, match: JobMatchRecord) {
  const raw = match.rawAnalysis && typeof match.rawAnalysis === 'object' && !Array.isArray(match.rawAnalysis)
    ? match.rawAnalysis as Record<string, unknown>
    : {}
  const matchScore = typeof raw.matchScore === 'number' ? raw.matchScore : Math.round(match.score * 20)
  const isRecommended = typeof raw.isRecommended === 'boolean' ? raw.isRecommended : matchScore >= 55
  const matchedSkills = Array.isArray(raw.matchedSkills)
    ? raw.matchedSkills.filter((item): item is string => typeof item === 'string')
    : match.strengths
  const improvementTips = Array.isArray(raw.improvementTips)
    ? raw.improvementTips.filter((item): item is string => typeof item === 'string')
    : match.recommendations

  const scoreBreakdown = raw.scoreBreakdown && typeof raw.scoreBreakdown === 'object' && !Array.isArray(raw.scoreBreakdown)
    ? raw.scoreBreakdown as Record<string, number>
    : null

  return {
    jobId: jobListingId,
    matchScore,
    isRecommended,
    matchedSkills,
    missingSkills: match.missingSkills,
    reason: match.aiReasoning ?? match.aiSummary ?? match.recommendation ?? '',
    improvementTips,
    scoreBreakdown,
    match,
  }
}

export async function POST(request: NextRequest) {
  let userId: string | null = null
  let cv: { id: string; rawText: string; parsedData: Prisma.JsonValue | null } | null = null
  let job: MatchableJob | null = null
  let jobListingId = ''

  try {
    const auth = await requireAuth()
    if (isAuthResponse(auth)) return auth
    userId = auth.dbUserId

    const body = await request.json().catch(() => ({}))
    jobListingId = typeof body.jobListingId === 'string' ? body.jobListingId : ''
    if (!jobListingId) return NextResponse.json({ error: 'jobListingId kravs' }, { status: 400 })

    const [activeCv, jobListing] = await Promise.all([
      prisma.cV.findFirst({ where: { userId, isActive: true } }),
      prisma.jobListing.findUnique({ where: { id: jobListingId }, include: { company: true } }),
    ])
    cv = activeCv
    job = jobListing

    if (!cv) return NextResponse.json({ error: 'Inget CV hittat' }, { status: 400 })
    if (!job) return NextResponse.json({ error: 'Jobbet hittades inte' }, { status: 404 })

    const subscription = await prisma.subscription.findUnique({ where: { userId } })
    if (hasReachedAiLimit(subscription)) {
      return NextResponse.json({ error: 'AI-grans nadd' }, { status: 429 })
    }

    const jobMatch = await analyzeAndSaveJobMatch(userId, cv, job)

    if (subscription) {
      await prisma.subscription.update({
        where: { userId },
        data: { aiCallsThisMonth: { increment: 1 } },
      })
    }

    return NextResponse.json(matchResponse(jobListingId, jobMatch))
  } catch (err: unknown) {
    console.error('AI job match route failed', {
      error: err instanceof Error ? err.message : String(err),
    })

    if (userId && cv && job && jobListingId && (canUseLocalAIFallback(err) || err instanceof SyntaxError)) {
      const matchData = buildDeterministicMatch(cv, job)
      const jobMatch = await saveJobMatch(userId, cv.id, jobListingId, matchData)
      return NextResponse.json({ ...matchResponse(jobListingId, jobMatch), fallback: true })
    }

    const { message, status } = getFriendlyAIError(err, 'Matchning misslyckades')
    return NextResponse.json({ error: message }, { status: status >= 500 ? 502 : status })
  }
}
