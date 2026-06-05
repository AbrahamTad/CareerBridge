// High-level AI tasks used by CV analysis, matching, adaptation, and application writing.
import { completeWithFallback } from './fallback-manager'
import { detectContentLanguage } from './language-detector'
import { providerLabel } from './providers/index'
import { AIProviderError, type CompletionRequest } from './types'

const FACTS_ONLY = 'Use only facts from the CV. Do not invent experience, jobs, education, certificates, dates, or metrics.'

/**
 * Return the best available CV text for AI prompts.
 * Prefers cleanedMarkdown (structured, token-efficient) over rawText.
 * The CV type here is a partial to support both old and new DB records.
 */
export function getCvText(cv: { rawText: string; cleanedMarkdown?: string | null }): string {
  return cv.cleanedMarkdown?.trim() || cv.rawText
}

function shouldTryFallback(error: unknown): error is AIProviderError {
  if (!(error instanceof AIProviderError)) return false
  return true
}

function safeLogAIError(error: AIProviderError) {
  console.error('AI provider request failed', {
    provider: error.provider,
    code: error.code,
    status: error.status,
  })
}

// Convert provider failures into safe messages for API responses without exposing secrets.
export function getFriendlyAIError(error: unknown, fallback = 'AI request failed') {
  if (!(error instanceof AIProviderError)) {
    return { message: fallback, status: 500 }
  }

  safeLogAIError(error)

  if (error.code === 'missing_api_key' || error.code === 'missing_configuration' || error.code === 'all_unavailable') {
    return { message: 'AI provider temporarily unavailable', status: 503 }
  }

  if (error.code === 'invalid_response') {
    return { message: 'AI provider returned an invalid response. Please try again.', status: 502 }
  }

  if (error.code === 'invalid_api_key') {
    return {
      message: `Invalid ${providerLabel(error.provider)} API key. Check your environment variables.`,
      status: 401,
    }
  }

  if (error.code === 'insufficient_permissions') {
    return {
      message: `${providerLabel(error.provider)} token lacks required permissions. Check the provider token scopes.`,
      status: 403,
    }
  }

  if (error.code === 'quota_exceeded' || error.status === 429) {
    return {
      message: `${providerLabel(error.provider)} quota or rate limit reached. Check billing, credits, or rate limits.`,
      status: 429,
    }
  }

  if (error.code === 'server_offline') {
    return {
      message: `${providerLabel(error.provider)} is offline. Check the local server or provider status.`,
      status: 502,
    }
  }

  if (!error.status) {
    return {
      message: `Could not reach ${providerLabel(error.provider)}. Check your internet connection, firewall, or provider status.`,
      status: 502,
    }
  }

  return {
    message: `${providerLabel(error.provider)} request failed. Please try again.`,
    status: error.status && error.status >= 400 && error.status < 500 ? error.status : 502,
  }
}

export function canUseLocalAIFallback(error: unknown) {
  return shouldTryFallback(error)
}

async function complete(request: CompletionRequest): Promise<string> {
  return completeWithFallback(request)
}

export async function analyzeCV(cvText: string): Promise<string> {
  return complete({
    maxTokens: 2048,
    task: 'cv-analysis',
    languageHint: detectContentLanguage(cvText),
    system: `You are an expert CV analyzer covering all Swedish job market sectors: IT/tech, healthcare (vård/omsorg), education (utbildning), trades (yrkesarbeten), transport, and office/economy roles.
The CV may be in plain text or Markdown format with ## section headings. Use the structure when present.
Extract structured information and return ONLY valid JSON:
{
  "name": "candidate full name",
  "skills": ["technical and professional skills"],
  "tools": ["specific tools, software, systems used"],
  "languages": ["programming/technical languages"],
  "spokenLanguages": ["human languages: Swedish, English, Arabic, etc."],
  "education": [{"degree": "", "field": "", "institution": "", "year": ""}],
  "experience": [{"title": "", "company": "", "duration": "", "highlights": []}],
  "projects": [{"name": "", "description": "", "technologies": []}],
  "certifications": ["certifications and licenses"],
  "summary": "2-sentence plain language summary",
  "targetRoles": ["3-6 Swedish AND English job title keywords matching their background, e.g. 'Frontendutvecklare', 'Frontend Developer', 'QA Testare', 'Undersköterska'"],
  "recommendedProfessions": [{"profession": "", "sector": "", "reason": ""}],
  "suitableWorkplaces": [{"name": "", "sector": "", "reason": ""}],
  "upskillingSuggestions": [{"skill": "", "path": "", "reason": ""}],
  "seniorityLevel": "junior|mid|senior",
  "isLIAEligible": true/false,
  "sectors": ["it", "healthcare", "education", "trades", "office"]
}
Include Swedish job titles in targetRoles — they are critical for Swedish job searches.`,
    user: `Analyze this CV and return structured JSON:\n\n${cvText}`,
  })
}

