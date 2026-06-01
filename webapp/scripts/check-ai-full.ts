const _origInfo = console.info.bind(console)
console.info = (...args: unknown[]) => {
  const msg = String(args[0] ?? '')
  if (msg.startsWith('[AI] Providers:')) return
  _origInfo(...args)
}

import { getAIHealth } from '../src/lib/ai/provider-manager'
import type { ProviderHealth } from '../src/lib/ai/types'
import { loadEnvFiles } from './env-utils'

loadEnvFiles()

const LABELS: Record<string, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
  huggingface: 'Hugging Face',
  aisweden: 'AI Sweden',
  ollama: 'Ollama (local)',
}

function formatDate(iso?: string) {
  if (!iso) return 'never'
  return new Date(iso).toLocaleString('sv-SE')
}

function statusLine(p: ProviderHealth): string {
  if (p.checkStatus === 'working') return `✓  working  (${p.responseTimeMs}ms)`
  if (p.checkStatus === 'quota exceeded') return `✗  quota exceeded`
  if (p.checkStatus === 'missing key') return `✗  missing key (${p.envKey})`
  if (p.checkStatus === 'invalid key') return `✗  invalid key`
  if (p.checkStatus === 'insufficient permissions') return `✗  insufficient permissions`
  if (p.checkStatus === 'server offline') return `✗  offline`
  if (p.checkStatus === 'timeout') return `✗  timeout (${p.responseTimeMs}ms)`
  if (p.checkStatus === 'skipped') return `○  not configured`
  return `✗  ${p.checkStatus}`
}

async function main() {
  console.log('\nCareerBridge AI provider diagnostics (full)\n')
  console.log('Making live test requests — this may take 10-15 seconds...\n')

  const health = await getAIHealth()

  for (const p of health.providers) {
    const label = LABELS[p.provider] ?? p.provider
    console.log(`── ${label}`)
    console.log(`   Status:       ${statusLine(p)}`)
    console.log(`   Model:        ${p.model || 'default'}`)
    console.log(`   Key present:  ${p.configured ? 'yes' : 'no'}`)
    console.log(`   Last success: ${formatDate(p.lastSuccessAt)}`)
    console.log(`   Last failure: ${formatDate(p.lastErrorAt)}`)
    if (p.disabledUntil) {
      console.log(`   Disabled until: ${formatDate(p.disabledUntil)}`)
    }
    if (p.error) {
      console.log(`   Error: ${p.error}`)
    }
    console.log('')
  }

  console.log('── Summary')
  console.log(`   Configured providers: ${health.configuredProviders}`)
  console.log(`   Working providers:    ${health.workingProviders}`)
  if (health.activeProvider) console.log(`   Active provider:      ${LABELS[health.activeProvider] ?? health.activeProvider}`)
  if (health.fallbackProvider) console.log(`   Fallback provider:    ${LABELS[health.fallbackProvider] ?? health.fallbackProvider}`)
  console.log('')

  if (health.workingProviders === 0) {
    console.log('No working providers. The app uses local fallback mode.')
    console.log('Add API keys to webapp/.env.local — DeepSeek and Groq have generous free tiers.\n')
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('check-ai-full failed:', err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
