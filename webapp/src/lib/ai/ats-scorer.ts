// ATS keyword density analysis — compares job description terms against adapted CV text.

export interface AtsScore {
  score: number          // 0–100
  grade: 'A' | 'B' | 'C' | 'D'
  present: string[]      // keywords found in CV
  missing: string[]      // keywords missing from CV
  total: number          // total meaningful keywords extracted
}

// Swedish and English stop words that carry no matching signal.
const STOP_WORDS = new Set([
  'och', 'att', 'för', 'med', 'det', 'som', 'den', 'till', 'från', 'är', 'en', 'ett',
  'på', 'av', 'om', 'men', 'vi', 'du', 'har', 'kan', 'inte', 'de', 'vår', 'din',
  'hos', 'dig', 'inom', 'vid', 'när', 'även', 'vara', 'bli', 'göra', 'ha', 'ta',
  'ge', 'se', 'in', 'ut', 'upp', 'ner', 'sin', 'sig', 'man', 'hur', 'var', 'vad',
  'the', 'and', 'for', 'with', 'that', 'this', 'you', 'are', 'from', 'have', 'will',
  'your', 'our', 'their', 'its', 'not', 'but', 'they', 'can', 'all', 'who', 'more',
  'also', 'about', 'into', 'through', 'we', 'be', 'to', 'of', 'in', 'a', 'an',
  'is', 'it', 'as', 'at', 'or', 'by', 'on', 'do', 'if', 'up', 'so', 'no',
])

// Minimum token length to consider as a keyword.
const MIN_WORD_LENGTH = 3

// Pairs that should be treated as one phrase rather than two tokens.
const PHRASE_PATTERNS = [
  /\breact\s+native\b/gi,
  /\bnode\.js\b/gi,
  /\bnext\.js\b/gi,
  /\bvue\.js\b/gi,
  /\bci\/cd\b/gi,
  /\btest\s+automation\b/gi,
  /\btest\s+driven\b/gi,
  /\bmachine\s+learning\b/gi,
  /\bdeep\s+learning\b/gi,
  /\bfull\s+stack\b/gi,
  /\bback\s*end\b/gi,
  /\bfront\s*end\b/gi,
  /\bscrum\s+master\b/gi,
  /\bproduct\s+owner\b/gi,
  /\bservice\s+desk\b/gi,
  /\bpersonlig\s+assistent\b/gi,
  /\bdaglig\s+verksamhet\b/gi,
  /\bgodkänd\s+kurs\b/gi,
  /\bkörkort\s+[abcde]\b/gi,
]

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
}

function extractPhrases(text: string): { original: string; normalized: string }[] {
  const phrases: { original: string; normalized: string }[] = []
  let remaining = text

  for (const pattern of PHRASE_PATTERNS) {
    remaining = remaining.replace(pattern, (match) => {
      const slug = match.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
      phrases.push({ original: match.trim(), normalized: normalize(match) })
      return ` ${slug} `
    })
  }

  return phrases
}

function tokenize(text: string): string[] {
  return text
    .replace(/[^a-zA-ZåäöÅÄÖ0-9#+.\-_]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.\-_]+|[.\-_]+$/g, '').toLowerCase())
    .filter((t) => t.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(t) && !/^\d+$/.test(t))
}

// Extract the most meaningful terms from a job description.
// Returns terms sorted by frequency (most-mentioned first), capped at 40.
export function extractJobKeywords(jobDescription: string): string[] {
  const phrases = extractPhrases(jobDescription)
  const tokens = tokenize(jobDescription)

  const freq = new Map<string, { display: string; count: number }>()

  // Phrases always win over individual tokens.
  for (const phrase of phrases) {
    const key = phrase.normalized
    freq.set(key, { display: phrase.original, count: (freq.get(key)?.count ?? 0) + 2 })
  }

  for (const token of tokens) {
    const key = normalize(token)
    if (STOP_WORDS.has(key) || key.length < MIN_WORD_LENGTH) continue
    if (!freq.has(key)) {
      freq.set(key, { display: token, count: 1 })
    } else {
      freq.get(key)!.count++
    }
  }

  return [...freq.entries()]
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 40)
    .map(([, v]) => v.display)
}

// Score the CV text against the extracted keywords.
export function scoreAts(cvText: string, keywords: string[]): AtsScore {
  const normalizedCv = normalize(cvText)

  const present: string[] = []
  const missing: string[] = []

  for (const kw of keywords) {
    const key = normalize(kw)
    if (normalizedCv.includes(key)) {
      present.push(kw)
    } else {
      missing.push(kw)
    }
  }

  const total = keywords.length
  const score = total === 0 ? 100 : Math.round((present.length / total) * 100)
  const grade: AtsScore['grade'] = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D'

  return { score, grade, present, missing, total }
}

// Convenience: extract keywords then score in one call.
export function analyzeAts(cvText: string, jobDescription: string): AtsScore {
  const keywords = extractJobKeywords(jobDescription)
  return scoreAts(cvText, keywords)
}
