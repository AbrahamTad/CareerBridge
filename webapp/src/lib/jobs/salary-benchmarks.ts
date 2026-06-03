// Static Swedish salary benchmarks (monthly SEK, gross, 2025-2026).
// Sources: Unionen, Akademikerna, SCB lönestatistik, Medlingsinstitutet.
// Ranges represent junior/entry-level unless noted.

export interface SalaryRange {
  min: number
  max: number
  currency: 'SEK'
  period: 'month'
  level: string
  source: string
}

interface BenchmarkEntry {
  keywords: string[]
  junior: SalaryRange
  mid?: SalaryRange
}

const SEK_MONTH = (min: number, max: number, level = 'Junior/YH'): SalaryRange => ({
  min,
  max,
  currency: 'SEK',
  period: 'month',
  level,
  source: 'Unionen/Medlingsinstitutet 2025',
})

const BENCHMARKS: BenchmarkEntry[] = [
  {
    keywords: ['frontend', 'frontendutvecklare', 'webbutvecklare', 'react developer', 'javascript developer', 'ui developer'],
    junior: SEK_MONTH(28_000, 35_000),
    mid: SEK_MONTH(38_000, 50_000, 'Mid'),
  },
  {
    keywords: ['full stack', 'fullstack', 'full-stack'],
    junior: SEK_MONTH(30_000, 38_000),
    mid: SEK_MONTH(40_000, 53_000, 'Mid'),
  },
  {
    keywords: ['backend developer', 'backend', 'backendutvecklare', 'systemutvecklare', 'software developer', 'software engineer'],
    junior: SEK_MONTH(30_000, 38_000),
    mid: SEK_MONTH(40_000, 55_000, 'Mid'),
  },
  {
    keywords: ['qa', 'test automation', 'testare', 'quality assurance', 'mjukvarutestare', 'qa engineer'],
    junior: SEK_MONTH(27_000, 34_000),
    mid: SEK_MONTH(36_000, 46_000, 'Mid'),
  },
  {
    keywords: ['ux', 'ui designer', 'product designer', 'ux designer', 'interaction designer'],
    junior: SEK_MONTH(27_000, 34_000),
    mid: SEK_MONTH(36_000, 48_000, 'Mid'),
  },
  {
    keywords: ['data scientist', 'machine learning', 'ml engineer', 'ai engineer', 'data analyst'],
    junior: SEK_MONTH(33_000, 43_000),
    mid: SEK_MONTH(45_000, 60_000, 'Mid'),
  },
  {
    keywords: ['devops', 'cloud engineer', 'platform engineer', 'sre', 'site reliability'],
    junior: SEK_MONTH(32_000, 40_000),
    mid: SEK_MONTH(43_000, 58_000, 'Mid'),
  },
  {
    keywords: ['it support', 'servicedesk', 'helpdesk', 'it-tekniker', 'supporttekniker'],
    junior: SEK_MONTH(24_000, 30_000),
    mid: SEK_MONTH(30_000, 38_000, 'Mid'),
  },
  {
    keywords: ['undersköterska', 'vardbitrade', 'vårdbiträde', 'underskoterska'],
    junior: SEK_MONTH(26_000, 32_000, 'Entry'),
    mid: SEK_MONTH(30_000, 36_000, 'Erfaren'),
  },
  {
    keywords: ['stödassistent', 'stodassistent', 'lss', 'boendestödjare', 'boendestod', 'funktionsstöd'],
    junior: SEK_MONTH(24_500, 30_000, 'Entry'),
    mid: SEK_MONTH(28_000, 34_000, 'Erfaren'),
  },
  {
    keywords: ['personlig assistent', 'pa-assistent'],
    junior: SEK_MONTH(23_000, 27_500, 'Entry'),
  },
  {
    keywords: ['hemtjänst', 'hemtjanst', 'hemtjänstpersonal'],
    junior: SEK_MONTH(24_000, 29_500, 'Entry'),
  },
  {
    keywords: ['sjuksköterska', 'sjukskoterska', 'nurse'],
    junior: SEK_MONTH(33_000, 40_000, 'Legitimerad'),
    mid: SEK_MONTH(38_000, 48_000, 'Specialist'),
  },
  {
    keywords: ['socionom', 'socialsekreterare', 'biståndshandläggare'],
    junior: SEK_MONTH(32_000, 40_000, 'Entry'),
    mid: SEK_MONTH(38_000, 48_000, 'Mid'),
  },
  {
    keywords: ['lärare', 'larare', 'grundskollärare', 'gymnasielärare', 'ämneslärare'],
    junior: SEK_MONTH(32_000, 38_000, 'Behörig'),
    mid: SEK_MONTH(38_000, 48_000, 'Erfaren'),
  },
  {
    keywords: ['förskollärare', 'forskollärare', 'forskollarare'],
    junior: SEK_MONTH(30_000, 36_000, 'Behörig'),
  },
  {
    keywords: ['ekonom', 'redovisningsekonom', 'controller', 'ekonomiassistent'],
    junior: SEK_MONTH(27_000, 34_000),
    mid: SEK_MONTH(36_000, 48_000, 'Mid'),
  },
  {
    keywords: ['projektledare', 'project manager', 'scrum master', 'product owner'],
    junior: SEK_MONTH(35_000, 45_000),
    mid: SEK_MONTH(45_000, 60_000, 'Mid'),
  },
]

function normalize(text: string): string {
  return text.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o')
}

// Return a salary benchmark for a job title, or null if no match.
export function getSalaryBenchmark(jobTitle: string, isSenior = false): SalaryRange | null {
  const normalized = normalize(jobTitle)

  for (const entry of BENCHMARKS) {
    const hit = entry.keywords.some((kw) => normalized.includes(normalize(kw)))
    if (!hit) continue
    return (isSenior && entry.mid) ? entry.mid : entry.junior
  }

  return null
}

export function formatSalaryRange(range: SalaryRange): string {
  const fmt = (n: number) => n.toLocaleString('sv-SE')
  return `${fmt(range.min)}–${fmt(range.max)} kr/mån (${range.level})`
}

// True if the title suggests a senior/experienced level.
export function isSeniorTitle(title: string): boolean {
  return /\b(senior|lead|principal|staff|erfaren|specialist|arkitekt)\b/i.test(title)
}
