import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireAuth, isAuthResponse } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { analyzeCV, getCvText, getFriendlyAIError } from '@/lib/ai/service'
import { cvProfileToParsedData, parseCVProfile } from '@/lib/ai/cv-parser'
import { hasReachedAiLimit } from '@/lib/subscription'

const KNOWN_SKILLS = [
  // IT & Frontend
  'JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js', 'Python',
  'Java', 'C#', 'SQL', 'PostgreSQL', 'Prisma', 'Supabase',
  'HTML', 'CSS', 'Tailwind', 'Styled Components', 'Vue', 'Angular',
  'Git', 'GitHub', 'Docker', 'Azure', 'AWS', 'Figma', 'Jira',
  'Excel', 'Power BI', 'Scrum', 'Agile',
  // QA / Testing
  'Cypress', 'Playwright', 'Jest', 'Testing Library', 'Selenium', 'Postman',
  // AI / Data
  'scikit-learn', 'LightGBM', 'ONNX', 'TensorFlow', 'PyTorch', 'pandas', 'numpy',
  // Healthcare
  'Vård', 'Omsorg', 'Omvårdnad', 'Hemtjänst', 'LSS', 'Journaldokumentation',
  'Medicinering', 'Funktionsstöd', 'Boendestöd', 'Personlig assistans',
  // Education
  'Pedagogik', 'IUP', 'Läroplanen', 'Förskola', 'Grundskola',
  // Trades / Industry
  'El-installation', 'AutoCAD', 'PLC', 'Truckkort', 'Fordonsteknik',
]

const ROLE_PATTERNS = [
  // IT
  { role: 'Frontend Developer', pattern: /\b(frontend|front-end|react|next\.?js|frontendutvecklare)\b/i },
  { role: 'Fullstack Developer', pattern: /\b(fullstack|full-stack|fullstackutvecklare)\b/i },
  { role: 'Backend Developer', pattern: /\b(backend|api|server|backendutvecklare)\b/i },
  { role: 'QA Engineer', pattern: /\b(cypress|playwright|jest|qa|quality assurance|testare|test automation)\b/i },
  { role: 'AI/ML Engineer', pattern: /\b(machine learning|ai engineer|scikit|lightgbm|onnx|tensorflow|pytorch)\b/i },
  { role: 'DevOps Engineer', pattern: /\b(devops|docker|kubernetes|ci\/cd|cloud engineer)\b/i },
  { role: 'UX/UI Designer', pattern: /\b(ux|ui|figma|designer|produktdesigner)\b/i },
  { role: 'Data Analyst', pattern: /\b(data analyst|power bi|tableau|analytics|bi-analytiker)\b/i },
  { role: 'IT Support', pattern: /\b(it support|servicedesk|helpdesk|it-tekniker)\b/i },
  { role: 'Software Developer', pattern: /\b(software developer|systemutvecklare|mjukvaruutvecklare|programmer)\b/i },
  // Healthcare
  { role: 'Undersköterska', pattern: /\b(undersköterska|omvårdnad|vård och omsorg|hemtjänst)\b/i },
  { role: 'Sjuksköterska', pattern: /\b(sjuksköterska|sjukvård|hälso.?och.?sjukvård)\b/i },
  { role: 'Stödassistent', pattern: /\b(stödassistent|LSS|boendestöd|personlig assistent|funktionsstöd)\b/i },
  { role: 'Socionom', pattern: /\b(socionom|socialt arbete|socialsekreterare|socialtjänst)\b/i },
  // Education
  { role: 'Lärare', pattern: /\b(lärare|grundskollärare|ämneslärare|gymnasielärare)\b/i },
  { role: 'Förskollärare', pattern: /\b(förskollärare|förskola|barnomsorg)\b/i },
  { role: 'Elevassistent', pattern: /\b(elevassistent|skolassistent|lärarassistent)\b/i },
  // Trades
  { role: 'Elektriker', pattern: /\b(elektriker|el-installation|elinstallatör)\b/i },
  { role: 'Fordonstekniker', pattern: /\b(bilmekaniker|fordonstekniker|fordon)\b/i },
  { role: 'Ingenjör', pattern: /\b(ingenjör|civilingenjör|konstruktör)\b/i },
]

