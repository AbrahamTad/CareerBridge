import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, BrainCircuit, CalendarDays, ClipboardList, Search, TrendingUp } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { APP_STATUS_LABELS, APP_STATUS_COLORS } from '@/types'
import type { AppStatusType } from '@/types'
import { PageHero } from '@/components/ui/ModernShell'
import { getDashboardData } from '@/lib/dashboard/data'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const {
    dbUser,
    applicationStats,
    recentMatches,
    totalMatchCount,
    recentApplications,
    upcomingInterviews,
    databaseUnavailable,
  } = user ? await getDashboardData(user.id) : {
    dbUser: null,
    applicationStats: [],
    recentMatches: [],
    totalMatchCount: 0,
    recentApplications: [],
    upcomingInterviews: [],
    databaseUnavailable: false,
  }

  const statsMap = Object.fromEntries(applicationStats.map((s) => [s.status, s._count]))
  const totalApplications = applicationStats.reduce((sum, s) => sum + s._count, 0)
  const hasCV = (dbUser?.cvs?.length ?? 0) > 0

  const name = (user?.user_metadata?.name as string) || user?.email?.split('@')[0] || 'där'

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="AI command center"
        title={`Hej, ${name}!`}
        description="Track your CV graph, strongest matches, application pipeline, and next actions from one modern dashboard."
      />
      {databaseUnavailable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <h2 className="font-semibold text-amber-950">Database connection is temporarily unavailable</h2>
              <p className="mt-1 text-sm text-amber-800">
                Please check Supabase connection. Dashboard metrics are shown with fallback values until the database responds again.
              </p>
            </div>
          </div>
        </div>
      )}
      {/* Welcome */}
      <div className="hidden">
        <h1 className="text-2xl font-bold text-slate-900">Hej, {name}! 👋</h1>
        <p className="mt-1 text-slate-500">Här är en översikt av din jobbsökning</p>
      </div>

      {/* Onboarding alert */}
      {!hasCV && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100">
              <BrainCircuit className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-blue-900">Kom igång — ladda upp ditt CV</h2>
              <p className="mt-1 text-sm text-blue-700">
                Ladda upp ditt CV för att låta AI analysera dina styrkor och matcha dig med rätt jobb.
              </p>
              <Link
                href="/profile"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
              >
                Ladda upp CV <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: 'Totalt ansökningar', value: totalApplications },
          { label: 'Intervjuer bokade', value: statsMap['INTERVIEW'] ?? 0 },
          { label: 'Erbjudanden', value: statsMap['OFFER'] ?? 0 },
          { label: 'Starka matchningar', value: totalMatchCount ?? 0 },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur">
            <p className="text-sm font-medium text-slate-500">{stat.label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Upcoming interviews + LIA countdown */}
      {((upcomingInterviews ?? []).length > 0 || (dbUser?.profile?.liaDate1Start)) && (
        <div className="grid gap-4 md:grid-cols-2">
          {(upcomingInterviews ?? []).length > 0 && (
            <div className="rounded-xl border bg-white p-5">
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                <CalendarDays className="h-4 w-4 text-amber-500" />
                Kommande intervjuer
              </h2>
              <ul className="space-y-2">
                {(upcomingInterviews ?? []).map((app) => (
                  <li key={app.id} className="flex items-center justify-between rounded-lg border bg-amber-50 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{app.jobTitle}</p>
                      <p className="text-xs text-slate-500">{app.companyName}</p>
                    </div>
                    <span className="ml-3 shrink-0 text-xs font-semibold text-amber-700">
                      {new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' }).format(new Date(app.interviewAt!))}
                    </span>
                  </li>
                ))}
              </ul>
              <Link href="/applications" className="mt-3 block text-xs text-blue-600 hover:underline">
                Hantera ansökningar →
              </Link>
            </div>
          )}

          {dbUser?.profile?.liaDate1Start && (() => {
            const liaStart = new Date(dbUser.profile!.liaDate1Start!)
            const daysUntil = Math.max(0, Math.ceil((liaStart.getTime() - Date.now()) / 86400000))
            const label = dbUser.profile?.liaDate2Start ? 'LIA 1' : 'LIA'
            return daysUntil > 0 ? (
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-5">
                <h2 className="mb-1 flex items-center gap-2 font-semibold text-violet-900">
                  <BrainCircuit className="h-4 w-4" />
                  {label} startar om
                </h2>
                <p className="text-4xl font-bold text-violet-800">{daysUntil} <span className="text-lg font-medium">dagar</span></p>
                <p className="mt-1 text-xs text-violet-600">
                  {liaStart.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <Link href="/jobs?lia=1" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:underline">
                  Sök LIA-platser <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            ) : null
          })()}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent matches */}
        <div className="rounded-xl border bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Bästa jobbmatchningar</h2>
            <Link href="/jobs" className="text-sm text-blue-600 hover:underline">Visa alla →</Link>
          </div>
          {recentMatches.length === 0 ? (
            <div className="py-8 text-center">
              <Search className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-400">Inga matchningar än. Starta en jobbsökning!</p>
              <Link href="/jobs" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
                Sök jobb →
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {recentMatches.map((match) => (
                <li key={match.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {match.jobListing.title}
                    </p>
                    <p className="text-xs text-slate-400">{match.jobListing.company.name}</p>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    {(() => {
                      const pct = Math.round(match.score * 20)
                      return (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          pct >= 75 ? 'bg-green-100 text-green-700' :
                          pct >= 55 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {pct}/100
                        </span>
                      )
                    })()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent applications */}
        <div className="rounded-xl border bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Senaste ansökningar</h2>
            <Link href="/applications" className="text-sm text-blue-600 hover:underline">Visa alla →</Link>
          </div>
          {recentApplications.length === 0 ? (
            <div className="py-8 text-center">
              <ClipboardList className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-400">Inga ansökningar ännu.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {recentApplications.map((app) => (
                <li key={app.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{app.jobTitle}</p>
                    <p className="text-xs text-slate-400">{app.companyName} · {formatDate(app.createdAt)}</p>
                  </div>
                  <span className={`ml-4 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${APP_STATUS_COLORS[app.status as AppStatusType]}`}>
                    {APP_STATUS_LABELS[app.status as AppStatusType]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-4 font-semibold text-slate-900">Snabbåtgärder</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { href: '/profile', label: 'Uppdatera CV', icon: '📄' },
            { href: '/jobs', label: 'Sök jobb', icon: '🔍' },
            { href: '/cv-builder', label: 'Generera CV', icon: '✨' },
            { href: '/companies', label: 'Hitta företag', icon: '🏢' },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex flex-col items-center gap-2 rounded-xl border bg-white p-4 text-center hover:border-blue-200 hover:bg-blue-50 transition-colors"
            >
              <span className="text-2xl">{action.icon}</span>
              <span className="text-sm font-medium text-slate-700">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
