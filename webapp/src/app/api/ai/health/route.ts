import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAIHealth } from '@/lib/ai/provider-manager'
import type { AIProvider } from '@/lib/ai/types'

export const dynamic = 'force-dynamic'

const PROVIDERS: AIProvider[] = [
  'gemini',
  'openai',
  'deepseek',
  'groq',
  'openrouter',
  'anthropic',
  'huggingface',
  'aisweden',
  'ollama',
]

function providerFromRequest(request: NextRequest): AIProvider | undefined {
  const provider = request.nextUrl.searchParams.get('provider')
  return PROVIDERS.find((candidate) => candidate === provider)
}

export async function GET(request: NextRequest) {
  try {
    const health = await getAIHealth(providerFromRequest(request))
    return NextResponse.json(health)
  } catch (error) {
    console.error('AI health check failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      {
        gemini: false,
        openai: false,
        anthropic: false,
        deepseek: false,
        groq: false,
        openrouter: false,
        aiSweden: false,
        huggingface: false,
        ollama: false,
        activeProvider: null,
        fallbackProvider: null,
        providers: [],
        checkedAt: new Date().toISOString(),
        configuredProviders: 0,
        workingProviders: 0,
        error: 'AI health check unavailable',
      },
      { status: 200 }
    )
  }
}
