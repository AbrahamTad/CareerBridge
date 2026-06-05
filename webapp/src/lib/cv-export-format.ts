const INTERNAL_SECTION_HEADINGS = new Set([
  'malroll',
  'relevanta nyckelord fran annonsen',
  'utvald cv information',
  'kontroll innan ansokan',
  'kontrollera innan du exporterar',
  'anpassning for rollen',
  'anpassning',
  'tailoring for this role',
  'role tailoring',
  'job matching notes',
  'job match',
  'matchning',
  'matchning med annonsen',
  'matchning mot annonsen',
  'rekommendationer',
  'nyckelord',
  'ai analys',
  'analys',
  'ai analysis',
  'analysis',
])

const CV_HEADING_MAP: Record<string, string> = {
  profil: 'Profil',
  profile: 'Profil',
  yrkesprofil: 'Profil',
  sammanfattning: 'Profil',
  'professional profile': 'Profil',
  kontakt: 'Kontakt',
  kontaktuppgifter: 'Kontakt',
  contact: 'Kontakt',
  'contact information': 'Kontakt',
  arbetslivserfarenhet: 'Arbetslivserfarenhet',
  erfarenhet: 'Arbetslivserfarenhet',
  anstallningar: 'Arbetslivserfarenhet',
  'work experience': 'Arbetslivserfarenhet',
  employment: 'Arbetslivserfarenhet',
  utbildning: 'Utbildning',
  education: 'Utbildning',
  kompetenser: 'Kompetenser och IT-kunskaper',
  fardigheter: 'Kompetenser och IT-kunskaper',
  kunskaper: 'Kompetenser och IT-kunskaper',
  datorkunskaper: 'Kompetenser och IT-kunskaper',
  'it kunskaper': 'Kompetenser och IT-kunskaper',
  'it kompetenser': 'Kompetenser och IT-kunskaper',
  skills: 'Kompetenser och IT-kunskaper',
  'computer skills': 'Kompetenser och IT-kunskaper',
  sprak: 'Språk',
  languages: 'Språk',
  referenser: 'Referenser',
  references: 'Referenser',
}

export type CvDocumentBlock =
  | { type: 'heading'; text: string; level: number }
  | { type: 'paragraph'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'blank' }

const MOJIBAKE_REPLACEMENTS: Record<string, string> = {
  'Ã¥': 'å',
  'Ã¤': 'ä',
  'Ã¶': 'ö',
  'Ã…': 'Å',
  'Ã„': 'Ä',
  'Ã–': 'Ö',
  'â€¢': '•',
  'â€“': '–',
  'â€”': '—',
  'â€˜': '‘',
  'â€™': '’',
  'â€œ': '“',
  'â€': '”',
}

const DECORATIVE_LINE = /^[\s\-=_*•·▪◦‣─═|]{3,}$/
const BULLET_PREFIX = /^\s*[-*+•·▪◦‣]\s+/
const DECORATIVE_ICON = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]\uFE0F?/gu

// Repair common imported-text artifacts while preserving Swedish Unicode characters.
export function normalizeCvCharacters(text: string): string {
  return Object.entries(MOJIBAKE_REPLACEMENTS).reduce(
    (cleaned, [broken, replacement]) => cleaned.replaceAll(broken, replacement),
    text
  )
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF\uFFFD]/g, '')
}

export function cvMarkdownToInlineText(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
}

