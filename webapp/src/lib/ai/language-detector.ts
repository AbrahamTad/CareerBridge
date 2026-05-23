import type { ContentLanguage } from './types'

const SWEDISH_MARKERS = [
  'och', 'att', 'som', 'med', 'for', 'fran', 'till', 'eller', 'inte', 'ska',
  'svenska', 'goteborg', 'molndal', 'vastra gotaland', 'arbetsformedlingen',
  'platsbanken', 'lia', 'praktik', 'yrkeshogskola', 'underskoterska',
  'vard', 'omsorg', 'frontendutvecklare', 'webbutvecklare',
]

const ENGLISH_MARKERS = [
  'and', 'the', 'with', 'from', 'to', 'or', 'not', 'will', 'english',
  'developer', 'engineer', 'manager', 'internship', 'experience',
]

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
}

function countMarkers(text: string, markers: string[]) {
  return markers.reduce((count, marker) => count + (text.includes(marker) ? 1 : 0), 0)
}

export function detectContentLanguage(...parts: Array<string | null | undefined>): ContentLanguage {
  const text = parts.filter(Boolean).join(' ')
  if (!text.trim()) return 'unknown'

  const normalized = normalize(text)
  const swedishCharacters = (text.match(/[åäöÅÄÖ]/g) ?? []).length
  const swedishScore = countMarkers(normalized, SWEDISH_MARKERS) + swedishCharacters
  const englishScore = countMarkers(normalized, ENGLISH_MARKERS)

  if (swedishScore >= 3 && englishScore >= 3) return 'mixed'
  if (swedishScore >= 2 && swedishScore >= englishScore) return 'sv'
  if (englishScore >= 2) return 'en'
  return 'unknown'
}

export function prefersNordicModel(language: ContentLanguage) {
  return language === 'sv' || language === 'mixed'
}
