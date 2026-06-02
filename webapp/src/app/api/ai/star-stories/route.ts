import { NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { generateStarStories, getCvText, getFriendlyAIError } from '@/lib/ai/service'
import { hasReachedAiLimit } from '@/lib/subscription'

export interface StarStory {
  title: string
  situation: string
  task: string
  action: string
  result: string
  tags: string[]
  usefulFor: string[]
}

function cleanJson(text: string) {
  return text.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim()
}

function isStory(v: unknown): v is StarStory {
  return typeof v === 'object' && v !== null && 'title' in v && 'action' in v
}

export async function POST() {
  const auth = await requireAuth()
  if (isAuthResponse(auth)) return auth

  const cv = await prisma.cV.findFirst({ where: { userId: auth.dbUserId, isActive: true } })
  if (!cv) return NextResponse.json({ error: 'Inget CV hittat. Ladda upp ett CV först.' }, { status: 400 })

  const subscription = await prisma.subscription.findUnique({ where: { userId: auth.dbUserId } })
  if (hasReachedAiLimit(subscription)) {
    return NextResponse.json({ error: 'AI-gräns nådd' }, { status: 429 })
  }

  try {
    const raw = await generateStarStories(getCvText(cv))
    const parsed = JSON.parse(cleanJson(raw))
    const stories: StarStory[] = Array.isArray(parsed) ? parsed.filter(isStory) : []

    if (subscription) {
      await prisma.subscription.update({
        where: { userId: auth.dbUserId },
        data: { aiCallsThisMonth: { increment: 1 } },
      })
    }

    return NextResponse.json({ stories })
  } catch (err: unknown) {
    const { message, status } = getFriendlyAIError(err, 'Kunde inte generera stories')
    return NextResponse.json({ error: message }, { status })
  }
}
