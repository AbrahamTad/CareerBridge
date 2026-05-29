import { completeWithProviderFallback, getAIHealth } from '../src/lib/ai/provider-manager'
import { providerLabel } from '../src/lib/ai/providers'
import { loadEnvFiles } from './env-utils'

loadEnvFiles()

async function main() {
  console.log('CareerBridge AI fallback test')
  const health = await getAIHealth()
  const working = health.providers.filter((provider) => provider.available)

  if (working.length === 0) {
    console.log('No remote or local AI provider is working. Emergency local CV fallback remains available.')
    return
  }

  console.log(`Working providers: ${working.map((provider) => providerLabel(provider.provider)).join(', ')}`)
  const response = await completeWithProviderFallback({
    task: 'cv-analysis',
    maxTokens: 16,
    system: 'Reply with OK only.',
    user: 'OK',
  })

  if (!response.trim()) throw new Error('Fallback test returned an empty response.')
  console.log(`Fallback completion OK: ${response.trim().slice(0, 80)}`)
}

main().catch((error) => {
  console.error('AI fallback test failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
