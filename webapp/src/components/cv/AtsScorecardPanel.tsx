'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { AtsScore } from '@/lib/ai/ats-scorer'

const GRADE_COLORS: Record<AtsScore['grade'], string> = {
  A: 'bg-green-100 text-green-800 border-green-200',
  B: 'bg-blue-100 text-blue-800 border-blue-200',
  C: 'bg-amber-100 text-amber-800 border-amber-200',
  D: 'bg-red-100 text-red-800 border-red-200',
}

const GRADE_BAR: Record<AtsScore['grade'], string> = {
  A: 'bg-green-500',
  B: 'bg-blue-500',
  C: 'bg-amber-500',
  D: 'bg-red-500',
}

export function AtsScorecardPanel({ ats }: { ats: AtsScore }) {
  const [expanded, setExpanded] = useState(false)

  if (ats.total === 0) return null

  return (
    <div className={`rounded-lg border p-3 text-sm ${GRADE_COLORS[ats.grade]}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold">{ats.grade}</span>
          <div>
            <p className="font-semibold leading-tight">ATS-poäng: {ats.score}/100</p>
            <p className="text-xs opacity-75">{ats.present.length} av {ats.total} nyckelord matchade</p>
          </div>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded border px-2 py-1 text-xs font-medium opacity-80 hover:opacity-100"
        >
          {expanded ? 'Dölj' : 'Visa detaljer'}
        </button>
      </div>

      <div className="mt-2 h-1.5 w-full rounded-full bg-black/10">
        <div
          className={`h-1.5 rounded-full ${GRADE_BAR[ats.grade]}`}
          style={{ width: `${ats.score}%` }}
        />
      </div>

      {expanded && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {ats.present.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide opacity-70">
                <CheckCircle2 className="h-3.5 w-3.5" /> Hittades
              </p>
              <div className="flex flex-wrap gap-1">
                {ats.present.map((kw) => (
                  <span key={kw} className="rounded bg-green-200/60 px-1.5 py-0.5 text-xs text-green-900">{kw}</span>
                ))}
              </div>
            </div>
          )}
          {ats.missing.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide opacity-70">
                <XCircle className="h-3.5 w-3.5" /> Saknas
              </p>
              <div className="flex flex-wrap gap-1">
                {ats.missing.map((kw) => (
                  <span key={kw} className="rounded bg-red-200/60 px-1.5 py-0.5 text-xs text-red-900">{kw}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
