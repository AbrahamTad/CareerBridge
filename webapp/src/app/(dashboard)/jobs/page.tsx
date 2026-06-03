'use client'

// Dashboard for searching, ranking, and adapting CVs for Swedish job opportunities.
import { useState, useEffect, useRef } from 'react'
import { Search, Filter, Loader2, ExternalLink, BookmarkPlus, BrainCircuit, Sparkles, FileText, Copy, X, MapPin, Download, GraduationCap, CheckCheck } from 'lucide-react'
import { toast } from 'sonner'
import { formatSalary } from '@/lib/utils'
import AISearchProgress, { createAISearchStats } from '@/components/ai/AISearchProgress'
import JobGraphVisualization from '@/components/ai/JobGraphVisualization'
import CvDocumentPreview from '@/components/cv/CvDocumentPreview'
import { EmptyState, PageHero, PageSurface } from '@/components/ui/ModernShell'
import {
  copyCleanText,
  downloadCleanText,
  downloadCleanWordDocument,
  exportCleanPdf,
} from '@/lib/document-actions'
import { cleanCvMarkdown } from '@/lib/cv-export-format'
import type { InterviewPrepResult } from '@/app/api/ai/interview-prep/route'
import { getSalaryBenchmark, formatSalaryRange, isSeniorTitle } from '@/lib/jobs/salary-benchmarks'

interface JobListing {
  id: string
  title: string
  description: string
  location: string | null
  isRemote: boolean
  isHybrid: boolean
  isLia: boolean
  salaryMin: number | null
  salaryMax: number | null
  currency: string | null
  sourceUrl: string | null
  sourceAts: string | null
  postedAt: string | null
  closingAt: string | null
  jobType: string | null
  company: { name: string; logoUrl: string | null }
  match?: {
    score: number
    tier: string
    matchScore?: number
    isRecommended?: boolean
    matchedSkills?: string[]
    missingSkills?: string[]
    reason?: string
    improvementTips?: string[]
    scoreBreakdown?: Record<string, number> | null
  } | null
}

interface SmartSearchResult {
  newJobs: number
  totalFound: number
  imported?: number
  autoMatched: number
  searchedFor?: string[]
  candidateSummary?: string
  source?: string
  location?: string
  searchedLocations?: string[]
  cached?: boolean
  demoMode?: boolean
  canRunDeeper?: boolean
  jobIds?: string[]
  additionalSources?: Array<{
    id: string
    name: string
    description: string
    url: string
  }>
}

type SmartSearchApiResponse = Partial<SmartSearchResult> & {
  total?: number | string
  count?: number | string
  jobsFound?: number | string
  matchesFound?: number | string
}

interface ProfileLocation {
  city?: string | null
  location?: string | null
  targetRoles?: string[]
  skills?: string[]
  liaEnabled?: boolean
  liaDate1Start?: string | null
  liaDate1End?: string | null
  liaDate2Start?: string | null
  liaDate2End?: string | null
}

interface LiaPeriod {
  label: string      // "LIA 1" | "LIA 2"
  start: Date
  end: Date
  shortDate: string  // "sept 2026"
}

function parseLiaPeriods(profile: ProfileLocation): LiaPeriod[] {
  const periods: LiaPeriod[] = []
  if (profile.liaDate1Start && profile.liaDate1End) {
    const start = new Date(profile.liaDate1Start)
    const end = new Date(profile.liaDate1End)
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      periods.push({
        label: 'LIA 1',
        start,
        end,
        shortDate: start.toLocaleDateString('sv-SE', { month: 'short', year: 'numeric' }),
      })
    }
  }
  if (profile.liaDate2Start && profile.liaDate2End) {
    const start = new Date(profile.liaDate2Start)
    const end = new Date(profile.liaDate2End)
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      periods.push({
        label: 'LIA 2',
        start,
        end,
        shortDate: start.toLocaleDateString('sv-SE', { month: 'short', year: 'numeric' }),
      })
    }
  }
  return periods
}

// Return which LIA period(s) this job is relevant for.
// Jobs with closingAt already passed are flagged as possibly closed.
// Jobs without closingAt are assumed relevant for the next upcoming period.
function liaRelevance(
  closingAt: string | null,
  postedAt: string | null,
  periods: LiaPeriod[]
): { tag: string; color: string } | null {
  if (!periods.length) return null
  const now = new Date()
  const closing = closingAt ? new Date(closingAt) : null

  if (closing && closing < now) {
    return { tag: 'Stängd', color: 'bg-slate-100 text-slate-500' }
  }

  for (const period of periods) {
    if (period.start < now) continue // period already started/passed

    // Window: employer posts 90 days before LIA start through period end
    const windowStart = new Date(period.start.getTime() - 90 * 24 * 60 * 60 * 1000)
    const ref = closing ?? (postedAt ? new Date(postedAt) : now)

    if (ref >= windowStart && ref <= period.end) {
      return { tag: period.label, color: 'bg-violet-100 text-violet-700' }
    }
  }

  // No closing date — tag with the soonest upcoming period
  if (!closing) {
    const next = periods.find((p) => p.start > now)
    if (next) return { tag: next.label, color: 'bg-violet-100 text-violet-700' }
  }

  return null
}

interface AdaptedCVResult {
  content: string
  id: string
  jobTitle: string
  companyName: string
  sourceUrl: string | null
  location: string | null
  closingAt: string | null
}

function aiToastMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback
  if (/failed to fetch|load failed|networkerror/i.test(message)) {
    return 'AI provider temporarily unavailable'
  }
  return message || fallback
}

