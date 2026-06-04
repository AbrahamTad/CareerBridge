'use client'

import { useEffect, useState } from 'react'
import { Building2, Loader2, ExternalLink, Copy, BookmarkPlus, Check } from 'lucide-react'
import { toast } from 'sonner'
import { PageHero } from '@/components/ui/ModernShell'

interface DiscoveredCompany {
  name: string
  domain?: string
  industry?: string
  size?: string
  location?: string
  reason: string
  careerPageUrl?: string
  linkedinUrl?: string
  outreachMessage: string
}

export default function CompaniesPage() {
  const [targetRole, setTargetRole] = useState('')
  const [location, setLocation] = useState('Göteborg')
  const [liaFocus, setLiaFocus] = useState(false)
  const [loading, setLoading] = useState(false)
  const [companies, setCompanies] = useState<DiscoveredCompany[]>([])
  const [fallback, setFallback] = useState(false)
  const [activeOnly, setActiveOnly] = useState(false)
  const [savedCompanies, setSavedCompanies] = useState<Set<string>>(new Set())

  async function handleSaveCompany(company: DiscoveredCompany) {
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: company.name,
          jobTitle: targetRole || 'Spontanansökan',
          jobUrl: company.careerPageUrl ?? company.linkedinUrl ?? null,
          status: 'SAVED',
        }),
      })
      if (!res.ok) throw new Error()
      setSavedCompanies((prev) => new Set(prev).add(company.name))
      toast.success(`${company.name} sparad i ansökningsspåraren`)
    } catch {
      toast.error('Kunde inte spara företaget')
    }
  }

  useEffect(() => {
    async function loadProfileDefaults() {
      const res = await fetch('/api/profile')
      if (!res.ok) return
      const data = await res.json() as { profile?: { targetRoles?: string[]; city?: string | null; location?: string | null; liaEnabled?: boolean } | null }
      const firstRole = data.profile?.targetRoles?.[0]

      // Prefill from desired role so discovery starts from the user's actual target.
      if (firstRole) setTargetRole((current) => current || firstRole)
      setLocation((current) => current || data.profile?.city || data.profile?.location || 'Sverige')
      setLiaFocus((current) => current || Boolean(data.profile?.liaEnabled))
    }

    loadProfileDefaults()
  }, [])

  async function handleDiscover(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setCompanies([])
    setFallback(false)
    setActiveOnly(false)
    try {
      const res = await fetch('/api/ai/discover-companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetRole, location, liaFocus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCompanies(data.companies)
      setFallback(Boolean(data.fallback))
      setActiveOnly(Boolean(data.activeOnly))
      if (data.companies.length) {
        toast.success(`Hittade ${data.companies.length} relevanta företag`)
      } else {
        toast.info(data.message ?? 'Inga företag hittades. Prova bredare plats eller roll.')
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Sökning misslyckades')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Company node discovery"
        title="Find companies connected to your CV graph"
        description="Discover employers, LIA opportunities, and outreach angles using your role, location, and profile context."
      />
      <div className="hidden">
        <h1 className="text-2xl font-bold text-slate-900">Företagsupptäckt</h1>
        <p className="mt-1 text-slate-500">
          AI hittar relevanta företag baserat på ditt CV och mål — inklusive LIA-platser utan öppna annonser
        </p>
      </div>

      <div className="rounded-xl border border-white/70 bg-white/80 p-6 shadow-sm backdrop-blur">
        {/* Discovery filters define which company nodes the AI should expand. */}
        <form onSubmit={handleDiscover} className="flex flex-wrap gap-3">
          <input
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            required
            placeholder="Önskad roll (t.ex. Frontend Developer)"
            className="flex-1 min-w-48 rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Sverige eller stad"
            className="w-36 rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={liaFocus} onChange={(e) => setLiaFocus(e.target.checked)} className="rounded" />
            Prioritera LIA
          </label>
          <div className="flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
            {liaFocus ? 'Endast aktiva LIA/praktik/trainee' : 'Aktiva jobb + LIA/praktik/trainee'}
          </div>
          <button type="submit" disabled={loading} className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            Hitta företag
          </button>
        </form>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          <p className="mt-4 text-sm text-slate-400">AI söker relevanta företag...</p>
        </div>
      )}

      {companies.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm font-medium text-slate-500">
            {companies.length} företag hittade
            {fallback && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Jobbkällor utan AI-ranking</span>}
          </p>
          {activeOnly && (
            <p className="text-xs font-semibold text-emerald-700">
              {liaFocus
                ? 'Endast foretag med aktiva LIA/praktik/trainee-annonser visas.'
                : 'Foretag med aktiva jobbannonser eller LIA/praktik/trainee-mojligheter visas.'}
            </p>
          )}
          {companies.map((company, i) => (
            <div key={i} className="rounded-xl border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur">
              {/* Company cards include fit reasoning and ready-to-edit outreach copy. */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{company.name}</h3>
                    {company.industry && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{company.industry}</span>
                    )}
                  </div>
                  <div className="mt-1 flex gap-3 text-xs text-slate-400">
                    {company.location && <span>📍 {company.location}</span>}
                    {company.size && <span>👥 {company.size}</span>}
                    {company.domain && <span>🌐 {company.domain}</span>}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{company.reason}</p>

                  <div className="mt-3 rounded-lg bg-slate-50 p-3">
                    <p className="mb-1 text-xs font-medium text-slate-500">Förslag på kontaktmeddelande:</p>
                    <p className="text-sm text-slate-700 italic">{company.outreachMessage}</p>
                    <button
                      onClick={() => { navigator.clipboard.writeText(company.outreachMessage); toast.success('Kopierat!') }}
                      className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    >
                      <Copy className="h-3 w-3" /> Kopiera meddelande
                    </button>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  {savedCompanies.has(company.name) ? (
                    <span className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">
                      <Check className="h-3 w-3" /> Sparad
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSaveCompany(company)}
                      className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-200 hover:text-blue-600"
                    >
                      <BookmarkPlus className="h-3 w-3" /> Spara
                    </button>
                  )}
                  {company.careerPageUrl && (
                    <a href={company.careerPageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-slate-50">
                      <ExternalLink className="h-3 w-3" /> Karriärsida
                    </a>
                  )}
                  {company.linkedinUrl && (
                    <a href={company.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-slate-50">
                      <ExternalLink className="h-3 w-3" /> LinkedIn
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
