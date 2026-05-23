'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  BrainCircuit,
  LayoutDashboard,
  FileText,
  Search,
  ClipboardList,
  Sparkles,
  Mail,
  Building2,
  Settings,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Översikt' },
  { href: '/profile', icon: FileText, label: 'CV & Profil' },
  { href: '/jobs', icon: Search, label: 'Jobbsökning' },
  { href: '/applications', icon: ClipboardList, label: 'Ansökningar' },
  { href: '/cv-builder', icon: Sparkles, label: 'CV-generator' },
  { href: '/cover-letter', icon: Mail, label: 'Personligt brev' },
  { href: '/companies', icon: Building2, label: 'Företag' },
  { href: '/settings/ai-providers', icon: Activity, label: 'AI-status' },
  { href: '/settings', icon: Settings, label: 'Inställningar' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [usage, setUsage] = useState<{ used: number; limit: number; plan: string } | null>(null)

  useEffect(() => {
    fetch('/api/subscription')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setUsage({ used: d.aiCallsThisMonth, limit: d.aiCallsLimit, plan: d.plan }))
      .catch(() => {})
  }, [])

  const pct = usage ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 20

  return (
    <aside className="hidden w-64 flex-col border-r border-white/70 bg-white/75 shadow-xl shadow-slate-200/50 backdrop-blur md:flex">
      {/* Sidebar uses a glass surface so navigation feels part of the AI workspace. */}
      <div className="flex h-16 items-center gap-2 border-b border-slate-200/70 px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-cyan-300">
          <BrainCircuit className="h-5 w-5" />
        </div>
        <span className="font-bold text-slate-900">CareerBridge AI</span>
      </div>
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {nav.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-slate-950 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-white hover:text-slate-950'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="border-t p-4">
        <div className="rounded-lg border border-cyan-100 bg-gradient-to-br from-cyan-50 to-emerald-50 p-3">
          <p className="text-xs font-semibold text-slate-800 capitalize">{usage?.plan ?? 'Gratis'} plan</p>
          <p className="mt-0.5 text-xs text-slate-600">
            {usage ? `${usage.used}/${usage.limit} AI-analyser använda` : 'Laddar...'}
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-white">
            <div className="h-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <Link href="/pricing" className="mt-2 block text-xs font-medium text-blue-700 hover:underline">
            Uppgradera till Pro →
          </Link>
        </div>
      </div>
    </aside>
  )
}