export async function matchJobToCv(cvText: string, jobDescription: string, jobTitle: string): Promise<string> {
  return complete({
    maxTokens: 2048,
    task: 'job-match',
    languageHint: detectContentLanguage(cvText, jobDescription, jobTitle),
    system: `You are an expert career coach and recruiter. Evaluate how well a candidate's CV matches a job description.
Use clear, natural language. Be specific and practical, not generic or robotic.
Reason across CV summary, education, real experience, projects, skills, tools, spoken languages, LIA/internship dates, job title, description, explicit requirements, location, remote/on-site preference, employer context, and junior/student suitability.
Return ONLY a JSON object with:
{
  "matchScore": 0-100,
  "score": 0.0-5.0,
  "tier": "strong|medium|weak",
  "isRecommended": true/false,
  "matchedSkills": ["specific skills or experience that match"],
  "reason": "one grounded paragraph explaining the match",
  "strengths": ["list of matching strengths"],
  "missingSkills": ["skills the candidate lacks"],
  "recommendations": ["specific human-readable suggestions to improve the application"],
  "improvementTips": ["specific ways to improve this application"],
  "recommendation": "short final recommendation for whether to apply",
  "cvImprovement": "one concrete way to improve the CV for this job",
  "suggestedCvImprovements": ["2-4 concrete CV edits for this job"],
  "coverLetterAngle": "suggested cover letter angle grounded in the CV",
  "aiSummary": "2-3 natural sentences explaining the match in plain language",
  "aiReasoning": "one grounded paragraph with concrete evidence from the CV and job ad"
}
Scoring rules:
- You must reject unrelated jobs.
- If the job is not clearly connected to the CV, return matchScore below 50 and isRecommended false.
- Reject jobs that only share one generic keyword without role, sector, or skill evidence.
- Understand Swedish recruiter terms, LIA/praktik language, Arbetsformedlingen/Platsbanken phrasing, and Swedish synonyms such as Frontendutvecklare/Webbutvecklare/React Developer and Underskoterska/Vardbitrade/Stodassistent/LSS/BMSS.
- Do not recommend senior roles to junior/student CVs.
- Do not recommend healthcare, driver, cleaning, restaurant, or warehouse roles for frontend/IT CVs unless the CV explicitly targets that profession.
- Do not recommend jobs requiring licenses/certificates the CV does not show.
Score guide: 90-100 = exceptional, 75-89 = strong, 55-74 = possible, below 55 = not recommended.`,
    user: `Job: ${jobTitle}\n\nJob Description:\n${jobDescription}\n\nCandidate CV:\n${cvText}`,
  })
}

export async function generateCoverLetter(
  cvText: string,
  jobTitle: string,
  companyName: string,
  jobDescription: string,
  language: 'en' | 'sv' = 'sv',
  tone: string = 'professional'
): Promise<string> {
  const langInstruction = language === 'sv'
    ? 'Write the cover letter in Swedish (Svenska).'
    : 'Write the cover letter in English.'

  return complete({
    maxTokens: 1024,
    task: 'cover-letter',
    languageHint: detectContentLanguage(cvText, jobDescription),
    system: `You are an expert cover letter writer. Create a tailored, honest, and compelling cover letter. ${langInstruction} Tone: ${tone}. ${FACTS_ONLY}`,
    user: `Write a cover letter for:\nJob: ${jobTitle} at ${companyName}\n\nJob Description:\n${jobDescription}\n\nCandidate CV:\n${cvText}`,
  })
}

