'use client'

import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <h2 className="font-semibold text-red-900">Något gick fel</h2>
          <p className="mt-1.5 text-sm text-red-700">
            {this.state.error.message || 'Ett oväntat fel uppstod på den här sidan.'}
          </p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload() }}
            className="mt-4 flex items-center gap-2 mx-auto rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            <RefreshCw className="h-4 w-4" />
            Ladda om sidan
          </button>
        </div>
      </div>
    )
  }
}
