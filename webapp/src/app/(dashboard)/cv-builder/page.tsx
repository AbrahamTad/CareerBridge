'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Sparkles, Loader2, Download, Copy, RotateCcw } from 'lucide-react'
import CvDocumentPreview from '@/components/cv/CvDocumentPreview'
import {
  copyCleanText,
  downloadCleanText,
  downloadCleanWordDocument,
  exportCleanPdf,
} from '@/lib/document-actions'
import { cleanCvMarkdown } from '@/lib/cv-export-format'

export default function CVBuilderPage() {
  const [jobTitle, setJobTitle] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [language, setLanguage] = useState<'sv' | 'en'>('sv')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ content: string; id: string; fallback?: boolean; message?: string } | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [editingResult, setEditingResult] = useState(false)

  async function runGenerate() {
    setLoading(true)
    setResult(null)
    setErrorMessage(null)
    try {
      const res = await fetch('/api/cv/adapt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobTitle, companyName, jobDescription, language }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error)
      }
      const data = await res.json()
      setResult(data)
      setEditingResult(false)
      if (data.fallback) {
        toast.info(data.message || 'AI är inte tillgängligt. Ett lokalt CV-utkast skapades.')
      } else {
        toast.success('CV anpassat!')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Fel vid generering'
      setErrorMessage(message)
      toast.error(message, { id: 'cv-generation-error' })
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    await runGenerate()
  }

  async function handleCopy() {
    if (!result) return
    await copyCleanText(cleanCvMarkdown(result.content))
    toast.success('Kopierat som ren text!')
  }

  function handleExportPdf() {
    if (!result) return
    exportCleanPdf(cleanCvMarkdown(result.content), `CV - ${jobTitle || companyName || 'CareerBridge'}`, {
      includeTitle: false,
      variant: 'cv',
    })
    toast.success('PDF laddas ner')
  }

  function handleDownloadWord() {
    if (!result) return
    downloadCleanWordDocument(cleanCvMarkdown(result.content), `CV - ${jobTitle || companyName || 'CareerBridge'}`, {
      variant: 'cv',
    })
    toast.success('Word-fil laddas ner')
  }

  function handleDownloadText() {
    if (!result) return
    downloadCleanText(cleanCvMarkdown(result.content), `CV - ${jobTitle || companyName || 'CareerBridge'}`)
    toast.success('Textfil laddas ner')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">AI CV-generator</h1>
        <p className="mt-1 text-slate-500">Anpassa ditt CV automatiskt för en specifik tjänst</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input form */}
        <div className="rounded-xl border bg-white p-6">
          <h2 className="mb-5 font-semibold text-slate-900">Jobbinformation</h2>
          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Jobbtitel</label>
              <input
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                required
                placeholder="Frontend Developer"
                className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Företag</label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                placeholder="Volvo Cars"
                className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Jobbannons (klistra in texten)</label>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                required
                rows={6}
                placeholder="Klistra in hela jobbannonsen här..."
                className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Språk</label>
              <div className="flex gap-3">
                {(['sv', 'en'] as const).map((l) => (
                  <label key={l} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value={l}
                      checked={language === l}
                      onChange={() => setLanguage(l)}
                    />
                    <span className="text-sm">{l === 'sv' ? '🇸🇪 Svenska' : '🇬🇧 English'}</span>
                  </label>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? 'Genererar...' : 'Generera anpassat CV'}
            </button>
          </form>
        </div>

        {/* Result */}
        <div className="rounded-xl border bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Resultat</h2>
            {result && (
              <div className="flex flex-wrap justify-end gap-2">
                <button onClick={() => setEditingResult((value) => !value)} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                  {editingResult ? 'Förhandsvisa' : 'Redigera'}
                </button>
                <button onClick={handleCopy} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                  <Copy className="h-3.5 w-3.5" />
                  Kopiera
                </button>
                <details className="relative">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    <Download className="h-3.5 w-3.5" />
                    Exportera
                  </summary>
                  <div className="absolute right-0 z-20 mt-2 w-36 rounded-lg border bg-white p-1 shadow-lg">
                    <button onClick={handleExportPdf} className="block w-full rounded-md px-3 py-2 text-left text-xs font-medium hover:bg-slate-50">PDF</button>
                    <button onClick={handleDownloadWord} className="block w-full rounded-md px-3 py-2 text-left text-xs font-medium hover:bg-slate-50">Word (.doc)</button>
                    <button onClick={handleDownloadText} className="block w-full rounded-md px-3 py-2 text-left text-xs font-medium hover:bg-slate-50">Text (.txt)</button>
                  </div>
                </details>
                <button onClick={() => setResult(null)} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Rensa
                </button>
              </div>
            )}
          </div>
          {errorMessage && !loading && !result && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">CV generation needs attention</p>
              <p className="mt-1">{errorMessage}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void runGenerate()}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                >
                  Retry
                </button>
                <Link
                  href="/settings/ai-providers"
                  className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                >
                  AI provider status
                </Link>
              </div>
            </div>
          )}
          {result ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-semibold">Kontrollera innan du exporterar</p>
                <ul className="mt-2 space-y-1">
                  <li>• Stämmer kontaktuppgifter, datum och arbetsgivare?</li>
                  <li>• Är texten sann mot din faktiska erfarenhet?</li>
                  <li>• Matchar rubriker och nyckelord jobbannonsen?</li>
                  <li>• Kontrollera ansökningslänk, adress och sista ansökningsdag i annonsen.</li>
                </ul>
              </div>
              {editingResult ? (
                <textarea
                  value={result.content}
                  onChange={(event) => setResult({ ...result, content: event.target.value })}
                  className="h-96 w-full rounded-lg border bg-white p-4 text-sm leading-relaxed text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              ) : (
                <CvDocumentPreview markdown={result.content} className="max-h-96" />
              )}
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
              <p className="mt-4 text-sm text-slate-400">AI anpassar ditt CV...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <Sparkles className="h-10 w-10 text-slate-200" />
              <p className="mt-4 text-sm text-slate-400">
                Fyll i jobbet till vänster och klicka på generera
              </p>
            </div>
          )}
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-xl border bg-blue-50 p-5">
        <h3 className="mb-2 font-semibold text-blue-900">Hur fungerar det?</h3>
        <ul className="space-y-1 text-sm text-blue-700">
          <li>• AI läser ditt CV och jobbannonsens krav</li>
          <li>• Relevanta erfarenheter lyfts fram och omformuleras</li>
          <li>• Innehållet förblir alltid äkta — inga påhittade erfarenheter</li>
          <li>• Du kan redigera resultatet fritt innan du skickar</li>
        </ul>
      </div>
    </div>
  )
}