// Generate an honest placement letter for Swedish LIA, praktik, internship, or trainee roles.
export async function generateLiaPraktikLetter(
  cvText: string,
  role: string,
  companyName: string,
  opportunityDescription: string,
  language: 'en' | 'sv' = 'sv'
): Promise<string> {
  const languageInstruction = language === 'sv'
    ? 'Write the letter in Swedish.'
    : 'Write the letter in English.'

  return complete({
    maxTokens: 1024,
    task: 'lia-praktik-letter',
    languageHint: detectContentLanguage(cvText, opportunityDescription),
    system: `You write honest, concise applications for Swedish LIA, praktik, internship, and trainee opportunities. ${languageInstruction}
Explain the candidate's education, relevant skills, learning goals, and how the placement can create value for the workplace. ${FACTS_ONLY}`,
    user: `Write a LIA/praktik application letter for:\nOpportunity: ${role} at ${companyName}\n\nDescription:\n${opportunityDescription}\n\nCandidate CV:\n${cvText}`,
  })
}

// Generate a short email that the user can review and send manually.
export async function generateEmailApplication(
  cvText: string,
  role: string,
  companyName: string,
  opportunityDescription: string,
  language: 'en' | 'sv' = 'sv'
): Promise<string> {
  const languageInstruction = language === 'sv'
    ? 'Write the email in Swedish.'
    : 'Write the email in English.'

  return complete({
    maxTokens: 384,
    task: 'email-application',
    languageHint: detectContentLanguage(cvText, opportunityDescription),
    system: `Write a short, ready-to-edit application email. ${languageInstruction}
Include a clear subject line, a compact message, and a professional closing. Keep the message under 180 words. ${FACTS_ONLY}`,
    user: `Write an application email for:\nRole: ${role} at ${companyName}\n\nDescription:\n${opportunityDescription}\n\nCandidate CV:\n${cvText}`,
  })
}

// Recommend professions and workplaces while keeping the response grounded in the CV.
export async function recommendProfessionsWithAI(cvText: string): Promise<string> {
  return complete({
    maxTokens: 1024,
    task: 'profession-recommendation',
    languageHint: detectContentLanguage(cvText),
    system: `You recommend suitable professions and Swedish workplaces from a candidate CV.
Cover public sector, private employers, LIA, praktik, internships, and trainee paths. Return ONLY JSON:
{
  "professions": [{"profession": "", "sector": "", "reason": "", "searchTerms": []}],
  "workplaces": [{"name": "", "sector": "", "reason": ""}]
}
Keep recommendations grounded in the CV. For care, LSS, äldreomsorg, or undersköterska backgrounds, prioritize nearby care professions before unrelated sectors.`,
    user: `Recommend suitable Swedish professions and workplaces for this CV:\n\n${cvText}`,
  })
}

// Suggest realistic courses and certificates without inventing legal requirements.
export async function generateUpskillingSuggestions(cvText: string, targetRole: string): Promise<string> {
  return complete({
    maxTokens: 1024,
    task: 'upskilling',
    languageHint: detectContentLanguage(cvText, targetRole),
    system: `You are a Swedish career coach. Suggest practical missing skills, courses, certificates, and upskilling paths for the requested profession.
Return ONLY JSON:
{
  "missingSkills": [],
  "courses": [],
  "certificates": [],
  "nextSteps": []
}
Do not claim that a certificate is legally required unless that is explicit and accurate.`,
    user: `Target profession: ${targetRole}\n\nCandidate CV:\n${cvText}`,
  })
}

// Improve Swedish wording while preserving every factual claim from the source document.
export async function improveSwedishText(text: string): Promise<string> {
  return complete({
    maxTokens: 1536,
    task: 'swedish-language-improvement',
    languageHint: 'sv',
    system: `Improve the Swedish language in the supplied career document.
Preserve every factual claim. Keep the tone natural, professional, and concise. Do not add experience, education, certificates, dates, or metrics. Return only the revised text.`,
    user: text,
  })
}

