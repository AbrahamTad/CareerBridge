import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { generateInterviewPrep, getCvText, getFriendlyAIError } from '@/lib/ai/service'
import { hasReachedAiLimit } from '@/lib/subscription'

export interface InterviewPrepResult {
  questions: { q: string; tip: string }[]
  salaryTip: string
  cultureNote: string
  watchOut: string[]
  fallback?: boolean
}

function cleanJson(text: string) {
  return text.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim()
}

function localFallback(jobTitle: string, companyName: string): InterviewPrepResult {
  return {
    questions: [
      { q: 'Berätta om dig själv och varför du söker den här tjänsten.', tip: 'Koppla din YH-utbildning och relevanta projekt direkt till rollens krav.' },
      { q: `Varför vill du jobba på ${companyName}?`, tip: 'Visa att du känner till arbetsgivarens verksamhet och nämn något specifikt från deras webbplats eller annons.' },
      { q: `Vad vet du om rollen som ${jobTitle}?`, tip: 'Sammanfatta jobbannonsens viktigaste krav och förklara hur du matchar dem.' },
      { q: 'Beskriv ett projekt eller en situation där du löste ett problem med begränsad information.', tip: 'Använd STAR-strukturen: Situation, Task, Action, Result.' },
      { q: 'Vad är dina styrkor och utvecklingsområden?', tip: 'Välj en styrka som är direkt relevant för rollen. Håll svagheten konstruktiv.' },
    ],
    salaryTip: 'Hämta aktuellt löneläge på Unionen, Medlingsinstitutet, eller Glassdoor för din roll och stad.',
    cultureNote: `Se ${companyName}:s LinkedIn, Glassdoor och karriärsida för insikter om deras kultur och värderingar.`,
    watchOut: ['Läs igenom jobbannonsens must-krav och kontrollera att du kan motivera varje punkt.'],
    fallback: true,
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthResponse(auth)) return auth

  const body = await request.json().catch(() => ({}))
  const jobListingId = typeof body.jobListingId === 'string' ? body.jobListingId : ''
  if (!jobListingId) return NextResponse.json({ error: 'jobListingId krävs' }, { status: 400 })

  const [cv, job] = await Promise.all([
    prisma.cV.findFirst({ where: { userId: auth.dbUserId, isActive: true } }),
    prisma.jobListing.findUnique({ where: { id: jobListingId }, include: { company: true } }),
  ])

  if (!cv) return NextResponse.json({ error: 'Inget CV hittat' }, { status: 400 })
  if (!job) return NextResponse.json({ error: 'Jobbet hittades inte' }, { status: 404 })

  const subscription = await prisma.subscription.findUnique({ where: { userId: auth.dbUserId } })
  if (hasReachedAiLimit(subscription)) {
    return NextResponse.json({ error: 'AI-gräns nådd' }, { status: 429 })
  }

  try {
    const raw = await generateInterviewPrep(getCvText(cv), job.title, job.company.name, job.description)
    const parsed = JSON.parse(cleanJson(raw)) as Partial<InterviewPrepResult>

    const result: InterviewPrepResult = {
      questions: Array.isArray(parsed.questions) ? parsed.questions.filter((q) => q?.q) : [],
      salaryTip: typeof parsed.salaryTip === 'string' ? parsed.salaryTip : '',
      cultureNote: typeof parsed.cultureNote === 'string' ? parsed.cultureNote : '',
      watchOut: Array.isArray(parsed.watchOut) ? parsed.watchOut.filter((w): w is string => typeof w === 'string') : [],
    }

    if (subscription) {
      await prisma.subscription.update({
        where: { userId: auth.dbUserId },
        data: { aiCallsThisMonth: { increment: 1 } },
      })
    }

    return NextResponse.json(result)
  } catch {
    return NextResponse.json(localFallback(job.title, job.company.name))
  }
}
