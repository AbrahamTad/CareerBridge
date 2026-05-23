import { NextResponse } from 'next/server'
import { getAIHealth } from '@/lib/ai/provider-manager'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const health = await getAIHealth()
    return NextResponse.json(health)
  } catch (error) {
    console.error('AI health check failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      {
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
