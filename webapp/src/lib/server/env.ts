import fs from 'fs'
import path from 'path'

export type AIProvider =
  | 'openai'
  | 'deepseek'
  | 'aisweden'
  | 'groq'
  | 'openrouter'
  | 'huggingface'
  | 'anthropic'
  | 'ollama'

const AI_ENV_NAMES = new Set([
  'AI_PROVIDER',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_MODEL',
  'GROQ_API_KEY',
  'GROQ_MODEL',
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'AI_SWEDEN_API_KEY',
  'AI_SWEDEN_MODEL',
  'AI_SWEDEN_BASE_URL',
  'HUGGINGFACE_API_KEY',
  'AI_PROVIDER_TIMEOUT_MS',
  'HUGGINGFACE_API_TOKEN',
  'HUGGINGFACE_MODEL',
  'GPT_SW3_MODEL',
  'GPT_SW3_ENDPOINT',
  'OLLAMA_BASE_URL',
  'OLLAMA_MODEL',
  'OLLAMA_TIMEOUT_MS',
])

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {}

  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).reduce<Record<string, string>>((env, line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!match || !AI_ENV_NAMES.has(match[1])) return env

    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    env[match[1]] = value.trim()
    return env
  }, {})
}

function readLocalAIEnv(name: string): string | undefined {
  if (process.env.NODE_ENV === 'production') return undefined

  const envDir = process.cwd()
  const values = {
    ...parseEnvFile(path.join(envDir, '.env')),
    ...parseEnvFile(path.join(envDir, '.env.local')),
  }

  return values[name]
}

function readEnv(name: string): string {
  return (readLocalAIEnv(name) ?? process.env[name] ?? '').trim()
}

export function getSelectedAIProvider(): AIProvider {
  const configured = getConfiguredAIProvider()

  if (configured) {
    return configured
  }

  return 'openai'
}

export function getConfiguredAIProvider(): AIProvider | undefined {
  const configured = readEnv('AI_PROVIDER').toLowerCase()

  if (configured === 'gpt-sw3') {
    return 'aisweden'
  }

  if (
    configured === 'openai' ||
    configured === 'deepseek' ||
    configured === 'aisweden' ||
    configured === 'groq' ||
    configured === 'openrouter' ||
    configured === 'huggingface' ||
    configured === 'anthropic' ||
    configured === 'ollama'
  ) {
    return configured
  }

  if (configured) {
    throw new Error('AI_PROVIDER must be a supported CareerBridge AI provider.')
  }

  return undefined
}

export function getAIProviderKey(provider: AIProvider): string {
  const envName =
    provider === 'openai' ? 'OPENAI_API_KEY'
    : provider === 'deepseek' ? 'DEEPSEEK_API_KEY'
    : provider === 'aisweden' ? 'AI_SWEDEN_API_KEY'
    : provider === 'groq' ? 'GROQ_API_KEY'
    : provider === 'openrouter' ? 'OPENROUTER_API_KEY'
    : provider === 'huggingface' ? 'HUGGINGFACE_API_KEY'
    : provider === 'anthropic' ? 'ANTHROPIC_API_KEY'
    : ''
  if (!envName) return ''
  const key = readEnv(envName)

  if (!key) {
    const legacyKey = provider === 'huggingface' ? readEnv('HUGGINGFACE_API_TOKEN') : ''
    if (legacyKey) return legacyKey
    throw new Error(`Missing ${envName}.`)
  }

  return key
}

export function getOptionalEnv(name: string): string | undefined {
  const value = readEnv(name)
  return value || undefined
}

const AI_SETUP_ENV_NAMES = [
  'OPENAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY',
  'AI_SWEDEN_API_KEY',
  'HUGGINGFACE_API_KEY',
  'ANTHROPIC_API_KEY',
  'OLLAMA_BASE_URL',
]

export function getAIEnvironmentDiagnostics() {
  const missing = AI_SETUP_ENV_NAMES.filter((name) => !getOptionalEnv(name))
  const configured = AI_SETUP_ENV_NAMES.filter((name) => getOptionalEnv(name))

  return {
    configured,
    missing,
    hasAnyRemoteProvider: configured.some((name) => name.endsWith('_API_KEY')),
    hasOllama: configured.includes('OLLAMA_BASE_URL'),
  }
}

let loggedAIEnvironmentDiagnostics = false

export function logAIEnvironmentDiagnostics() {
  if (loggedAIEnvironmentDiagnostics) return
  loggedAIEnvironmentDiagnostics = true

  const diagnostics = getAIEnvironmentDiagnostics()
  if (diagnostics.missing.length === AI_SETUP_ENV_NAMES.length) {
    console.warn('No AI providers configured. CV generation will use local degraded mode.', {
      missing: diagnostics.missing,
    })
    return
  }

  if (diagnostics.missing.length > 0) {
    console.info('AI provider setup diagnostics', {
      configured: diagnostics.configured,
      missing: diagnostics.missing,
      note: 'Add another provider key to improve fallback resilience.',
    })
  }
}
