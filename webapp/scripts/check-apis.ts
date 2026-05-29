import { getAIHealth } from '../src/lib/ai/provider-manager'
import { providerLabel } from '../src/lib/ai/providers'
import type { ProviderHealth } from '../src/lib/ai/types'
import { loadEnvFiles } from './env-utils'

loadEnvFiles()

function formatProvider(provider: ProviderHealth) {
  const label = providerLabel(provider.provider)
  const configured = provider.configured ? 'configured' : 'missing'
  const model = provider.model || 'default'
  const timing = `${provider.responseTimeMs}ms`
  const error = provider.error ? `; ${provider.error}` : ''
  return `${label}: ${provider.checkStatus} (${configured}, model: ${model}, ${timing})${error}`
}

async function main() {
  console.log('CareerBridge API provider check')
  console.log('Configured providers receive a tiny live completion request; missing providers are skipped.')
  console.log('')

  const health = await getAIHealth()
  for (const provider of health.providers) {
    console.log(`- ${formatProvider(provider)}`)
  }

  console.log('')
  console.log(`Working providers: ${health.workingProviders}/${health.configuredProviders}`)
  if (health.activeProvider) {
    console.log(`Active provider: ${providerLabel(health.activeProvider)}`)
  } else {
    console.log('Active provider: none; local template CV fallback will be used for CV generation.')
  }
}

main().catch((error) => {
  console.error('API provider check failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