function unique(values: string[]) {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = value.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function hasWord(text: string, value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
}

function localAnalyzeCV(rawText: string): Prisma.InputJsonObject {
  const normalized = rawText.replace(/\s+/g, ' ').trim()
  const skills = KNOWN_SKILLS.filter((skill) => hasWord(rawText, skill))
  const targetRoles = unique(
    ROLE_PATTERNS
      .filter(({ pattern }) => pattern.test(rawText))
      .map(({ role }) => role)
  ).slice(0, 4)
  const spokenLanguages = unique([
    /\b(swedish|svenska)\b/i.test(rawText) ? 'Swedish' : '',
    /\b(english|engelska)\b/i.test(rawText) ? 'English' : '',
    /\b(arabic|arabiska)\b/i.test(rawText) ? 'Arabic' : '',
    /\b(somali|somaliska)\b/i.test(rawText) ? 'Somali' : '',
    /\b(amharic|amhariska)\b/i.test(rawText) ? 'Amharic' : '',
    /\b(oromo)\b/i.test(rawText) ? 'Oromo' : '',
    /\b(spanish|spanska)\b/i.test(rawText) ? 'Spanish' : '',
    /\b(french|franska)\b/i.test(rawText) ? 'French' : '',
    /\b(german|tyska)\b/i.test(rawText) ? 'German' : '',
  ].filter(Boolean))
  const localProfile = parseCVProfile(rawText)

  return {
    ...cvProfileToParsedData(localProfile),
    skills: unique([...localProfile.skills, ...skills]),
    tools: skills.filter((skill) => ['Git', 'GitHub', 'Docker', 'Figma', 'Excel', 'Power BI'].includes(skill)),
    languages: skills.filter((skill) => ['JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'SQL'].includes(skill)),
    spokenLanguages,
    education: [],
    experience: [],
    projects: [],
    summary: normalized.slice(0, 280),
    targetRoles: localProfile.targetRoles.length ? localProfile.targetRoles : targetRoles,
    seniorityLevel: /\b(senior|lead|principal)\b/i.test(rawText) ? 'senior' : /\b(junior|student|lia|intern)\b/i.test(rawText) ? 'junior' : 'mid',
    source: 'local-fallback',
  }
}

async function saveAnalysis(userId: string, cvId: string, parsedData: Prisma.InputJsonObject) {
  await prisma.cV.update({
    where: { id: cvId },
    data: { parsedData },
  })

  const skills = Array.isArray(parsedData.skills) ? parsedData.skills.filter((skill): skill is string => typeof skill === 'string') : []
  const targetRoles = Array.isArray(parsedData.targetRoles) ? parsedData.targetRoles.filter((role): role is string => typeof role === 'string') : []
  const spokenLanguages = Array.isArray(parsedData.spokenLanguages)
    ? parsedData.spokenLanguages.filter((language): language is string => typeof language === 'string')
    : []

  if (skills.length || targetRoles.length || spokenLanguages.length) {
    await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        skills,
        targetRoles,
        spokenLanguages,
      },
      update: {
        skills: skills.length ? skills : undefined,
        targetRoles: targetRoles.length ? targetRoles : undefined,
        spokenLanguages: spokenLanguages.length ? spokenLanguages : undefined,
      },
    })
  }
}

export async function POST() {
  const auth = await requireAuth()
  if (isAuthResponse(auth)) return auth

  const cv = await prisma.cV.findFirst({
    where: { userId: auth.dbUserId, isActive: true },
  })
  if (!cv) return NextResponse.json({ error: 'Inget CV hittat. Ladda upp ett CV först.' }, { status: 400 })

  const subscription = await prisma.subscription.findUnique({
    where: { userId: auth.dbUserId },
  })
  if (hasReachedAiLimit(subscription)) {
    return NextResponse.json({ error: 'Du har nått din AI-gräns för månaden. Uppgradera till Pro.' }, { status: 429 })
  }

  try {
    const analysisText = await analyzeCV(getCvText(cv))
    // Claude sometimes wraps JSON in markdown code blocks — strip them
    const cleaned = analysisText.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim()

    let parsedData: Prisma.InputJsonObject
    try {
      parsedData = JSON.parse(cleaned) as Prisma.InputJsonObject
    } catch {
      // If Claude returns non-parseable output, store a minimal stub so the CV is still usable
      parsedData = { raw: cleaned, parseError: true }
    }

    await saveAnalysis(auth.dbUserId, cv.id, parsedData)

    if (subscription) {
      await prisma.subscription.update({
        where: { userId: auth.dbUserId },
        data: { aiCallsThisMonth: { increment: 1 } },
      })
    }

    return NextResponse.json({ analysis: parsedData })
  } catch (err: unknown) {
    const { message, status } = getFriendlyAIError(err, 'AI-analys misslyckades')
    console.warn('AI CV analysis failed; using local fallback', { message, status })

    const parsedData = localAnalyzeCV(cv.rawText)
    await saveAnalysis(auth.dbUserId, cv.id, parsedData)

    return NextResponse.json({
      analysis: parsedData,
      warning: message,
      fallback: true,
    })
  }
}
