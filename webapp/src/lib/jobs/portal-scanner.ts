// Scans Greenhouse, Ashby, and Lever APIs using portals.yml from the project root.
// Mirrors the core logic of scan.mjs so the webapp can import company-specific jobs
// without requiring the CLI.
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'
import type { ExternalJob } from './jobtech'

const PORTALS_PATH = join(process.cwd(), '..', 'portals.yml')
const FETCH_TIMEOUT_MS = 10_000

// --- Types from portals.yml ---

interface PortalConfig {
  title_filter?: { positive?: string[]; negative?: string[] }
  tracked_companies?: CompanyEntry[]
}

interface CompanyEntry {
  name: string
  careers_url?: string
  api?: string
  enabled?: boolean
}

interface DetectedApi {
  type: 'greenhouse' | 'ashby' | 'lever'
  url: string
}

// --- API detection (mirrors scan.mjs detectApi) ---

function detectApi(company: CompanyEntry): DetectedApi | null {
  if (company.api?.includes('greenhouse')) {
    return { type: 'greenhouse', url: company.api }
  }

  const url = company.careers_url ?? ''

  const ashby = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/)
  if (ashby) {
    return {
      type: 'ashby',
      url: `https://api.ashbyhq.com/posting-api/job-board/${ashby[1]}?includeCompensation=true`,
    }
  }

  const lever = url.match(/jobs\.lever\.co\/([^/?#]+)/)
  if (lever) {
    return { type: 'lever', url: `https://api.lever.co/v0/postings/${lever[1]}` }
  }

  const ghEu = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/)
  if (ghEu && !company.api) {
    return {
      type: 'greenhouse',
      url: `https://boards-api.greenhouse.io/v1/boards/${ghEu[1]}/jobs`,
    }
  }

  return null
}

// --- Response parsers ---

type RawJob = { title?: string; url?: string; company: string; location?: string }

function parseGreenhouse(json: Record<string, unknown>, company: string): RawJob[] {
  const jobs = Array.isArray(json.jobs) ? json.jobs : []
  return jobs.map((j: Record<string, unknown>) => ({
    title: String(j.title ?? ''),
    url: String(j.absolute_url ?? ''),
    company,
    location: String((j.location as Record<string, unknown>)?.name ?? ''),
  })).filter((j) => j.url)
}

function parseAshby(json: Record<string, unknown>, company: string): RawJob[] {
  const jobs = Array.isArray(json.jobs) ? json.jobs : []
  return jobs.map((j: Record<string, unknown>) => ({
    title: String(j.title ?? ''),
    url: String(j.jobUrl ?? ''),
    company,
    location: String(j.location ?? ''),
  })).filter((j) => j.url)
}

function parseLever(json: unknown, company: string): RawJob[] {
  if (!Array.isArray(json)) return []
  return json.map((j: Record<string, unknown>) => ({
    title: String(j.text ?? ''),
    url: String(j.hostedUrl ?? ''),
    company,
    location: String((j.categories as Record<string, unknown>)?.location ?? ''),
  })).filter((j) => j.url)
}

// --- Title filter ---

function buildFilter(filter?: PortalConfig['title_filter']) {
  const pos = (filter?.positive ?? []).map((k) => k.toLowerCase())
  const neg = (filter?.negative ?? []).map((k) => k.toLowerCase())
  return (title: string) => {
    const t = title.toLowerCase()
    const ok = pos.length === 0 || pos.some((k) => t.includes(k))
    const bad = neg.some((k) => t.includes(k))
    return ok && !bad
  }
}

// --- Fetch with timeout ---

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

// --- Normalise to ExternalJob shape ---

const LIA_RE = /\b(lia|praktik|lärande i arbete|internship|trainee)\b/i

function toExternalJob(raw: RawJob, source: string): ExternalJob {
  const isLia = LIA_RE.test(`${raw.title} ${raw.location}`)
  return {
    title: raw.title ?? '',
    description: '',
    companyName: raw.company,
    location: raw.location ?? null,
    city: null,
    country: 'SE',
    isRemote: /\b(remote|distans)\b/i.test(raw.location ?? ''),
    isHybrid: /\b(hybrid)\b/i.test(raw.location ?? ''),
    isLia,
    sourceUrl: raw.url,
    sourceAts: source,
    externalId: raw.url ?? '',
    jobType: null,
    salary: null,
    postedAt: null,
    closingAt: null,
    companyLogoUrl: null,
  }
}

// --- Public API ---

export interface PortalScanResult {
  jobs: ExternalJob[]
  scanned: number
  errors: { company: string; error: string }[]
  skipped: number
}

export async function scanPortals(options?: { company?: string }): Promise<PortalScanResult> {
  if (!existsSync(PORTALS_PATH)) {
    return { jobs: [], scanned: 0, errors: [{ company: 'config', error: 'portals.yml not found' }], skipped: 0 }
  }

  const config = yaml.load(readFileSync(PORTALS_PATH, 'utf-8')) as PortalConfig
  const companies = config.tracked_companies ?? []
  const titleFilter = buildFilter(config.title_filter)

  const targets = companies
    .filter((c) => c.enabled !== false)
    .filter((c) => !options?.company || c.name.toLowerCase().includes(options.company.toLowerCase()))
    .map((c) => ({ ...c, _api: detectApi(c) }))
    .filter((c) => c._api !== null) as (CompanyEntry & { _api: DetectedApi })[]

  const skipped = companies.filter((c) => c.enabled !== false).length - targets.length

  const jobs: ExternalJob[] = []
  const errors: { company: string; error: string }[] = []
  const seen = new Set<string>()

  await Promise.allSettled(
    targets.map(async (company) => {
      try {
        const json = await fetchJson(company._api.url)
        const raw =
          company._api.type === 'greenhouse' ? parseGreenhouse(json as Record<string, unknown>, company.name)
          : company._api.type === 'ashby' ? parseAshby(json as Record<string, unknown>, company.name)
          : parseLever(json, company.name)

        for (const r of raw) {
          if (!titleFilter(r.title ?? '')) continue
          if (!r.url || seen.has(r.url)) continue
          seen.add(r.url)
          jobs.push(toExternalJob(r, company._api.type))
        }
      } catch (err) {
        errors.push({ company: company.name, error: err instanceof Error ? err.message : String(err) })
      }
    })
  )

  return { jobs, scanned: targets.length, errors, skipped }
}
