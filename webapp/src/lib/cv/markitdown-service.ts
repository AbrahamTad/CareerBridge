/**
 * MarkItDown Service
 *
 * Converts uploaded CV files (PDF, DOCX, TXT) to clean, structured Markdown.
 * Achieves the same goals as Microsoft MarkItDown for CV processing —
 * reducing token usage and improving AI accuracy by structuring content.
 *
 * Uses Node.js-native libraries (no Python required):
 *   - mammoth  → DOCX/DOC to HTML, then HTML to Markdown
 *   - pdf-parse → PDF to text, then text to structured Markdown
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Structured CV data extracted from the Markdown content */
export interface CVStructuredData {
  name?: string
  contact?: {
    email?: string
    phone?: string
    location?: string
    linkedin?: string
    github?: string
    website?: string
  }
  education?: Array<{ degree: string; institution: string; period: string }>
  experience?: Array<{
    title: string
    company: string
    period: string
    highlights: string[]
  }>
  skills?: string[]
  languages?: string[]
  certifications?: string[]
  projects?: Array<{ name: string; description: string; technologies: string[] }>
  summary?: string
}

// ─── Section name map (Swedish + English) ────────────────────────────────────

/**
 * Maps normalized section names to a canonical key.
 * Used to detect CV headings in both Swedish and English.
 */
const SECTION_MAP: Record<string, string> = {
  profil: 'profil', profile: 'profil', sammanfattning: 'profil',
  yrkesprofil: 'profil', summary: 'profil', 'om mig': 'profil',
  'professional summary': 'profil',

  arbetslivserfarenhet: 'erfarenhet', erfarenhet: 'erfarenhet',
  'work experience': 'erfarenhet', experience: 'erfarenhet',
  employment: 'erfarenhet', 'professional experience': 'erfarenhet',
  anstallningar: 'erfarenhet',

  utbildning: 'utbildning', education: 'utbildning',
  'akademisk bakgrund': 'utbildning', 'academic background': 'utbildning',

  kompetenser: 'kompetenser', fardigheter: 'kompetenser',
  kunskaper: 'kompetenser', skills: 'kompetenser',
  'tekniska kunskaper': 'kompetenser', 'it-kunskaper': 'kompetenser',
  'kompetenser och it-kunskaper': 'kompetenser', tools: 'kompetenser',
  'technical skills': 'kompetenser', 'core skills': 'kompetenser',

  sprak: 'sprak', languages: 'sprak', 'language skills': 'sprak',

  certifikat: 'certifikat', certifications: 'certifikat',
  certificates: 'certifikat', licenser: 'certifikat', licenses: 'certifikat',

  projekt: 'projekt', projects: 'projekt', portfolio: 'projekt',

  referenser: 'referenser', references: 'referenser',

  kontakt: 'kontakt', contact: 'kontakt', kontaktuppgifter: 'kontakt',
}

// ─── HTML → Markdown ──────────────────────────────────────────────────────────

/**
 * Convert mammoth's HTML output to Markdown.
 * Handles headings, bold, italic, lists, paragraphs, and entities.
 */
function htmlToMarkdown(html: string): string {
  return html
    // headings
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
    // bold / italic
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*')
    // list items
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
    .replace(/<\/(ul|ol)>/gi, '\n')
    // paragraphs and line breaks
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // strip all remaining tags
    .replace(/<[^>]+>/g, '')
    // HTML entities
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

// ─── PDF structure detection ──────────────────────────────────────────────────

/** Normalize a heading candidate for lookup in SECTION_MAP */
function normalizeSectionName(text: string): string {
  return text
    .replace(/^#{1,6}\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/:$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .toLowerCase()
    .trim()
}

/**
 * Add Markdown headings to flat PDF text.
 * pdf-parse gives us raw text without tags — we detect section headings
 * by matching known Swedish/English CV section names and ALL-CAPS lines.
 */
function structurePdfText(rawText: string): string {
  const lines = rawText.split('\n')
  const result: string[] = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { result.push(''); continue }

    const normalized = normalizeSectionName(line)

    if (SECTION_MAP[normalized]) {
      // Known CV section heading
      result.push(`\n## ${line}`)
    } else if (
      line === line.toUpperCase() &&
      line.length >= 3 &&
      line.length <= 60 &&
      /[A-ZÅÄÖ]{3,}/.test(line)
    ) {
      // ALL-CAPS line — many CV templates use this for section headers
      result.push(`\n## ${line}`)
    } else {
      result.push(line)
    }
  }

  return result.join('\n')
}

// ─── Main converter ───────────────────────────────────────────────────────────

/**
 * Convert an uploaded CV file buffer to raw Markdown.
 *
 * - DOCX/DOC: mammoth converts to clean HTML → we convert HTML to Markdown
 * - PDF: pdf-parse extracts text → we add Markdown headings
 * - TXT: returned as-is (already plain text)
 *
 * Throws if the file type is not supported.
 */
export async function convertToMarkdown(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  // Plain text — return directly
  if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
    return buffer.toString('utf-8')
  }

  // DOCX/DOC — use mammoth for best structure preservation
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    const mammoth = await import('mammoth')
    // convertToHtml preserves headings, bold, lists — much richer than extractRawText
    const result = await mammoth.convertToHtml({ buffer })
    return htmlToMarkdown(result.value)
  }

  // PDF — use pdf-parse then detect structure from text patterns
  if (mimeType === 'application/pdf') {
    const pdfParse = (await import('pdf-parse')).default
    const data = await pdfParse(buffer)
    return structurePdfText(data.text)
  }

  throw new Error(
    `Filtypen stöds inte: ${mimeType}. Ladda upp PDF, DOCX eller TXT.`
  )
}

