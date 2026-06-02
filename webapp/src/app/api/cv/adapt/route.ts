import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { adaptCV, getCvText, getFriendlyAIError } from '@/lib/ai/service'
import { AIProviderError } from '@/lib/ai/types'
import { cleanCvMarkdown } from '@/lib/cv-export-format'
import { buildLocalAdaptedCv } from '@/lib/cv/local-adapter'
import { hasReachedAiLimit } from '@/lib/subscription'
import { analyzeAts } from '@/lib/ai/ats-scorer'

const CV_GENERATION_UNAVAILABLE_MESSAGE =
  'CV generation is temporarily unavailable. Please try again later.'

const REQUIRED_CV_HEADINGS = ['profil', 'arbetslivserfarenhet', 'utbildning']

const PROVIDER_ERROR_PATTERNS = [
  /\bAIProviderError\b/i,
  /\bmissing[_\s-]*(api[_\s-]*key|configuration)\b/i,
  /\binvalid[_\s-]*api[_\s-]*key\b/i,
  /\ball[_\s-]*unavailable\b/i,
  /\binvalid[_\s-]*response\b/i,
  /\bprovider request failed\b/i,
  /\brequest could not be sent\b/i,
  /\bunexpected .*response format\b/i,
  /\bHTTP\s*429\b/i,
  /\b429\b.*\b(quota|rate limit|too many requests)\b/i,
  /\b(quota|rate limit|too many requests)\b/i,
  /\bOPENAI_API_KEY\b/i,
  /\bGEMINI_API_KEY\b/i,
  /\bANTHROPIC_API_KEY\b/i,
  /\bAI_SWEDEN_API_KEY\b/i,
  /\bHUGGINGFACE_API_KEY\b/i,
  /\bDEEPSEEK_API_KEY\b/i,
  /\bGROQ_API_KEY\b/i,
  /\bOPENROUTER_API_KEY\b/i,
  /\bOLLAMA_BASE_URL\b/i,
  /\bOllama is not running\b/i,
  /\bAI generation is temporarily unavailable\b/i,
]

function normalizeHeading(text: string) {
  return text
    .replace(/^#{1,6}\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/:$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
}

function validateGeneratedCvContent(content: string) {
  const cleaned = cleanCvMarkdown(content).trim()
  if (!cleaned) return { valid: false, reason: 'empty content', content: cleaned }

  const headings = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^#{1,6}\s+/.test(line) || /^\*\*[^*]+\*\*:?\s*$/.test(line))
    .map(normalizeHeading)

  const missingHeadings = REQUIRED_CV_HEADINGS.filter((heading) => !headings.includes(heading))
  if (missingHeadings.length > 0) {
    return { valid: false, reason: `missing CV sections: ${missingHeadings.join(', ')}`, content: cleaned }
  }

  const errorPattern = PROVIDER_ERROR_PATTERNS.find((pattern) => pattern.test(cleaned))
  if (errorPattern) {
    return { valid: false, reason: `contains provider/error text: ${errorPattern.source}`, content: cleaned }
  }

  return { valid: true, reason: null, content: cleaned }
}

async function saveGeneratedCv(data: {
  userId: string
  jobTitle: string
  companyName: string
  content: string
  language: 'sv' | 'en'
}) {
  return prisma.generatedCV.create({
    data: {
      userId: data.userId,
      title: `${data.jobTitle} – ${data.companyName}`,
      content: data.content,
      jobTitle: data.jobTitle,
      companyName: data.companyName,
      language: data.language,
    },
  })
}

function buildAndValidateLocalCv(cvText: string, jobTitle: string, companyName: string, jobDescription: string) {
  return validateGeneratedCvContent(buildLocalAdaptedCv(cvText, jobTitle, companyName, jobDescription))
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthResponse(auth)) return auth

  const { jobTitle, companyName, jobDescription, language } = await request.json()
  const outputLanguage = language === 'en' ? 'en' : 'sv'
  if (!jobTitle || !companyName || !jobDescription) {
    return NextResponse.json({ error: 'jobTitle, companyName och jobDescription krävs' }, { status: 400 })
  }

  const cv = await prisma.cV.findFirst({ where: { userId: auth.dbUserId, isActive: true } })
  if (!cv) return NextResponse.json({ error: 'Inget CV hittat' }, { status: 400 })

  const subscription = await prisma.subscription.findUnique({ where: { userId: auth.dbUserId } })
  if (hasReachedAiLimit(subscription)) {
    return NextResponse.json({ error: 'AI-gräns nådd' }, { status: 429 })
  }

  // Prefer cleanedMarkdown (structured, token-efficient) over raw text
  const cvText = getCvText(cv)

  try {
    const generatedContent = await adaptCV(cvText, jobTitle, companyName, jobDescription, outputLanguage)
    const validation = validateGeneratedCvContent(generatedContent)

    if (!validation.valid) {
      console.warn('Generated CV saving cancelled because AI output was invalid', {
        userId: auth.dbUserId,
        jobTitle,
        companyName,
        reason: validation.reason,
      })
      return NextResponse.json({ error: CV_GENERATION_UNAVAILABLE_MESSAGE }, { status: 503 })
    }

    const saved = await saveGeneratedCv({
      userId: auth.dbUserId,
      jobTitle,
      companyName,
      content: validation.content,
      language: outputLanguage,
    })

    if (subscription) {
      await prisma.subscription.update({
        where: { userId: auth.dbUserId },
        data: { aiCallsThisMonth: { increment: 1 } },
      })
    }

    const ats = analyzeAts(validation.content, jobDescription)
    return NextResponse.json({ content: validation.content, id: saved.id, ats })
  } catch (err: unknown) {
    if (err instanceof AIProviderError) {
      console.warn('AI CV generation failed; attempting local degraded CV adaptation', {
        userId: auth.dbUserId,
        jobTitle,
        companyName,
        code: err.code,
        provider: err.provider,
        status: err.status,
      })

      const localValidation = buildAndValidateLocalCv(cvText, jobTitle, companyName, jobDescription)
      if (!localValidation.valid) {
        console.warn('Generated CV saving cancelled because local fallback output was invalid', {
          userId: auth.dbUserId,
          jobTitle,
          companyName,
          reason: localValidation.reason,
        })
        return NextResponse.json({ error: CV_GENERATION_UNAVAILABLE_MESSAGE }, { status: 503 })
      }

      const saved = await saveGeneratedCv({
        userId: auth.dbUserId,
        jobTitle,
        companyName,
        content: localValidation.content,
        language: outputLanguage,
      })

      const ats = analyzeAts(localValidation.content, jobDescription)
      return NextResponse.json({
        content: localValidation.content,
        id: saved.id,
        ats,
        fallback: true,
        degraded: true,
        message: 'AI services are temporarily limited. CareerBridge generated a draft using local intelligence and your uploaded CV.',
      })
    }

    const { message, status } = getFriendlyAIError(err, 'Generering misslyckades')
    return NextResponse.json({ error: message }, { status })
  }
}
