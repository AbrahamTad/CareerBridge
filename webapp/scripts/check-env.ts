// Static environment diagnostics: validates configuration without calling external services.
import { getConfiguredAIProvider, getEnvironmentValidation, getOptionalEnv } from '../src/lib/server/env'
import { loadEnvFiles, maskValue, sourceFor } from './env-utils'

const sources = loadEnvFiles()
const validation = getEnvironmentValidation()

console.log('CareerBridge environment check')
console.log('')

console.log('Required app variables:')
for (const group of validation.required) {
  const status = group.missing ? 'missing' : 'ok'
  const configured = group.configured.length ? group.configured.join(' or ') : group.vars.join(' or ')
  console.log(`- ${status}: ${configured}`)
  if (group.missing) console.log(`  reason: ${group.reason}`)
}

console.log('')
console.log('AI provider variables:')
for (const provider of validation.providers) {
  const keySource = sourceFor(provider.key, sources)
  const fallbackSource = provider.fallbackKey ? sourceFor(provider.fallbackKey, sources) : null
  const keyValue = getOptionalEnv(provider.key) ?? (provider.fallbackKey ? getOptionalEnv(provider.fallbackKey) : undefined)
  const model = provider.model ? getOptionalEnv(provider.model) : undefined
  const baseUrl = provider.baseUrl ? getOptionalEnv(provider.baseUrl) : undefined
  const configText = provider.configured ? `configured (${maskValue(keyValue)})` : 'missing optional key/config'
  const sourceText = fallbackSource && fallbackSource !== 'missing'
    ? `${provider.key}: ${keySource}, ${provider.fallbackKey}: ${fallbackSource}`
    : `${provider.key}: ${keySource}`

  console.log(`- ${provider.provider}: ${configText}; ${sourceText}`)
  if (model) console.log(`  model: ${model}`)
  if (baseUrl) console.log(`  base URL: ${baseUrl}`)
}

try {
  const selected = getConfiguredAIProvider()
  if (selected) {
    console.log(`\nAI_PROVIDER override: ${selected}`)
    const selectedProvider = validation.providers.find((provider) => provider.provider === selected)
    if (selectedProvider && !selectedProvider.configured) {
      console.log(`warning: AI_PROVIDER points to ${selected}, but ${selectedProvider.key} is missing or empty.`)
    }
  }
} catch (error) {
  console.log(`\nAI_PROVIDER override: invalid (${error instanceof Error ? error.message : String(error)})`)
  process.exitCode = 1
}

if (validation.missingRequired.length > 0) {
  console.log('')
  console.log('Missing required app variables must be set before running the webapp.')
  process.exitCode = 1
} else {
  console.log('')
  console.log('Required app variables are configured.')
}

if (validation.missingOptionalProviders.length > 0) {
  console.log('')
  console.log(`Optional AI providers not configured: ${validation.missingOptionalProviders.map((provider) => provider.provider).join(', ')}`)
}

console.log('')
console.log('Swedish job sources:')
for (const source of validation.jobSources) {
  console.log(`- ${source.source}: ${source.enabled ? 'enabled' : 'disabled'} (${source.enabledKey})`)
  if (source.baseUrl) console.log(`  base URL: ${source.baseUrl}`)
  if (!source.validBaseUrl) {
    console.log('  error: base URL must use http:// or https://')
    process.exitCode = 1
  }
}