// ─── Markdown cleaner ─────────────────────────────────────────────────────────

/**
 * Clean raw Markdown from file extraction.
 *
 * Removes:
 *   - Duplicate lines (case-insensitive)
 *   - Decorative separator lines (---, ===, etc.)
 *   - More than one consecutive blank line
 *
 * Keeps all useful CV content and Markdown structure.
 */
export function cleanMarkdown(raw: string): string {
  const lines = raw.split('\n')
  const seen = new Set<string>()
  const result: string[] = []
  let blankCount = 0

  for (const rawLine of lines) {
    const line = rawLine.trim()

    // Max one blank line between sections
    if (!line) {
      blankCount++
      if (blankCount <= 1) result.push('')
      continue
    }
    blankCount = 0

    // Skip pure decoration lines (---, ===, ••• etc.)
    if (/^[─═\-_=*•|]{3,}$/.test(line)) continue

    // Skip duplicate lines (deduplicate by normalized text)
    const key = line.toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(key)) continue
    seen.add(key)

    result.push(line)
  }

  return result.join('\n').trim()
}

// ─── Section splitter ─────────────────────────────────────────────────────────

/**
 * Split Markdown into named sections based on ## headings.
 * Returns a map: canonical section name → array of content lines.
 */
function getSections(markdown: string): Record<string, string[]> {
  const sections: Record<string, string[]> = {}
  let current = 'header'
  sections[current] = []

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    if (/^#{1,3}\s+/.test(line)) {
      // Heading detected — map to a canonical section name
      const normalized = normalizeSectionName(line)
      const mapped = SECTION_MAP[normalized] ?? normalized
      current = mapped
      if (!sections[current]) sections[current] = []
      continue
    }

    if (!sections[current]) sections[current] = []
    sections[current].push(line)
  }

  return sections
}

// ─── Contact helpers ──────────────────────────────────────────────────────────

function findEmail(text: string) {
  return text.match(/[\w.+\-]+@[\w\-]+\.[a-z]{2,}/i)?.[0]
}

function findPhone(text: string) {
  return text.match(/(\+?\d[\d\s\-().]{6,}\d)/)?.[0]?.trim()
}

function findLinkedIn(text: string) {
  return text.match(/linkedin\.com\/in\/[\w\-]+/i)?.[0]
}

function findGitHub(text: string) {
  return text.match(/github\.com\/[\w\-]+/i)?.[0]
}

const SWEDISH_LOCATIONS = [
  'göteborg', 'gothenburg', 'stockholm', 'malmö', 'lund', 'Uppsala', 'örebro',
  'linköping', 'västerås', 'helsingborg', 'jönköping', 'norrköping', 'sweden', 'sverige',
]

// ─── Section parsers ──────────────────────────────────────────────────────────

/** Parse education entries: degree, institution, year period */
function parseEducation(
  lines: string[]
): Array<{ degree: string; institution: string; period: string }> {
  const results: Array<{ degree: string; institution: string; period: string }> = []
  let cur: { degree: string; institution: string; period: string } | null = null

  for (const raw of lines) {
    const line = raw.replace(/^[-*•]\s*/, '').trim()
    if (!line) continue

    const yearMatch = line.match(/\b(19|20)\d{2}\b/)

    if (yearMatch && cur) {
      // Line has a year — treat as period info
      cur.period = line.match(/(\b(19|20)\d{2}.*)/)?.[0] ?? ''
      results.push(cur)
      cur = null
    } else if (!cur) {
      cur = { degree: line, institution: '', period: '' }
    } else if (!cur.institution) {
      cur.institution = line
    }
    // Extra lines are ignored to keep entries clean
  }

  if (cur) results.push(cur)
  return results.slice(0, 6)
}