export async function adaptCV(
  cvText: string,
  jobTitle: string,
  companyName: string,
  jobDescription: string,
  language: 'sv' | 'en' = 'sv'
): Promise<string> {
  const languageInstruction = language === 'sv'
    ? 'Write the entire CV in Swedish. Section headings must be in Swedish: Profil, Arbetslivserfarenhet, Utbildning, Kompetenser och IT-kunskaper, Språk, Referenser.'
    : 'Write the CV body content in English. Section headings must still be in Swedish: Profil, Arbetslivserfarenhet, Utbildning, Kompetenser och IT-kunskaper, Språk, Referenser.'

  return complete({
    maxTokens: 3072,
    task: 'cv-adapt',
    languageHint: detectContentLanguage(cvText, jobDescription),
    system: `You are a senior CV writer and career coach. Adapt the candidate's CV to the job posting in a warm, natural, human voice. ${languageInstruction}

Rules:
- Keep every claim honest and grounded in the original CV. Do not invent jobs, certificates, education, employers, dates, tools, languages, or metrics.
- Rewrite in natural language that sounds like a real person, not a template and not AI-generated.
- Prefer simple, confident sentences over buzzwords.
- Write concise, idiomatic Swedish with concrete verbs. Avoid padded phrases, repeated claims, and robotic wording.
- Mirror important words from the job ad only when they genuinely fit the candidate's experience.
- Reorder and emphasize the most relevant experience for this exact role.
- Keep the candidate's personality and practical strengths visible.
- Produce a finished professional CV only, not an AI report or job-match analysis.
- The first heading must be the candidate's full name, not "Anpassat CV", the job title, or the company name.
- Put contact information directly below the name as plain text lines. Do not use emoji, icons, or decorative symbols.
- Use this exact structure and start every section heading with ## (two hash symbols): ## Profil, ## Arbetslivserfarenhet, ## Utbildning, ## Kompetenser och IT-kunskaper, ## Språk, ## Referenser.
- Use bullet points for responsibilities and achievements under experience.
- Do not add horizontal rules, decorative separators, or standalone "---" lines.
- Keep the CV concise enough for 1-2 pages.
- Remove vague filler such as "dynamic", "passionate", "results-driven", "leveraging", and "proven track record" unless the original CV uses them naturally.
- Return only the complete adapted CV in clean markdown.
- Do not add explanation sections such as "Målroll", "Relevanta nyckelord från annonsen", "Utvald CV-information", "Kontroll innan ansökan", "Anpassning för rollen", "Tailoring for this role", notes, comments, instructions, or analysis. The output must be ready to send to an employer.`,
    user: `Adapt this CV for: ${jobTitle} at ${companyName}\n\nJob Description:\n${jobDescription}\n\nOriginal CV:\n${cvText}`,
  })
}

export async function generateJobSearchQueries(cvText: string): Promise<string> {
  return complete({
    maxTokens: 768,
    task: 'job-search',
    languageHint: detectContentLanguage(cvText),
    system: `You are a Swedish job search assistant. Read the candidate's CV and extract search queries for the Swedish job market.
Return ONLY a JSON object:
{
  "titles": ["6-8 job title search terms mixing Swedish and English, e.g. 'Frontendutvecklare', 'Frontend Developer', 'QA Testare', 'Undersköterska' — include Swedish titles as Platsbanken uses them"],
  "skills": ["top 6 skills from the CV most relevant for job matching"],
  "level": "junior|mid|senior",
  "isLIAEligible": true/false,
  "liaTerms": ["2-3 LIA/praktik search terms if the candidate is a YH student, e.g. 'LIA frontendutvecklare', 'praktik QA testare'"],
  "summary": "one sentence describing the candidate"
}
IMPORTANT: Always include Swedish job title terms — these are essential for Swedish Platsbanken searches.`,
    user: `Extract Swedish job search queries from this CV:\n\n${cvText}`,
  })
}