function numberValue(...values: Array<number | string | undefined>) {
  for (const value of values) {
    const parsed = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function normalizeSmartSearchResult(data: SmartSearchApiResponse, fallbackTerm: string): SmartSearchResult {
  const imported = numberValue(data.imported, data.newJobs, data.count)
  return {
    ...data,
    newJobs: numberValue(data.newJobs, data.count, data.imported),
    totalFound: numberValue(data.totalFound, data.total, data.jobsFound, data.imported, data.count, data.newJobs),
    imported,
    autoMatched: numberValue(data.autoMatched, data.matchesFound),
    searchedFor: stringArray(data.searchedFor).length ? stringArray(data.searchedFor) : [fallbackTerm || 'CV-profil'],
    searchedLocations: stringArray(data.searchedLocations),
    candidateSummary: data.candidateSummary || 'Sökningen är klar.',
  }
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobListing[]>([])
  const [loading, setLoading] = useState(true)
  const [smartSearching, setSmartSearching] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [matchingId, setMatchingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')
  const [liaOnly, setLiaOnly] = useState(false)
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [lastSmartResult, setLastSmartResult] = useState<SmartSearchResult | null>(null)
  const [profileLocation, setProfileLocation] = useState('')
  const [adaptingId, setAdaptingId] = useState<string | null>(null)
  const [adaptedCV, setAdaptedCV] = useState<AdaptedCVResult | null>(null)
  const [editingAdaptedCV, setEditingAdaptedCV] = useState(false)
  const [searchProgress, setSearchProgress] = useState(0)
  const [showCached, setShowCached] = useState(true)
  const [showOnlyStrongMatches, setShowOnlyStrongMatches] = useState(true)
  const [graphSkills, setGraphSkills] = useState<string[]>([])
  const [pollingStats, setPollingStats] = useState<import('@/components/ai/AISearchProgress').AISearchProgressStats | null>(null)
  const [liaPeriods, setLiaPeriods] = useState<LiaPeriod[]>([])
  const [interviewPrep, setInterviewPrep] = useState<Record<string, InterviewPrepResult>>({})
  const [prepLoading, setPrepLoading] = useState<string | null>(null)

  const SAVED_SEARCHES_KEY = 'cb_saved_searches'
  type SavedSearch = { id: string; label: string; query: string; location: string; liaOnly: boolean }

  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() => {
    try { return JSON.parse(localStorage.getItem(SAVED_SEARCHES_KEY) ?? '[]') } catch { return [] }
  })

  function persistSearches(list: SavedSearch[]) {
    setSavedSearches(list)
    try { localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(list)) } catch {}
  }

  function handleSaveSearch() {
    if (!query && !liaOnly) { toast.error('Ange en sökterm att spara'); return }
    const label = [query, liaOnly ? 'LIA' : '', location].filter(Boolean).join(' · ')
    const id = Date.now().toString()
    const updated = [...savedSearches, { id, label, query, location, liaOnly }].slice(-8)
    persistSearches(updated)
    toast.success(`Sökning sparad: "${label}"`)
  }

  function handleRunSavedSearch(s: SavedSearch) {
    setQuery(s.query)
    setLocation(s.location)
    setLiaOnly(s.liaOnly)
    setTimeout(() => handleSmartSearch(), 50)
  }

  function handleDeleteSavedSearch(id: string) {
    persistSearches(savedSearches.filter((s) => s.id !== id))
  }
  const activeSearch = useRef<AbortController | null>(null)
  const autoSourceScanDone = useRef(false)
  const lastSearchTerms = Array.isArray(lastSmartResult?.searchedFor) && lastSmartResult.searchedFor.length
    ? lastSmartResult.searchedFor.join(', ')
    : query || 'CV-profil'
  const lastFoundCount = lastSmartResult?.totalFound ?? 0
  const lastImportedCount = lastSmartResult?.imported ?? lastSmartResult?.newJobs ?? 0
  const lastMatchedCount = lastSmartResult?.autoMatched ?? 0

  const searchSteps = [
    'Läser CV och hittar relevanta roller',
    'Söker i Platsbanken och jobbannonser',
    'Filtrerar på område och arbetsplats',
    'Matchar de bästa jobben med AI',
  ]

  useEffect(() => {
    loadProfileLocation()
    // Bootstrap once on mount; later searches and filter actions refresh jobs explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const params = buildJobParams({ query, location, liaOnly, remoteOnly })
    loadJobs(params)
    // Only this toggle should automatically reload the current filter snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOnlyStrongMatches])

  useEffect(() => {
    if (!smartSearching) {
      setPollingStats(null)
      return
    }

    const timer = window.setInterval(() => {
      setSearchProgress((value) => Math.min(94, value + 7))
    }, 900)

    // Poll the SearchTask record in the DB for real stats (runs concurrently with the POST request).
    const pollTimer = window.setInterval(async () => {
      try {
        const res = await fetch('/api/jobs/smart-search')
        if (!res.ok) return
        const data = await res.json() as {
          status?: string
          progress?: number
          currentStep?: string
          sourcesScanned?: number
          jobsFound?: number
          companiesFound?: number
          matchesFound?: number
        }
        if (!data.currentStep) return
        setPollingStats({
          progress: data.progress ?? 0,
          currentStep: data.currentStep,
          sourcesScanned: data.sourcesScanned ?? 0,
          jobsFound: data.jobsFound ?? 0,
          companiesFound: data.companiesFound ?? 0,
          matchesFound: data.matchesFound ?? 0,
          estimatedTime:
            data.status === 'COMPLETED'
              ? 'Almost ready'
              : `${Math.max(3, Math.round((100 - (data.progress ?? 0)) / 5))} sec`,
        })
      } catch {
        // Polling errors are non-fatal; simulated progress continues as fallback.
      }
    }, 1800)

    return () => {
      window.clearInterval(timer)
      window.clearInterval(pollTimer)
    }
  }, [smartSearching])

  function createTimeoutSignal(ms: number) {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), ms)
    return { signal: controller.signal, clear: () => window.clearTimeout(timeout) }
  }

  async function loadJobs(params?: URLSearchParams) {
    setLoading(true)
    try {
      const filteredParams = new URLSearchParams(params)
      if (showOnlyStrongMatches) {
        filteredParams.set('minMatch', '55')
      }
      const queryString = filteredParams.toString()
      const url = queryString ? `/api/jobs?${queryString}` : '/api/jobs'
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        // Sort by match score if available
        const sorted = [...(data.jobs as JobListing[])].sort((a, b) => {
          if (a.match && b.match) return b.match.score - a.match.score
          if (a.match) return -1
          if (b.match) return 1
          return 0
        })
        setJobs(sorted)
        return sorted.length
      }
      return 0
    } finally {
      setLoading(false)
    }
  }

  function buildJobParams(values: { query?: string; location?: string; liaOnly?: boolean; remoteOnly?: boolean }) {
    const params = new URLSearchParams()
    if (values.query) params.set('q', values.query)
    if (values.location) params.set('location', values.location)
    if (values.liaOnly) params.set('lia', '1')
    if (values.remoteOnly) params.set('remote', '1')
    if (showOnlyStrongMatches) params.set('minMatch', '55')
    return params
  }

  async function autoScanIfEmpty(values: { query: string; location: string; liaOnly: boolean; remoteOnly: boolean }) {
    if (autoSourceScanDone.current) return
    autoSourceScanDone.current = true

    // First visit should not stay empty; do a lightweight active source scan before asking for AI.
    setScanning(true)
    try {
      await fetch('/api/jobs/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      await loadJobs(buildJobParams(values))
    } finally {
      setScanning(false)
    }
  }

  async function loadProfileLocation() {
    const res = await fetch('/api/profile')
    if (!res.ok) return
    const data = await res.json() as { profile?: ProfileLocation | null }
    const place = data.profile?.city || data.profile?.location || ''
    const firstRole = data.profile?.targetRoles?.[0] || ''
    const profileSkills = [
      ...(data.profile?.targetRoles ?? []),
      ...(data.profile?.skills ?? []),
    ].filter(Boolean).slice(0, 8)
    if (profileSkills.length) setGraphSkills(profileSkills)
    const defaultValues = {
      query: firstRole,
      location: place || 'Sverige',
      liaOnly: Boolean(data.profile?.liaEnabled),
      remoteOnly: false,
    }

    setProfileLocation(place)
    setQuery((current) => current || defaultValues.query)
    setLiaOnly((current) => current || defaultValues.liaOnly)
    setLiaPeriods(parseLiaPeriods(data.profile ?? {}))
    // Default to all Sweden so AI search does not accidentally narrow to one suburb.
    setLocation((current) => current || defaultValues.location)

    const count = await loadJobs(buildJobParams(defaultValues))
    if (count === 0 && defaultValues.query) {
      await autoScanIfEmpty(defaultValues)
    }
    // Kick off a background portal scan on first load if stale — no await.
    backgroundPortalScan()
  }

  const PORTAL_SCAN_STALE_MS = 4 * 60 * 60 * 1000 // 4 hours
  const PORTAL_SCAN_KEY = 'cb_last_portal_scan'

  function isPortalScanStale(): boolean {
    try {
      const last = localStorage.getItem(PORTAL_SCAN_KEY)
      if (!last) return true
      return Date.now() - Number(last) > PORTAL_SCAN_STALE_MS
    } catch {
      return true
    }
  }

  function markPortalScanned() {
    try { localStorage.setItem(PORTAL_SCAN_KEY, String(Date.now())) } catch {}
  }

  function backgroundPortalScan() {
    if (!isPortalScanStale()) return
    markPortalScanned()
    fetch('/api/jobs/portal-scan', { method: 'POST' }).catch(() => {})
  }

  async function handleSmartSearch(options?: { deeper?: boolean }) {
    setSmartSearching(true)
    setLastSmartResult(null)
    setSearchProgress(options?.deeper ? 18 : 8)
    const controller = new AbortController()
    activeSearch.current = controller
    toast.info('AI läser ditt CV och söker efter matchande jobb...')
    try {
      const res = await fetch('/api/jobs/smart-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, location, liaOnly, remoteOnly, useCache: showCached && !options?.deeper }),
        signal: controller.signal,
      })
      const data = await res.json() as SmartSearchApiResponse & { error?: string }
      if (!res.ok) throw new Error(data.error)
      const result = normalizeSmartSearchResult(data, query)
      setSearchProgress(100)
      setLastSmartResult(result)
      if (Array.isArray(result.searchedFor) && result.searchedFor.length) {
        setGraphSkills(result.searchedFor)
      }
      toast.success(`Hittade ${result.totalFound} jobb, importerade ${result.imported ?? result.newJobs}`)
      // Silently refresh company portal jobs if they haven't been scanned recently.
      backgroundPortalScan()
      const params = new URLSearchParams()
      // Load the exact imported jobs first so active filters do not hide fresh AI results.
      if (Array.isArray(result.jobIds) && result.jobIds.length > 0) {
        params.set('ids', result.jobIds.join(','))
      } else {
        if (query) params.set('q', query)
        if (location) params.set('location', location)
        if (liaOnly) params.set('lia', '1')
        if (remoteOnly) params.set('remote', '1')
      }
      await loadJobs(params)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast.error('Sökningen tog för lång tid. Prova igen med en specifik roll och stad.')
        return
      }
      toast.error(aiToastMessage(err, 'Smart sökning misslyckades'))
    } finally {
      setSmartSearching(false)
      activeSearch.current = null
    }
  }

  function cancelSmartSearch() {
    activeSearch.current?.abort()
    setSmartSearching(false)
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (location) params.set('location', location)
    if (liaOnly) params.set('lia', '1')
    if (remoteOnly) params.set('remote', '1')
    await loadJobs(params)
  }

  async function handleMatch(jobId: string) {
    setMatchingId(jobId)
    try {
      const res = await fetch('/api/ai/match-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobListingId: jobId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.fallback) {
        toast.info('AI provider temporarily unavailable')
      } else if (!data.isRecommended) {
        toast.info('Jobbet matchar inte CV:t tillräckligt tydligt')
      } else {
        toast.success(`Matchningspoäng: ${data.matchScore}/100`)
      }
      setJobs(prev => {
        if (showOnlyStrongMatches && !data.isRecommended) {
          return prev.filter(j => j.id !== jobId)
        }
        const updated = prev.map(j => j.id === jobId ? {
          ...j,
          match: {
            score: data.match.score,
            tier: data.match.tier,
            matchScore: data.matchScore,
            isRecommended: data.isRecommended,
            matchedSkills: data.matchedSkills,
            missingSkills: data.missingSkills,
            reason: data.reason,
            improvementTips: data.improvementTips,
            scoreBreakdown: data.scoreBreakdown ?? null,
          },
        } : j)
        return [...updated].sort((a, b) => {
          if (a.match && b.match) return b.match.score - a.match.score
          if (a.match) return -1
          if (b.match) return 1
          return 0
        })
      })
    } catch (err: unknown) {
      toast.error(aiToastMessage(err, 'AI provider temporarily unavailable'))
    } finally {
      setMatchingId(null)
    }
  }

  async function handleAdaptCV(job: JobListing) {
    setAdaptingId(job.id)
    setAdaptedCV(null)
    setEditingAdaptedCV(false)
    try {
      const res = await fetch('/api/cv/adapt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: job.title,
          companyName: job.company.name,
          jobDescription: job.description,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAdaptedCV({
        content: data.content,
        id: data.id,
        jobTitle: job.title,
        companyName: job.company.name,
        sourceUrl: job.sourceUrl,
        location: job.location,
        closingAt: job.closingAt,
      })
      if (data.fallback) {
        toast.info(data.message || 'AI är inte tillgängligt. Ett lokalt CV-utkast skapades.')
      } else {
        toast.success('Anpassat CV klart')
      }
    } catch (err: unknown) {
      toast.error(aiToastMessage(err, 'AI provider temporarily unavailable'))
    } finally {
      setAdaptingId(null)
    }
  }

  async function copyAdaptedCV() {
    if (!adaptedCV) return
    await copyCleanText(cleanCvMarkdown(adaptedCV.content))
    toast.success('CV kopierat som ren text')
  }

  function exportAdaptedCV() {
    if (!adaptedCV) return
    exportCleanPdf(cleanCvMarkdown(adaptedCV.content), `CV - ${adaptedCV.jobTitle}`, {
      includeTitle: false,
      variant: 'cv',
    })
    toast.success('PDF laddas ner')
  }

  function downloadAdaptedCVWord() {
    if (!adaptedCV) return
    downloadCleanWordDocument(cleanCvMarkdown(adaptedCV.content), `CV - ${adaptedCV.jobTitle}`, {
      variant: 'cv',
    })
    toast.success('Word-fil laddas ner')
  }

  function downloadAdaptedCVText() {
    if (!adaptedCV) return
    downloadCleanText(cleanCvMarkdown(adaptedCV.content), `CV - ${adaptedCV.jobTitle}`)
    toast.success('Textfil laddas ner')
  }

  function formatDate(date: string | null) {
    if (!date) return 'Se jobbannonsen'
    return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium' }).format(new Date(date))
  }

  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())

  async function handleSave(jobId: string) {
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobListingId: jobId, status: 'SAVED' }),
      })
      if (!res.ok) throw new Error()
      toast.success('Jobb sparat i dina ansökningar')
    } catch {
      toast.error('Kunde inte spara jobbet')
    }
  }

  async function handleMarkApplied(jobId: string, jobTitle: string, companyName: string) {
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobListingId: jobId,
          status: 'APPLIED',
          appliedAt: new Date().toISOString(),
        }),
      })
      if (!res.ok) throw new Error()
      setAppliedIds((prev) => new Set(prev).add(jobId))
      toast.success(`Markerat som ansökt — ${jobTitle} hos ${companyName}`)
    } catch {
      toast.error('Kunde inte markera som ansökt')
    }
  }

  async function handleInterviewPrep(jobId: string) {
    if (interviewPrep[jobId]) return // already loaded — toggle handled in panel
    setPrepLoading(jobId)
    try {
      const res = await fetch('/api/ai/interview-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobListingId: jobId }),
      })
      const data = await res.json() as InterviewPrepResult & { error?: string }
      if (!res.ok) throw new Error(data.error)
      setInterviewPrep((prev) => ({ ...prev, [jobId]: data }))
      if (data.fallback) toast.info('AI inte tillgänglig — visar generella förberedelsefrågor')
    } catch {
      toast.error('Kunde inte generera intervjuförberedelse')
    } finally {
      setPrepLoading(null)
    }
  }

  async function handleScanPortals() {
    setScanning(true)
    const timeout = createTimeoutSignal(60000)
    try {
      // Run JobTech + company portals in parallel.
      const [jobtechRes, portalRes] = await Promise.allSettled([
        fetch('/api/jobs/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, location, liaOnly }),
          signal: timeout.signal,
        }),
        fetch('/api/jobs/portal-scan', { method: 'POST' }),
      ])

      const jobtechData = jobtechRes.status === 'fulfilled' && jobtechRes.value.ok
        ? await jobtechRes.value.json() as { count?: number; imported?: number }
        : null

      const portalData = portalRes.status === 'fulfilled' && portalRes.value.ok
        ? await portalRes.value.json() as { scanned?: number; newJobs?: number; errors?: number }
        : null

      const totalNew = (jobtechData?.count ?? 0) + (portalData?.newJobs ?? 0)
      const portalMsg = portalData ? ` · ${portalData.scanned ?? 0} portaler skannade` : ''
      toast.success(`Skanning klar — ${totalNew} nya jobb${portalMsg}`)

      const params = new URLSearchParams()
      if (query) params.set('q', query)
      if (location) params.set('location', location)
      if (liaOnly) params.set('lia', '1')
      if (remoteOnly) params.set('remote', '1')
      await loadJobs(params)
    } catch {
      toast.error('Scanning misslyckades')
    } finally {
      timeout.clear()
      setScanning(false)
    }
  }

  const tierColors: Record<string, string> = {
    strong: 'bg-green-100 text-green-700',
    medium: 'bg-yellow-100 text-yellow-700',
    weak: 'bg-red-100 text-red-700',
  }

  const tierLabel: Record<string, string> = {
    strong: 'Stark match',
    medium: 'Bra match',
    weak: 'Svag match',
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="AI graph search"
        title="Job search that shows its work"
        description="Build a live candidate graph, scan sources in parallel, discover company nodes, and rank the best matches without hiding the AI process."
      >
        {/* Primary actions keep scan, cached search, and deeper search close together. */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleSmartSearch()}
            disabled={smartSearching || scanning}
            className="flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
          >
            {smartSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {smartSearching ? 'Searching...' : 'AI Search Job'}
          </button>
          <button
            onClick={() => handleSmartSearch({ deeper: true })}
            disabled={smartSearching || scanning}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
          >
            Run deeper search
          </button>
          {smartSearching && (
            <button onClick={cancelSmartSearch} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10">
              Cancel search
            </button>
          )}
          <label className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-slate-200">
            <input type="checkbox" checked={showCached} onChange={(e) => setShowCached(e.target.checked)} className="rounded" />
            Show cached results
          </label>
        </div>
      </PageHero>
      {/* Header */}
      <div className="hidden items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Jobbsökning</h1>
          <p className="mt-1 text-slate-500">AI söker och matchar jobb baserat på ditt CV</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleScanPortals}
            disabled={scanning || smartSearching}
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Skanna
          </button>
          <button
            onClick={() => handleSmartSearch()}
            disabled={smartSearching || scanning}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {smartSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {smartSearching ? 'Söker...' : 'Sök med CV'}
          </button>
        </div>
      </div>

      {/* Smart search result banner */}
      {lastSmartResult && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-blue-900">{lastSmartResult.candidateSummary || 'Sökningen är klar.'}</p>
              <p className="mt-1 text-xs text-blue-700">
                Sökte efter: <span className="font-medium">{lastSearchTerms}</span>
                {' · '}{lastFoundCount} jobb hittade · {lastImportedCount} importerade
                {lastMatchedCount > 0 ? ` · ${lastMatchedCount} AI-matchade` : ''}
                {lastSmartResult.source ? ` · ${lastSmartResult.source}` : ''}
                {lastSmartResult.searchedLocations?.length ? ` · Områden: ${lastSmartResult.searchedLocations.join(', ')}` : ''}
              </p>
            </div>
            <button onClick={() => setLastSmartResult(null)} className="shrink-0 text-blue-400 hover:text-blue-600">✕</button>
          </div>
          {lastSmartResult.additionalSources?.length ? (
            <details className="mt-3 border-t border-blue-200 pt-3">
              <summary className="cursor-pointer text-xs font-semibold text-blue-900">
                Visa fler svenska jobbkällor ({lastSmartResult.additionalSources.length})
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {lastSmartResult.additionalSources.map((source) => (
                  <a
                    key={source.id}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-blue-100 bg-white p-3 text-xs text-slate-700 hover:border-blue-300 hover:shadow-sm"
                  >
                    <span className="font-semibold text-blue-800">{source.name}</span>
                    <span className="mt-1 block text-slate-500">{source.description}</span>
                  </a>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      )}

      {/* LIA period info banner */}
      {liaOnly && liaPeriods.length > 0 && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm">
          <span className="font-semibold text-violet-900">Dina LIA-perioder: </span>
          {liaPeriods.map((p, i) => (
            <span key={p.label} className="text-violet-700">
              {i > 0 && ' · '}
              <strong>{p.label}</strong> {p.start.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
              {' – '}
              {p.end.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          ))}
        </div>
      )}

      {/* Filters */}
      <form onSubmit={handleSearch} className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 min-w-40">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Roll, kompetens..."
              className="flex-1 text-sm outline-none"
            />
          </div>
          <div className="flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 min-w-32">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Sverige, stad eller remote"
              className="flex-1 text-sm outline-none"
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={liaOnly} onChange={(e) => setLiaOnly(e.target.checked)} className="rounded" />
            LIA
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} className="rounded" />
            Remote
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={showOnlyStrongMatches}
              onChange={(e) => setShowOnlyStrongMatches(e.target.checked)}
              className="rounded"
            />
            Show only strong matches
          </label>
          <button type="submit" className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            <Filter className="h-4 w-4" />
            Filtrera
          </button>
          <button
            type="button"
            onClick={handleSaveSearch}
            title="Spara sökning som genväg"
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
          >
            <BookmarkPlus className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Område:</span>
          <button
            type="button"
            onClick={() => setLocation('Sverige')}
            className="rounded-full border px-2.5 py-1 font-medium text-slate-600 hover:border-blue-200 hover:text-blue-600"
          >
            Hela Sverige
          </button>
          {profileLocation && (
            <button
              type="button"
              onClick={() => setLocation(profileLocation)}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium text-slate-600 hover:border-blue-200 hover:text-blue-600"
            >
              <MapPin className="h-3 w-3" />
              Nära mig: {profileLocation}
            </button>
          )}
          {['Göteborg', 'Mölndal', 'Partille', 'Kungälv'].map((place) => (
            <button
              key={place}
              type="button"
              onClick={() => setLocation(place)}
              className="rounded-full border px-2.5 py-1 font-medium text-slate-600 hover:border-blue-200 hover:text-blue-600"
            >
              {place}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setLocation('Västra Götaland')}
            className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 font-medium text-cyan-800 hover:border-cyan-300 hover:bg-cyan-100"
          >
            Västra Götaland
          </button>
          {['Angered', 'Stockholm', 'Malmo'].map((place) => (
            <button
              key={place}
              type="button"
              onClick={() => setLocation(place)}
              className="rounded-full border px-2.5 py-1 font-medium text-slate-600 hover:border-blue-200 hover:text-blue-600"
            >
              {place}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRemoteOnly(true)}
            className="rounded-full border px-2.5 py-1 font-medium text-slate-600 hover:border-blue-200 hover:text-blue-600"
          >
            Remote
          </button>
          {['LIA', 'Praktik', 'Trainee', 'Larling'].map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => { setQuery(term); setLiaOnly(true) }}
              className="rounded-full border border-emerald-200 px-2.5 py-1 font-medium text-emerald-700 hover:bg-emerald-50"
            >
              {term}
            </button>
          ))}
        </div>

        {savedSearches.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t pt-2">
            <span className="text-xs text-slate-400 self-center">Sparade:</span>
            {savedSearches.map((s) => (
              <span key={s.id} className="flex items-center gap-0.5 rounded-full border border-blue-100 bg-blue-50 text-xs font-medium text-blue-800">
                <button onClick={() => handleRunSavedSearch(s)} className="pl-2.5 pr-1 py-1 hover:text-blue-600">
                  {s.label}
                </button>
                <button onClick={() => handleDeleteSavedSearch(s.id)} className="pr-2 py-1 text-blue-400 hover:text-red-500">×</button>
              </span>
            ))}
          </div>
        )}
      </form>

      {smartSearching && (
        <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
          <AISearchProgress stats={pollingStats ?? createAISearchStats(searchProgress, jobs.length)} />
          <JobGraphVisualization running matchesFound={lastSmartResult?.autoMatched ?? 0} skills={graphSkills} />
        </div>
      )}

      {adaptedCV && (
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-900">Anpassat CV</h2>
              <p className="mt-1 text-sm text-slate-500">{adaptedCV.jobTitle} · {adaptedCV.companyName}</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button onClick={() => setEditingAdaptedCV((value) => !value)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                {editingAdaptedCV ? 'Förhandsvisa' : 'Redigera'}
              </button>
              <button onClick={copyAdaptedCV} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <Copy className="h-3.5 w-3.5" />
                Kopiera
              </button>
              <details className="relative">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                  <Download className="h-3.5 w-3.5" />
                  Exportera
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-36 rounded-lg border bg-white p-1 shadow-lg">
                  <button onClick={exportAdaptedCV} className="block w-full rounded-md px-3 py-2 text-left text-xs font-medium hover:bg-slate-50">PDF</button>
                  <button onClick={downloadAdaptedCVWord} className="block w-full rounded-md px-3 py-2 text-left text-xs font-medium hover:bg-slate-50">Word (.doc)</button>
                  <button onClick={downloadAdaptedCVText} className="block w-full rounded-md px-3 py-2 text-left text-xs font-medium hover:bg-slate-50">Text (.txt)</button>
                </div>
              </details>
              <button onClick={() => setAdaptedCV(null)} className="rounded-lg border p-1.5 text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="mb-4 grid gap-3 text-sm md:grid-cols-3">
            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="font-semibold text-slate-900">Hur du söker</p>
              <p className="mt-1 text-slate-600">
                Öppna annonsen, kontrollera instruktionerna och bifoga ditt anpassade CV.
              </p>
              {adaptedCV.sourceUrl && (
                <a href={adaptedCV.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
                  Öppna jobbannons <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="font-semibold text-slate-900">Arbetsplats</p>
              <p className="mt-1 text-slate-600">{adaptedCV.location || 'Se jobbannonsen'}</p>
            </div>
            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="font-semibold text-slate-900">Sista ansökningsdag</p>
              <p className="mt-1 text-slate-600">{formatDate(adaptedCV.closingAt)}</p>
            </div>
          </div>
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Kontrollera innan du exporterar</p>
            <ul className="mt-2 space-y-1">
              <li>• Läs igenom och redigera texten så den låter som dig.</li>
              <li>• Kontrollera telefon, e-post, datum och arbetsgivare.</li>
              <li>• Ta bort allt som inte stämmer med din faktiska erfarenhet.</li>
              <li>• Kontrollera om arbetsgivaren vill ha CV, personligt brev eller formulärsvar.</li>
            </ul>
          </div>
          {editingAdaptedCV ? (
            <textarea
              value={adaptedCV.content}
              onChange={(event) => setAdaptedCV({ ...adaptedCV, content: event.target.value })}
              className="h-96 w-full rounded-lg border bg-white p-4 text-sm leading-relaxed text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          ) : (
            <CvDocumentPreview markdown={adaptedCV.content} className="max-h-[34rem]" />
          )}
        </div>
      )}

      {/* Smart search loading state */}
      {false && smartSearching && (
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="relative border-b bg-blue-50 px-6 py-6">
            <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-blue-100">
              <div className="h-full w-1/3 animate-[searchbar_1.4s_ease-in-out_infinite] bg-blue-600" />
            </div>
            <div className="flex items-center gap-4">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                <Sparkles className="h-6 w-6 animate-pulse" />
                <span className="absolute inset-0 animate-ping rounded-full bg-blue-400 opacity-30" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">AI söker efter rätt jobb...</p>
                <p className="mt-1 text-sm text-slate-500">
                  Det kan ta en liten stund när vi söker brett och matchar mot ditt CV.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-6 lg:grid-cols-[1fr_1.2fr]">
            <div className="space-y-3">
              {searchSteps.map((step, index) => (
                <div key={step} className="flex items-center gap-3 rounded-lg border bg-white p-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-700">{step}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{
                          width: `${70 - index * 12}%`,
                          animation: `pulse ${1.2 + index * 0.18}s ease-in-out infinite`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live search</span>
                <span className="flex items-center gap-1.5 text-xs font-medium text-blue-600">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-600" />
                  arbetar
                </span>
              </div>
              <div className="space-y-3">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="animate-pulse rounded-lg border bg-white p-4"
                    style={{ animationDelay: `${item * 160}ms` }}
                  >
                    <div className="mb-3 h-3 w-2/3 rounded bg-slate-200" />
                    <div className="mb-2 h-2.5 w-1/2 rounded bg-blue-100" />
                    <div className="flex gap-2">
                      <div className="h-2 w-16 rounded bg-slate-200" />
                      <div className="h-2 w-20 rounded bg-slate-200" />
                      <div className="h-2 w-14 rounded bg-slate-200" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <style jsx>{`
            @keyframes searchbar {
              0% { transform: translateX(-120%); }
              50% { transform: translateX(120%); }
              100% { transform: translateX(320%); }
            }
          `}</style>
        </div>
      )}

      {/* Job list */}
      {!smartSearching && (loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border bg-white py-16 text-center">
          <Sparkles className="mx-auto mb-3 h-10 w-10 text-slate-200" />
          <p className="font-medium text-slate-600">Inga jobb hittade ännu</p>
          <p className="mt-1 text-sm text-slate-400">Klicka på &quot;Sök med CV&quot; — AI hittar jobb som passar dig</p>
          <button
            onClick={() => handleSmartSearch()}
            disabled={smartSearching}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Sparkles className="h-4 w-4" />
            Sök med CV
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              className={`rounded-xl border bg-white p-5 transition-shadow hover:shadow-sm ${job.match?.tier === 'strong' ? 'border-green-200' : ''}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{job.title}</h3>
                    {job.isLia && (
                      <>
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">LIA</span>
                        {(() => {
                          const rel = liaRelevance(job.closingAt, job.postedAt, liaPeriods)
                          return rel ? (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${rel.color}`}>{rel.tag}</span>
                          ) : null
                        })()}
                      </>
                    )}
                    {job.match && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tierColors[job.match.tier]}`}>
                        {job.match.matchScore ?? Math.round(job.match.score * 20)}/100 - {tierLabel[job.match.tier]}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-blue-600">{job.company.name}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                    {job.location && <span>📍 {job.location}</span>}
                    {job.isRemote && <span>🌐 Remote</span>}
                    {job.isHybrid && <span>🏠 Hybrid</span>}
                    {(job.salaryMin || job.salaryMax) ? (
                      <span>💰 {formatSalary(job.salaryMin, job.salaryMax, job.currency ?? 'SEK')}</span>
                    ) : (() => {
                      const bench = getSalaryBenchmark(job.title, isSeniorTitle(job.title))
                      return bench ? (
                        <span className="text-slate-400">≈ {formatSalaryRange(bench)}</span>
                      ) : null
                    })()}
                    {job.jobType && <span>⏰ {job.jobType}</span>}
                  </div>
                  {job.match && (
                    <MatchBreakdown match={job.match} jobId={job.id} />
                  )}
                  {interviewPrep[job.id] && (
                    <InterviewPrepPanel prep={interviewPrep[job.id]} jobTitle={job.title} />
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!job.match && (
                    <button
                      onClick={() => handleMatch(job.id)}
                      disabled={matchingId === job.id}
                      title="Matcha med AI"
                      className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-200 hover:text-blue-600 disabled:opacity-50"
                    >
                      {matchingId === job.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BrainCircuit className="h-3.5 w-3.5" />}
                      Matcha
                    </button>
                  )}
                  <button
                    onClick={() => handleAdaptCV(job)}
                    disabled={adaptingId === job.id}
                    title="Anpassa CV för jobbet"
                    className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-200 hover:text-blue-600 disabled:opacity-50"
                  >
                    {adaptingId === job.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                    Anpassa CV
                  </button>
                  <button
                    onClick={() => handleInterviewPrep(job.id)}
                    disabled={prepLoading === job.id}
                    title="Generera intervjuförberedelse"
                    className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-violet-200 hover:text-violet-700 disabled:opacity-50"
                  >
                    {prepLoading === job.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GraduationCap className="h-3.5 w-3.5" />}
                    Intervju
                  </button>
                  {appliedIds.has(job.id) ? (
                    <span className="flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs font-medium text-green-700">
                      <CheckCheck className="h-3.5 w-3.5" /> Ansökt
                    </span>
                  ) : (
                    <button
                      onClick={() => handleMarkApplied(job.id, job.title, job.company.name)}
                      title="Markera som ansökt idag"
                      className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-green-300 hover:text-green-700"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Ansökt
                    </button>
                  )}
                  <button
                    onClick={() => handleSave(job.id)}
                    title="Spara för senare"
                    className="rounded-lg border p-2 text-slate-400 hover:border-blue-200 hover:text-blue-600"
                  >
                    <BookmarkPlus className="h-4 w-4" />
                  </button>
                  {job.sourceUrl && (
                    <a
                      href={job.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Öppna
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// Score dimension metadata: label, max points, Swedish display name.
const BREAKDOWN_DIMS = [
  { key: 'skills',          label: 'Kompetenser',    max: 35 },
  { key: 'role',            label: 'Rollanpassning', max: 15 },
  { key: 'experience',      label: 'Erfarenhet',     max: 20 },
  { key: 'education',       label: 'Utbildning',     max: 15 },
  { key: 'locationLanguage',label: 'Plats & språk',  max: 10 },
] as const

function barColor(pct: number) {
  if (pct >= 70) return 'bg-green-500'
  if (pct >= 40) return 'bg-amber-400'
  return 'bg-red-400'
}

type MatchData = NonNullable<JobListing['match']>

function InterviewPrepPanel({ prep, jobTitle }: { prep: InterviewPrepResult; jobTitle: string }) {
  const [open, setOpen] = useState(true)
  const bench = getSalaryBenchmark(jobTitle, isSeniorTitle(jobTitle))
  const salaryDisplay = bench
    ? `${formatSalaryRange(bench)} — ${prep.salaryTip || 'Se även Unionen och Glassdoor för aktuella uppgifter.'}`
    : prep.salaryTip

  return (
    <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-semibold text-violet-900">
          <GraduationCap className="h-4 w-4" />
          Intervjuförberedelse
          {prep.fallback && <span className="ml-1 text-xs font-normal text-violet-500">(lokalt utkast)</span>}
        </span>
        <button onClick={() => setOpen((v) => !v)} className="text-xs text-violet-500 hover:text-violet-700">
          {open ? 'Dölj' : 'Visa'}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          {prep.questions.map((item, i) => (
            <div key={i} className="rounded-lg bg-white p-3 shadow-sm">
              <p className="font-medium text-slate-800">{i + 1}. {item.q}</p>
              {item.tip && (
                <p className="mt-1.5 text-xs text-slate-500 italic">{item.tip}</p>
              )}
            </div>
          ))}

          <div className="grid gap-2 text-xs sm:grid-cols-3">
            {salaryDisplay && (
              <div className="rounded-lg bg-white p-2.5 shadow-sm">
                <p className="font-semibold text-slate-700">Lön</p>
                <p className="mt-0.5 text-slate-500">{salaryDisplay}</p>
              </div>
            )}
            {prep.cultureNote && (
              <div className="rounded-lg bg-white p-2.5 shadow-sm">
                <p className="font-semibold text-slate-700">Kultur</p>
                <p className="mt-0.5 text-slate-500">{prep.cultureNote}</p>
              </div>
            )}
            {prep.watchOut?.length > 0 && (
              <div className="rounded-lg bg-amber-50 p-2.5 shadow-sm">
                <p className="font-semibold text-amber-800">Tänk på</p>
                <ul className="mt-0.5 space-y-0.5 text-amber-700">
                  {prep.watchOut.map((w, i) => <li key={i}>• {w}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MatchBreakdown({ match, jobId }: { match: MatchData; jobId: string }) {
  const [open, setOpen] = useState(false)
  const hasBreakdown = match.scoreBreakdown && Object.keys(match.scoreBreakdown).length > 0

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
      <p className="leading-snug">{match.reason}</p>

      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {(match.matchedSkills ?? []).slice(0, 6).map((skill) => (
          <span key={`m-${jobId}-${skill}`} className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700">
            {skill}
          </span>
        ))}
        {(match.missingSkills ?? []).slice(0, 4).map((skill) => (
          <span key={`x-${jobId}-${skill}`} className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
            Saknas: {skill}
          </span>
        ))}
      </div>

      {hasBreakdown && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-2 text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          {open ? '▲ Dölj poängfördelning' : '▼ Visa poängfördelning'}
        </button>
      )}

      {open && hasBreakdown && (
        <div className="mt-3 space-y-2">
          {BREAKDOWN_DIMS.map(({ key, label, max }) => {
            const raw = match.scoreBreakdown![key] ?? 0
            const pct = Math.round(Math.min(100, (raw / max) * 100))
            return (
              <div key={key} className="flex items-center gap-2 text-xs">
                <span className="w-28 shrink-0 text-slate-500">{label}</span>
                <div className="flex-1 overflow-hidden rounded-full bg-slate-200 h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${barColor(pct)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-10 text-right font-medium text-slate-600">
                  {raw.toFixed(0)}/{max}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