/** Parse work experience entries */
function parseExperience(
  lines: string[]
): Array<{ title: string; company: string; period: string; highlights: string[] }> {
  const results: Array<{
    title: string
    company: string
    period: string
    highlights: string[]
  }> = []
  let cur: (typeof results)[0] | null = null

  for (const raw of lines) {
    const line = raw.replace(/^[-*•]\s*/, '').trim()
    if (!line) continue

    // A line with a year or month abbreviation is a new job entry
    const hasYear = /\b(19|20)\d{2}\b/.test(line)
    const hasMonth =
      /\b(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december|nuv|nuvar|present|idag)\b/i.test(
        line
      )

    if (hasYear || hasMonth) {
      if (cur) results.push(cur)
      cur = { title: line, company: '', period: line, highlights: [] }
    } else if (cur && !cur.company) {
      cur.company = line
    } else if (cur) {
      cur.highlights.push(line)
    }
  }

  if (cur) results.push(cur)
  return results.slice(0, 8)
}

/** Parse project entries */
function parseProjects(
  lines: string[]
): Array<{ name: string; description: string; technologies: string[] }> {
  const results: Array<{ name: string; description: string; technologies: string[] }> = []
  let cur: (typeof results)[0] | null = null

  for (const raw of lines) {
    const line = raw.replace(/^[-*•]\s*/, '').trim()
    if (!line) continue

    // Bold text or a short standalone line signals a new project
    const isBold = /^\*\*[^*]+\*\*/.test(line)
    const isShort = line.length <= 60 && !/[.,:;]/.test(line)

    if (isBold || (isShort && !cur)) {
      if (cur) results.push(cur)
      cur = {
        name: line.replace(/\*\*/g, '').replace(/^#+\s+/, '').trim(),
        description: '',
        technologies: [],
      }
    } else if (cur && !cur.description) {
      cur.description = line
    } else if (cur) {
      // Remaining lines may list technologies
      const words = line.split(/[,|/·\s]+/).filter((w) => w.length >= 2 && w.length <= 25)
      cur.technologies.push(...words.slice(0, 6))
    }
  }

  if (cur) results.push(cur)
  return results.slice(0, 8)
}

// ─── Main structure extractor ─────────────────────────────────────────────────

/**
 * Extract structured CV data from cleaned Markdown.
 *
 * Returns: name, contact info, education, work experience,
 *          skills, languages, certifications, projects, summary.
 *
 * This data is saved to the database and used for AI job matching.
 */
export function extractCVStructure(markdown: string): CVStructuredData {
  const sections = getSections(markdown)
  const headerLines = sections['header'] ?? []
  const headerText = headerLines.join('\n')

  // ── Name: first short line in the header that is not contact data ──
  const name = headerLines.find(
    (line) =>
      line.length >= 3 &&
      line.length <= 80 &&
      !line.includes('@') &&
      !/^https?:\/\//i.test(line) &&
      !/^\+?\d[\d\s\-]{5,}/.test(line) &&
      !/^[-*•]/.test(line)
  )

  // ── Contact: scan header + kontakt section for email, phone, urls ──
  const contactText =
    headerText + '\n' + (sections['kontakt'] ?? []).join('\n') + '\n' + markdown.slice(0, 500)

  const locationLine = headerLines.find((line) =>
    SWEDISH_LOCATIONS.some((loc) => line.toLowerCase().includes(loc))
  )

  const contact: CVStructuredData['contact'] = {}
  const email = findEmail(contactText)
  if (email) contact.email = email
  const phone = findPhone(contactText)
  if (phone) contact.phone = phone
  const linkedin = findLinkedIn(contactText)
  if (linkedin) contact.linkedin = linkedin
  const github = findGitHub(contactText)
  if (github) contact.github = github
  if (locationLine) contact.location = locationLine

  // ── Skills: flatten bullet list from kompetenser section ──
  const skillLines = sections['kompetenser'] ?? []
  const skills = skillLines
    .flatMap((line) =>
      line
        .replace(/^[-*•]\s*/, '')
        .split(/[,|/·]/)
        .map((s) => s.trim())
    )
    .filter((s) => s.length >= 2 && s.length <= 60)

  // ── Languages ──
  const langLines = sections['sprak'] ?? []
  const languages = langLines
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter((s) => s.length >= 2 && s.length <= 80)

  // ── Certifications ──
  const certLines = sections['certifikat'] ?? []
  const certifications = certLines
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean)

  // ── Education, experience, projects ──
  const education = parseEducation(sections['utbildning'] ?? [])
  const experience = parseExperience(sections['erfarenhet'] ?? [])
  const projects = parseProjects(sections['projekt'] ?? [])

  // ── Summary from profil section ──
  const summary = (sections['profil'] ?? []).join(' ').slice(0, 600) || undefined

  return {
    name,
    contact: Object.keys(contact).length ? contact : undefined,
    education: education.length ? education : undefined,
    experience: experience.length ? experience : undefined,
    skills: skills.length ? skills : undefined,
    languages: languages.length ? languages : undefined,
    certifications: certifications.length ? certifications : undefined,
    projects: projects.length ? projects : undefined,
    summary,
  }
}
