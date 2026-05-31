// Location helpers for whole-country searches and nearby municipality expansion.
import type { Prisma } from '@prisma/client'

export const WEST_SWEDEN_NEARBY_LABEL = 'Västra Götaland'

export const WEST_SWEDEN_NEARBY_MUNICIPALITIES = [
  'Göteborg',
  'Mölndal',
  'Partille',
  'Kungälv',
  'Ale',
  'Lerum',
  'Härryda',
  'Alingsås',
  'Stenungsund',
  'Borås',
  'Trollhättan',
  'Uddevalla',
]

function normalizeLocation(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

export function isWholeSwedenLocation(location: string) {
  return ['sverige', 'sweden', 'hela sverige'].includes(normalizeLocation(location))
}

export function isWestSwedenNearbyLocation(location: string) {
  const normalized = normalizeLocation(location).replace(/\s|-/g, '')
  return ['vastragotaland', 'vastragoteland', 'vgr', 'westgotaland'].includes(normalized)
}

// Expand the regional shortcut into municipalities because JobTech searches plain text locations.
export function expandJobSearchLocations(location: string, maxLocations = 8) {
  const trimmed = location.trim()
  if (!trimmed || isWholeSwedenLocation(trimmed)) return ['']
  if (isWestSwedenNearbyLocation(trimmed)) {
    return WEST_SWEDEN_NEARBY_MUNICIPALITIES.slice(0, maxLocations)
  }
  return [trimmed]
}

export function locationLabelForSearch(location: string) {
  return isWestSwedenNearbyLocation(location) ? WEST_SWEDEN_NEARBY_LABEL : location
}

// Translate UI location filters into Prisma conditions for persisted job listings.
export function buildJobLocationWhere(location: string): Prisma.JobListingWhereInput | null {
  const trimmed = location.trim()
  if (!trimmed || isWholeSwedenLocation(trimmed)) return null

  const places = isWestSwedenNearbyLocation(trimmed) ? WEST_SWEDEN_NEARBY_MUNICIPALITIES : [trimmed]

  return {
    OR: places.flatMap((place) => [
      { location: { contains: place, mode: 'insensitive' as const } },
      { city: { contains: place, mode: 'insensitive' as const } },
    ]),
  }
}
