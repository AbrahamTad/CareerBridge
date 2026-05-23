'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Activity, Loader2, LogOut, Trash2, Shield } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const router = useRouter()
  const [newPassword, setNewPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 8) { toast.error('Lösenordet måste vara minst 8 tecken'); return }
    setSavingPassword(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) toast.error(error.message)
    else { toast.success('Lösenord uppdaterat'); setNewPassword('') }
    setSavingPassword(false)
  }

  async function handleSignOut() {
    const supabase = createClient()
    // Clear browser auth state in the background; the server route clears cookies and redirects.
    void supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    router.replace('/api/auth/signout')
    window.location.href = '/api/auth/signout'
  }

  async function handleDeleteAccount() {
    setDeleting(true)
    try {
      const res = await fetch('/api/account', { method: 'DELETE' })
      if (!res.ok) throw new Error()
      const supabase = createClient()
      await supabase.auth.signOut({ scope: 'local' })
      await fetch('/api/auth/signout', { method: 'POST' })
      toast.success('Konto borttaget')
      router.replace('/login')
    } catch {
      toast.error('Fel vid borttagning av konto')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Inställningar</h1>
        <p className="mt-1 text-slate-500">Hantera konto och säkerhet</p>
      </div>

      <div className="rounded-xl border bg-white p-6">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-5 w-5 text-slate-400" />
          <h2 className="font-semibold text-slate-900">AI-leverantörer</h2>
        </div>
        <p className="mb-4 text-sm text-slate-600">
          Se fallback-status, saknade API-nycklar, svarstider och senaste AI-fel.
        </p>
        <Link
          href="/settings/ai-providers"
          className="inline-flex rounded-lg border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Öppna AI-status
        </Link>
      </div>

      {/* Password */}
      <div className="rounded-xl border bg-white p-6">
        <div className="mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5 text-slate-400" />
          <h2 className="font-semibold text-slate-900">Ändra lösenord</h2>
        </div>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Nytt lösenord</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              placeholder="Minst 8 tecken"
              className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <button
            type="submit"
            disabled={savingPassword || !newPassword}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
            Uppdatera lösenord
          </button>
        </form>
      </div>

      {/* Sign out */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 font-semibold text-slate-900">Session</h2>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <LogOut className="h-4 w-4" />
          Logga ut
        </button>
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h2 className="mb-2 font-semibold text-red-900">Danger zone</h2>
        <p className="mb-4 text-sm text-red-700">
          Att ta bort ditt konto är permanent och kan inte ångras. All data raderas.
        </p>
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 rounded-lg border border-red-300 bg-white px-5 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-600 hover:text-white transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Ta bort konto permanent
          </button>
        ) : (
          <div className="rounded-lg border border-red-300 bg-white p-4 space-y-3">
            <p className="text-sm font-semibold text-red-800">Är du helt säker? Detta går inte att ångra.</p>
            <p className="text-xs text-red-600">Alla dina ansökningar, CV-data och inställningar raderas permanent.</p>
            <div className="flex gap-2">
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Ja, ta bort allt
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Avbryt
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
