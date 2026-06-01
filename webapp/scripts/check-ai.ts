// Suppress the [AI] Providers startup log — we produce our own output
const _origInfo = console.info.bind(console)
console.info = (...args: unknown[]) => {
  const msg = String(args[0] ?? '')
  if (msg.startsWith('[AI] Providers:')) return
  _origInfo(...args)
}

import { getAIHealth } from '../src/lib/ai/provider-manager'
import type { AIProviderCheckStatus, ProviderHealth } from '../src/lib/ai/types'
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
  ollama: 'Ollama',
}

function badge(p: ProviderHealth): string {
  const map: Record<AIProviderCheckStatus, string> = {
    working: '✓ Working',
    'missing key': '✗ Missing API Key',
    'invalid key': '✗ Invalid API Key',
    'insufficient permissions': '✗ Insufficient Permissions',
    'quota exceeded': '✗ Quota Exceeded',
    timeout: '✗ Timeout',
    'server offline': '✗ Offline',
    skipped: '○ Skipped',
    'unknown error': '✗ Error',
  }
  return map[p.checkStatus] ?? `✗ ${p.checkStatus}`
}

async function main() {
  console.log('\nCareerBridge AI provider check\n')

  const health = await getAIHealth()

  const maxLen = Math.max(...health.providers.map((p) => (LABELS[p.provider] ?? p.provider).length))

  let working = 0
  let quotaExceeded = 0
  let offline = 0
  let missingKeys = 0
  let errors = 0

  for (const p of health.providers) {
    const label = (LABELS[p.provider] ?? p.provider).padEnd(maxLen + 2)
    console.log(`${label}${badge(p)}`)

    if (p.checkStatus === 'working') working++
    else if (p.checkStatus === 'quota exceeded') quotaExceeded++
    else if (p.checkStatus === 'server offline') offline++
    else if (p.checkStatus === 'missing key' || p.checkStatus === 'skipped') missingKeys++
    else errors++
  }

  console.log('')
  console.log(`Configured:     ${health.configuredProviders}`)
  console.log(`Working:        ${working}`)
  if (offline > 0) console.log(`Offline:        ${offline}`)
  if (quotaExceeded > 0) console.log(`Quota Exceeded: ${quotaExceeded}`)
  if (missingKeys > 0) console.log(`Missing Keys:   ${missingKeys}`)
  if (errors > 0) console.log(`Errors:         ${errors}`)
  console.log('')

  if (working === 0) {
    console.log('No AI providers are working. The app uses local fallback mode.')
    console.log('Add API keys to webapp/.env.local — DeepSeek and Groq both have free tiers.\n')
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('check-ai failed:', err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