export async function discoverCompanies(
  cvText: string,
  targetRole: string,
  location: string,
  liaFocus: boolean = false
): Promise<string> {
  const context = liaFocus
    ? 'The candidate is looking for LIA (internship) placements at Swedish companies, even if they do not have open job postings.'
    : 'The candidate is actively job searching.'

  return complete({
    maxTokens: 2048,
    task: 'company-discovery',
    languageHint: detectContentLanguage(cvText, targetRole, location),
    system: `You are a company discovery AI helping job seekers find relevant employers. ${context}
Return a JSON array of companies:
[{
  "name": "",
  "domain": "",
  "industry": "",
  "size": "",
  "location": "",
  "reason": "why this company is a good fit",
  "careerPageUrl": "",
  "linkedinUrl": "",
  "outreachMessage": "short personalized outreach message"
}]`,
    user: `Find relevant companies for:\nRole: ${targetRole}\nLocation: ${location}\n\nCandidate CV:\n${cvText.slice(0, 3000)}`,
  })
}

export async function generateStarStories(cvText: string): Promise<string> {
  return complete({
    maxTokens: 2048,
    task: 'interview-prep',
    languageHint: detectContentLanguage(cvText),
    system: `Du är en intervjucoach. Extrahera 4-6 konkreta STAR-historier från kandidatens CV.
STAR = Situation, Task (uppgift), Action (åtgärd), Result (resultat).
Svara ENBART med JSON:
[
  {
    "title": "Kort rubrik för historien (max 8 ord)",
    "situation": "Kortfattad bakgrund och sammanhang",
    "task": "Vad var uppgiften eller utmaningen",
    "action": "Vad kandidaten konkret gjorde",
    "result": "Mätbart eller tydligt resultat",
    "tags": ["relevant kompetens", "nyckelord"],
    "usefulFor": ["Intervjufrågor dessa passar: t.ex. 'Berätta om en utmaning'"]
  }
]
Regler:
- Använd ENBART information från CV:t. Hitta inga på fakta.
- Formulera i första person, aktivt och konkret.
- Om CV:t saknar tydliga resultat, skriv ett trovärdigt antagbart resultat.
- Inkludera roller från IT, vård/omsorg, och andra sektorer om de finns.
- Historier ska vara på svenska om CV:t är på svenska.`,
    user: `Extrahera STAR-historier från detta CV:\n\n${cvText}`,
  })
}

export async function generateInterviewPrep(
  cvText: string,
  jobTitle: string,
  companyName: string,
  jobDescription: string
): Promise<string> {
  return complete({
    maxTokens: 1536,
    task: 'interview-prep',
    languageHint: detectContentLanguage(cvText, jobDescription),
    system: `Du är en erfaren karriärcoach specialiserad på svenska arbetsmarknaden och intervjuer.
Skapa ett konkret intervjuförberedelsematerial baserat på jobbannons och kandidatens CV.
Svara ENBART med JSON:
{
  "questions": [
    { "q": "Intervjufråga på svenska", "tip": "Kort råd om hur kandidaten svarar baserat på CV:t" }
  ],
  "salaryTip": "Realistiskt löneintervall för rollen i Sverige (om möjligt specificera stad)",
  "cultureNote": "Kort om arbetsgivarens kultur, värderingar eller vad de verkar värdesätta baserat på annonsen",
  "watchOut": ["1-2 saker i annonsen som kan vara utmanande eller som kandidaten bör förbereda sig extra på"]
}
Regler:
- 5-6 frågor, blandning av klassiska och rollspecifika.
- Frågorna ska vara specifika för DENNA roll och arbetsgivare, inte generiska.
- Tips ska koppla till kandidatens faktiska CV-innehåll.
- Inga påhittade erfarenheter — basera tips på vad CV:t faktiskt visar.
- Lönetipset ska vara realistiskt (Medlingsinstitutet-nivå, inte för högt).
- Om rollen är LIA/praktik, anpassa frågorna till det.`,
    user: `Jobb: ${jobTitle} på ${companyName}\n\nJobbannons:\n${jobDescription.slice(0, 3000)}\n\nKandidatens CV:\n${cvText.slice(0, 3000)}`,
  })
}
