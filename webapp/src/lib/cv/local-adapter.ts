import { cleanCvMarkdown, normalizeCvCharacters } from '@/lib/cv-export-format'

type SectionKey = 'profile' | 'experience' | 'education' | 'skills' | 'languages' | 'references'

const SECTION_ALIASES: Record<SectionKey, string[]> = {
  profile: ['profil', 'profile', 'sammanfattning', 'yrkesprofil'],
  experience: ['arbetslivserfarenhet', 'erfarenhet', 'work experience', 'employment', 'anstallningar'],
  education: ['utbildning', 'education'],
  skills: ['kompetenser', 'fardigheter', 'kunskaper', 'skills', 'datorkunskaper', 'it kunskaper', 'tools', 'teknik'],
  languages: ['sprak', 'languages'],
  references: ['referenser', 'references'],
}

const ALL_SECTION_ALIASES = new Set(Object.values(SECTION_ALIASES).flat())

function normalize(text: string) {
  return text
    .replace(/^#{1,6}\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/:$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9+#.]+/gi, ' ')
    .trim()
    .toLowerCase()
}

function cleanLine(line: string) {
  return normalizeCvCharacters(line)
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]\uFE0F?/gu, '')
    .replace(/^\s*\?{2,}\s+(?=\S)/, '')
    .replace(/^[-*•]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function extractSection(cvText: string, key: SectionKey, maxLines: number) {
  const aliases = SECTION_ALIASES[key]
  const output: string[] = []
  let active = false

  for (const rawLine of cvText.replace(/\r\n/g, '\n').split('\n')) {
    const line = cleanLine(rawLine)
    const label = normalize(line)
    if (aliases.includes(label)) {
      active = true
      continue
    }

    if (active && ALL_SECTION_ALIASES.has(label)) break
    if (active && line.length > 1) output.push(line)
  }

  return unique(output).slice(0, maxLines)
}

function extractName(cvText: string) {
  return cvText
    .split(/\r?\n/)
    .map(cleanLine)
    .find((line) =>
      line.length >= 4 &&
      line.length <= 70 &&
      !line.includes('@') &&
      !/^https?:\/\//i.test(line) &&
      !/^cv\b/i.test(line) &&
      !ALL_SECTION_ALIASES.has(normalize(line))
    ) ?? 'Kandidat'
}

function extractContact(cvText: string) {
  return unique(
    cvText
      .split(/\r?\n/)
      .slice(0, 28)
      .map(cleanLine)
      .filter((line) => /@|\+?\d[\d\s-]{6,}|linkedin|github|https?:\/\//i.test(line))
  )
    .slice(0, 6)
    .join(' | ')
}

function extractKeywords(jobDescription: string) {
  const stopWords = new Set([
    'och', 'att', 'som', 'for', 'fran', 'till', 'med', 'eller', 'har', 'kan', 'ska',
    'the', 'and', 'with', 'from', 'that', 'you', 'are', 'will', 'this',
  ])

  return unique(
    (jobDescription.match(/\b[A-Za-zÅÄÖåäö0-9+#.]{4,}\b/g) ?? [])
      .map((word) => word.toLowerCase())
      .filter((word) => !stopWords.has(normalize(word)))
  ).slice(0, 10)
}

function matchingSkills(cvText: string, jobDescription: string, fallbackSkills: string[]) {
  const normalizedCv = normalize(cvText)
  const keywords = extractKeywords(jobDescription)
  const matches = keywords.filter((keyword) => normalizedCv.includes(normalize(keyword)))
  return unique([...matches, ...fallbackSkills]).slice(0, 10)
}

function bullets(lines: string[], fallback: string, maxLines = 8) {
  const selected = lines.length ? lines.slice(0, maxLines) : [fallback]
  return selected.map((line) => `- ${line}`).join('\n')
}

export function buildLocalAdaptedCv(cvText: string, jobTitle: string, companyName: string, jobDescription: string) {
  const name = extractName(cvText)
  const contact = extractContact(cvText)
  const profile = extractSection(cvText, 'profile', 3)
  const experience = extractSection(cvText, 'experience', 10)
  const education = extractSection(cvText, 'education', 6)
  const skills = matchingSkills(cvText, jobDescription, extractSection(cvText, 'skills', 10))
  const languages = extractSection(cvText, 'languages', 6)
  const references = extractSection(cvText, 'references', 2)

  // Do not invent personal qualities when the uploaded CV does not include a profile.
  const profileText = profile.join(' ') ||
    `Relevant erfarenhet och utbildning för ${jobTitle}${companyName ? ` hos ${companyName}` : ''} framgår av avsnitten nedan.`

  return cleanCvMarkdown([
    `# ${name}`,
    contact,
    `## Profil\n${profileText}`,
    `## Arbetslivserfarenhet\n${bullets(experience, 'Ej specificerat i uppladdat CV.', 10)}`,
    `## Utbildning\n${bullets(education, 'Ej specificerat i uppladdat CV.', 6)}`,
    `## Kompetenser och IT-kunskaper\n${bullets(skills, 'Ej specificerat i uppladdat CV.', 10)}`,
    `## Språk\n${bullets(languages, 'Ej specificerat i uppladdat CV.', 6)}`,
    `## Referenser\n${references.length ? references.join('\n') : 'Referenser lämnas på begäran.'}`,
  ].filter(Boolean).join('\n\n'))
}
