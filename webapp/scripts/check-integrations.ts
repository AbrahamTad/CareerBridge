// Live diagnostics for optional AI providers, Swedish job APIs, and local taxonomy coverage.
import { getAIHealth } from '../src/lib/ai/provider-manager'
import { providerLabel } from '../src/lib/ai/providers'
import { taxonomySummary } from '../src/lib/jobs/profession-taxonomy'
import { diagnoseSwedishJobSources } from '../src/lib/jobs/sources'
import { loadEnvFiles } from './env-utils'

loadEnvFiles()

async function main() {
  console.log('CareerBridge integration diagnostics')
  console.log('')

  // Provider and source checks are independent, so run them concurrently.
  const [aiHealth, sourceDiagnostics] = await Promise.all([
    getAIHealth(),
    diagnoseSwedishJobSources(),
  ])

  console.log('AI providers:')
  for (const provider of aiHealth.providers) {
    const suffix = provider.error ? `; ${provider.error}` : ''
    console.log(`- ${providerLabel(provider.provider)}: ${provider.checkStatus} (${provider.responseTimeMs}ms)${suffix}`)
  }

  console.log('')
  console.log('Swedish job sources:')
  for (const source of sourceDiagnostics) {
    console.log(`- ${source.source}: ${source.status} (${source.responseTimeMs}ms); ${source.details}`)
  }

  const taxonomy = taxonomySummary()
  console.log('')
  console.log(`Local profession taxonomy: ${taxonomy.professions} professions across ${taxonomy.categories} industries`)
  console.log(`AI providers working: ${aiHealth.workingProviders}/${aiHealth.configuredProviders}`)
  console.log(`Job sources enabled: ${sourceDiagnostics.filter((source) => source.enabled).length}/${sourceDiagnostics.length}`)

  // Static catalogs are allowed to be configured; only enabled live source failures fail the command.
  if (sourceDiagnostics.some((source) => source.enabled && source.status === 'failed')) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('Integration diagnostics failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
