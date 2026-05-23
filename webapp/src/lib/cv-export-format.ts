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

function markdownToInlineText(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
}

function normalizeLabel(text: string): string {
  return markdownToInlineText(text)
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
  const lines = removeInternalCvSections(markdown)
    .replace(/^```[\w-]*\s*/gm, '')
    .replace(/```/g, '')
    .split('\n')

  const cleaned: string[] = []
  let previousHeading = ''

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const normalizedLine = normalizeLabel(line)

    if (!line.trim()) {
      cleaned.push('')
      continue
    }

    if (
      normalizedLine.startsWith('anpassat cv') ||
      normalizedLine.startsWith('adapted cv') ||
      normalizedLine.startsWith('cv anpassat for')
    ) {
      continue
    }

    if (isInstructionLine(line)) continue

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      const key = normalizeLabel(heading[2])
      const mappedHeading = CV_HEADING_MAP[key]

      if (key === previousHeading) continue
      previousHeading = key

      cleaned.push(`${heading[1]} ${mappedHeading ?? markdownToInlineText(heading[2])}`)
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
        continue
      }
    }

    previousHeading = ''
    cleaned.push(line)
  }

  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
