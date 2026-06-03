'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getInitials, cn } from '@/lib/utils'
import type { User } from '@supabase/supabase-js'
import {
  LogOut, ChevronDown, Menu, X,
  BrainCircuit, LayoutDashboard, FileText, Search,
  ClipboardList, Sparkles, Mail, Building2, Settings, Activity,
} from 'lucide-react'
import { useState } from 'react'

const NAV = [
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

export default function DashboardHeader({ user }: { user: User }) {
  const router = useRouter()
  const pathname = usePathname()
  const [userOpen, setUserOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const name = (user.user_metadata?.name as string) || user.email || ''

  async function handleSignOut() {
    const supabase = createClient()
    void supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    toast.success('Du har loggats ut')
    router.replace('/api/auth/signout')
    window.location.href = '/api/auth/signout'
  }

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b bg-white px-4 md:px-6">
        {/* Hamburger — mobile only */}
        <button
          onClick={() => setNavOpen(true)}
          className="flex items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
          aria-label="Öppna meny"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Brand — mobile only (sidebar shows on desktop) */}
        <div className="flex items-center gap-2 md:hidden">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-950 text-cyan-300">
            <BrainCircuit className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold text-slate-900">CareerBridge</span>
        </div>

        <div className="hidden md:block" /> {/* spacer on desktop */}

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setUserOpen(!userOpen)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-slate-100"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
              {getInitials(name)}
            </div>
            <span className="hidden text-sm font-medium text-slate-700 md:block">{name}</span>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>
          {userOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border bg-white py-1 shadow-lg z-50">
              <div className="border-b px-3 py-2">
                <p className="text-xs font-medium text-slate-900 truncate">{name}</p>
                <p className="text-xs text-slate-400 truncate">{user.email}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                <LogOut className="h-4 w-4" />
                Logga ut
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Mobile nav overlay */}
      {navOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} />

          {/* Drawer */}
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl">
            <div className="flex h-16 items-center justify-between border-b px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-cyan-300">
                  <BrainCircuit className="h-4 w-4" />
                </div>
                <span className="font-bold text-slate-900">CareerBridge AI</span>
              </div>
              <button onClick={() => setNavOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-4">
              <ul className="space-y-1 px-2">
                {NAV.map(({ href, icon: Icon, label }) => {
                  const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={() => setNavOpen(false)}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                          active
                            ? 'bg-slate-950 text-white'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
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
              <button
                onClick={() => { setNavOpen(false); handleSignOut() }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                <LogOut className="h-4 w-4" />
                Logga ut
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
