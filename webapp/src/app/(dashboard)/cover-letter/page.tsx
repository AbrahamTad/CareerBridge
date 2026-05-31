'use client'

// User-facing editor for AI-generated letters and short application emails.
import { useState } from 'react'
import { toast } from 'sonner'
import { Mail, Loader2, Copy, RotateCcw, Download } from 'lucide-react'
import {
  copyCleanText,
  downloadCleanText,
  downloadCleanWordDocument,
  exportCleanPdf,
  markdownToPlainText,
} from '@/lib/document-actions'

export default function CoverLetterPage() {
  const [documentType, setDocumentType] = useState<'cover-letter' | 'lia-praktik-letter' | 'email-application'>('cover-letter')
  const [jobTitle, setJobTitle] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [language, setLanguage] = useState<'sv' | 'en'>('sv')
  const [tone, setTone] = useState('professional')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [editingResult, setEditingResult] = useState(false)

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/ai/generate-cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobTitle, companyName, jobDescription, language, tone, documentType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data.content)
      setEditingResult(false)
      toast.success('Ansökningstext genererad!')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Fel vid generering')
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!result) return
    await copyCleanText(result)
    toast.success('Kopierat som ren text!')
  }

  function handleExportPdf() {
    if (!result) return
    exportCleanPdf(result, `${documentTypeLabel} - ${jobTitle || companyName || 'CareerBridge'}`)
    toast.success('PDF laddas ner')
  }

  function handleDownloadWord() {
    if (!result) return
    downloadCleanWordDocument(result, `${documentTypeLabel} - ${jobTitle || companyName || 'CareerBridge'}`)
    toast.success('Word-fil laddas ner')
  }

  function handleDownloadText() {
    if (!result) return
    downloadCleanText(result, `${documentTypeLabel} - ${jobTitle || companyName || 'CareerBridge'}`)
    toast.success('Textfil laddas ner')
  }

  const documentTypeLabel =
    documentType === 'lia-praktik-letter' ? 'LIA-/praktikbrev'
    : documentType === 'email-application' ? 'Kort ansökningsmejl'
    : 'Personligt brev'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">AI ansökningstexter</h1>
        <p className="mt-1 text-slate-500">Generera personligt brev, LIA-/praktikbrev eller ett kort ansökningsmejl baserat på ditt CV</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-6">
          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Typ av ansökningstext</label>
              <select value={documentType} onChange={(event) => setDocumentType(event.target.value as typeof documentType)} className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600">
                <option value="cover-letter">Personligt brev</option>
                <option value="lia-praktik-letter">LIA-/praktikbrev</option>
                <option value="email-application">Kort ansökningsmejl</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Jobbtitel</label>
              <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} required placeholder="Frontend Developer" className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Företag</label>
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required placeholder="Volvo Cars" className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Jobbannons</label>
              <textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} required rows={5} placeholder="Klistra in jobbannonsen..." className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Språk</label>
                <select value={language} onChange={(e) => setLanguage(e.target.value as 'sv' | 'en')} className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600">
                  <option value="sv">🇸🇪 Svenska</option>
                  <option value="en">🇬🇧 English</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Ton</label>
                <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600">
                  <option value="professional">Professionell</option>
                  <option value="enthusiastic">Entusiastisk</option>
                  <option value="direct">Direkt</option>
                </select>
              </div>
            </div>
            <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {loading ? 'Genererar...' : `Generera ${documentTypeLabel.toLowerCase()}`}
            </button>
          </form>
        </div>

        <div className="rounded-xl border bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">{documentTypeLabel}</h2>
            {result && (
              <div className="flex flex-wrap justify-end gap-2">
                <button onClick={() => setEditingResult((value) => !value)} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-slate-50">
                  {editingResult ? 'Förhandsvisa' : 'Redigera'}
                </button>
                <button onClick={handleCopy} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-slate-50">
                  <Copy className="h-3.5 w-3.5" /> Kopiera
                </button>
                <details className="relative">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-slate-50">
                    <Download className="h-3.5 w-3.5" /> Exportera
                  </summary>
                  <div className="absolute right-0 z-20 mt-2 w-36 rounded-lg border bg-white p-1 shadow-lg">
                    <button onClick={handleExportPdf} className="block w-full rounded-md px-3 py-2 text-left text-xs font-medium hover:bg-slate-50">PDF</button>
                    <button onClick={handleDownloadWord} className="block w-full rounded-md px-3 py-2 text-left text-xs font-medium hover:bg-slate-50">Word (.doc)</button>
                    <button onClick={handleDownloadText} className="block w-full rounded-md px-3 py-2 text-left text-xs font-medium hover:bg-slate-50">Text (.txt)</button>
                  </div>
                </details>
                <button onClick={() => setResult(null)} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-slate-50">
                  <RotateCcw className="h-3.5 w-3.5" /> Rensa
                </button>
              </div>
            )}
          </div>
          {result ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-semibold">Kontrollera innan du skickar</p>
                <ul className="mt-2 space-y-1">
                  <li>• Stämmer jobbtitel och företag?</li>
                  <li>• Låter brevet som dig och inte för formellt?</li>
                  <li>• Finns inget påhittat om erfarenhet, datum eller utbildning?</li>
                  <li>• Kontrollera sista ansökningsdag och exakt ansökningssätt i jobbannonsen.</li>
                </ul>
              </div>
              {editingResult ? (
                <textarea
                  value={result}
                  onChange={(event) => setResult(event.target.value)}
                  className="h-[500px] w-full rounded-lg border bg-white p-4 text-sm leading-relaxed text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              ) : (
                <div className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed max-h-[500px] overflow-y-auto">{markdownToPlainText(result)}</div>
              )}
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
              <p className="mt-4 text-sm text-slate-400">AI skriver din ansökningstext...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <Mail className="h-10 w-10 text-slate-200" />
              <p className="mt-4 text-sm text-slate-400">Fyll i formuläret till vänster</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
