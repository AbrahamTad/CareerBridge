// Generates personligt brev, LIA/praktik letters, and short editable application emails.
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/auth'
import prisma from '@/lib/prisma'
import {
  canUseLocalAIFallback,
  generateCoverLetter,
  generateEmailApplication,
  generateLiaPraktikLetter,
  getCvText,
  getFriendlyAIError,
} from '@/lib/ai/service'
import { hasReachedAiLimit } from '@/lib/subscription'
import { analyzeAts } from '@/lib/ai/ats-scorer'

type DocumentType = 'cover-letter' | 'lia-praktik-letter' | 'email-application'

// Build a conservative local draft when every configured AI provider is unavailable.
function buildLocalCoverLetter(jobTitle: string, companyName: string, jobDescription: string, language: string, documentType: DocumentType) {
  const keywords = Array.from(new Set(jobDescription.match(/\b[A-Za-zÅÄÖåäö0-9+#.]{4,}\b/g) ?? []))
    .slice(0, 10)
    .join(', ')

  const subject = language === 'en'
    ? `Subject: Application - ${jobTitle}`
    : `Ämne: Ansökan - ${jobTitle}`
  const emailPrefix = documentType === 'email-application' ? `${subject}\n\n` : ''
  const opportunity = documentType === 'lia-praktik-letter'
    ? (language === 'en' ? 'LIA/internship opportunity' : 'LIA-/praktikmöjlighet')
    : (language === 'en' ? 'role' : 'roll')

  // Local fallback gives the user an editable draft when provider quota is exhausted.
  if (language === 'en') {
    return `${emailPrefix}Dear ${companyName},

I am applying for the ${jobTitle} ${opportunity}. I am interested in this opportunity because it connects well with my current direction and the requirements in your advertisement.

Relevant focus areas from the role: ${keywords || 'the responsibilities described in the job advertisement'}.

I would be happy to explain how my background, motivation, and practical experience can contribute to your team. Thank you for considering my application.

Kind regards`
  }

  return `${emailPrefix}Hej ${companyName},

Jag söker ${opportunity} som ${jobTitle}. Tjänsten känns relevant för mig eftersom den matchar min nuvarande inriktning och flera av kraven i er annons.

Relevanta fokusområden från rollen: ${keywords || 'arbetsuppgifterna och kraven i jobbannonsen'}.

Jag berättar gärna mer om hur min bakgrund, motivation och praktiska erfarenhet kan bidra i ert team. Tack för att ni tar er tid att läsa min ansökan.

Vänliga hälsningar`
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthResponse(auth)) return auth

  const body = await request.json()
  const { jobTitle, companyName, jobDescription, language = 'sv', tone = 'professional' } = body
  const documentType: DocumentType =
    // Accept only known document types at the API boundary.
    body.documentType === 'lia-praktik-letter' || body.documentType === 'email-application'
      ? body.documentType
      : 'cover-letter'

  if (!jobTitle || !companyName || !jobDescription) {
    return NextResponse.json({ error: 'jobTitle, companyName och jobDescription krävs' }, { status: 400 })
  }

  const cv = await prisma.cV.findFirst({ where: { userId: auth.dbUserId, isActive: true } })
  if (!cv) return NextResponse.json({ error: 'Inget CV hittat. Ladda upp ett CV först.' }, { status: 400 })

  const subscription = await prisma.subscription.findUnique({ where: { userId: auth.dbUserId } })
  if (hasReachedAiLimit(subscription)) {
    return NextResponse.json({ error: 'AI-gräns nådd' }, { status: 429 })
  }

  try {
    const cvText = getCvText(cv)
    // Route each document type to a focused prompt while keeping one persistence flow.
    const content =
      documentType === 'lia-praktik-letter'
        ? await generateLiaPraktikLetter(cvText, jobTitle, companyName, jobDescription, language as 'en' | 'sv')
        : documentType === 'email-application'
          ? await generateEmailApplication(cvText, jobTitle, companyName, jobDescription, language as 'en' | 'sv')
          : await generateCoverLetter(cvText, jobTitle, companyName, jobDescription, language as 'en' | 'sv', tone)

    const saved = await prisma.coverLetter.create({
      data: {
        userId: auth.dbUserId,
        title: `${jobTitle} – ${companyName} (${documentType})`,
        content,
        jobTitle,
        companyName,
        language,
        tone,
      },
    })

    if (subscription) {
      await prisma.subscription.update({
        where: { userId: auth.dbUserId },
        data: { aiCallsThisMonth: { increment: 1 } },
      })
    }

    const ats = analyzeAts(content, jobDescription)
    return NextResponse.json({ content, id: saved.id, ats })
  } catch (err: unknown) {
    if (canUseLocalAIFallback(err)) {
      const content = buildLocalCoverLetter(jobTitle, companyName, jobDescription, language, documentType)
      const saved = await prisma.coverLetter.create({
        data: {
          userId: auth.dbUserId,
          title: `${jobTitle} – ${companyName} (${documentType})`,
          content,
          jobTitle,
          companyName,
          language,
          tone,
        },
      })

      const ats = analyzeAts(content, jobDescription)
      return NextResponse.json({
        content,
        id: saved.id,
        ats,
        fallback: true,
        message: 'AI services are temporarily limited. CareerBridge generated a draft from your job details.',
      })
    }

    const { message, status } = getFriendlyAIError(err, 'Generering misslyckades')
    return NextResponse.json({ error: message }, { status })
  }
}