function normalizeLabel(text: string): string {
  return cvMarkdownToInlineText(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
}

function getHeadingText(line: string): string | null {
  const heading = line.trim().match(/^#{1,6}\s+(.+)$/)
  if (heading) return heading[1]

  const boldHeading = line.trim().match(/^\*\*([^*]+)\*\*:?\s*$/)
  return boldHeading?.[1] ?? null
}

function isHeadingLine(line: string): boolean {
  return /^#{1,6}\s+/.test(line.trim()) || /^\*\*[^*]+\*\*:?\s*$/.test(line.trim())
}

function isInternalHeading(line: string): boolean {
  const heading = getHeadingText(line)
  return heading ? INTERNAL_SECTION_HEADINGS.has(normalizeLabel(heading)) : false
}

function isInstructionLine(line: string): boolean {
  const normalized = normalizeLabel(line.replace(/^[-*•]\s+/, ''))
  return (
    normalized.startsWith('kontrollera ') ||
    normalized.startsWith('lagg till ') ||
    normalized.startsWith('ta bort ') ||
    normalized.startsWith('oppna annonsen') ||
    normalized.startsWith('las igenom och redigera') ||
    normalized.startsWith('se jobbannonsen') ||
    normalized.startsWith('make sure ') ||
    normalized.startsWith('review before ')
  )
}

function isLikelyCandidateName(line: string): boolean {
  const words = line.split(/\s+/).filter(Boolean)
  return (
    words.length >= 2 &&
    words.length <= 5 &&
    line.length <= 80 &&
    /^[\p{L}][\p{L} .'-]+$/u.test(line) &&
    !CV_HEADING_MAP[normalizeLabel(line)]
  )
}

export function removeInternalCvSections(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const cleaned: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!isInternalHeading(line)) {
      cleaned.push(line)
      continue
    }

    index += 1
    while (index < lines.length) {
      const trimmed = lines[index].trim()
      const isNextHeading = isHeadingLine(trimmed)

      if (isNextHeading) {
        index -= 1
        break
      }

      index += 1
    }
  }

  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function cleanCvMarkdown(markdown: string): string {
  const lines = removeInternalCvSections(normalizeCvCharacters(markdown))
    .replace(/^```[\w-]*\s*/gm, '')
    .replace(/```/g, '')
    // Convert Setext-style headings (Heading\n------) to ATX format before line processing strips the underlines
    .replace(/^([^#\n*`>|].+)\n[-=]{3,}\s*$/gm, (_, heading) => `## ${heading.trim()}`)
    .split('\n')

  const cleaned: string[] = []
  let previousHeading = ''
  let hasDocumentContent = false

  for (const rawLine of lines) {
    const line = rawLine
      .replace(DECORATIVE_ICON, '')
      .replace(/^\s*\?{2,}\s+(?=\S)/, '')
      .replace(/[ \t]+/g, ' ')
      .trim()
    const normalizedLine = normalizeLabel(line)

    if (!line) {
      cleaned.push('')
      continue
    }

    // Markdown rules and decorative separators do not belong in a professional CV export.
    if (DECORATIVE_LINE.test(line)) continue

    if (
      normalizedLine.startsWith('anpassat cv') ||
      normalizedLine.startsWith('adapted cv') ||
      normalizedLine.startsWith('cv anpassat for')
    ) {
      continue
    }

    if (isInstructionLine(line)) continue

    const inlineLine = cvMarkdownToInlineText(line)
    if (!hasDocumentContent && isLikelyCandidateName(inlineLine)) {
      cleaned.push(`# ${inlineLine}`)
      hasDocumentContent = true
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      const key = normalizeLabel(heading[2])
      const mappedHeading = CV_HEADING_MAP[key]

      if (key === previousHeading) continue
      previousHeading = key

      cleaned.push(`${heading[1]} ${mappedHeading ?? cvMarkdownToInlineText(heading[2])}`)
      hasDocumentContent = true
      continue
    }

    const boldHeading = line.match(/^\*\*([^*]+)\*\*:?\s*$/)
    if (boldHeading) {
      const key = normalizeLabel(boldHeading[1])
      const mappedHeading = CV_HEADING_MAP[key]
      if (mappedHeading) {
        if (key === previousHeading) continue
        previousHeading = key
        cleaned.push(`## ${mappedHeading}`)
        hasDocumentContent = true
        continue
      }
    }

    // Detect plain-text lines (no # or **) that exactly match a known CV heading name.
    // This handles AI output that uses unhighlighted headings or Setext headings whose
    // underlines were already stripped by the DECORATIVE_LINE filter.
    if (hasDocumentContent && !BULLET_PREFIX.test(line)) {
      const plainKey = normalizeLabel(inlineLine)
      const plainMapped = CV_HEADING_MAP[plainKey]
      if (plainMapped && plainKey !== previousHeading) {
        previousHeading = plainKey
        cleaned.push(`## ${plainMapped}`)
        hasDocumentContent = true
        continue
      }
    }

    previousHeading = ''
    cleaned.push(BULLET_PREFIX.test(line) ? `- ${line.replace(BULLET_PREFIX, '').trim()}` : line)
    hasDocumentContent = true
  }

  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Parse the cleaned CV once so preview, PDF, Word, and text exports share one structure.
export function cvMarkdownToBlocks(markdown: string): CvDocumentBlock[] {
  return cleanCvMarkdown(markdown)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((rawLine): CvDocumentBlock => {
      const line = rawLine.trim()
      if (!line) return { type: 'blank' }

      const heading = line.match(/^(#{1,3})\s+(.+)$/)
      if (heading) {
        return {
          type: 'heading',
          level: heading[1].length,
          text: cvMarkdownToInlineText(heading[2]),
        }
      }

      const boldHeading = line.match(/^\*\*([^*]+)\*\*$/)
      if (boldHeading) {
        return { type: 'heading', level: 3, text: cvMarkdownToInlineText(boldHeading[1]) }
      }

      const bullet = line.match(/^-\s+(.+)$/)
      if (bullet) return { type: 'bullet', text: cvMarkdownToInlineText(bullet[1]) }

      return { type: 'paragraph', text: cvMarkdownToInlineText(line) }
    })
}
