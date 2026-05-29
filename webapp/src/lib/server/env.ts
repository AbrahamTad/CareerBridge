import fs from 'fs'
import path from 'path'

export type AIProvider =
  | 'gemini'
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
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'DIRECT_URL',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_MODEL',
  'DEEPSEEK_BASE_URL',
  'GROQ_API_KEY',
  'GROQ_MODEL',
  'GROQ_BASE_URL',
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
  'OPENROUTER_BASE_URL',
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
  'NEXT_PUBLIC_APP_URL',
])

const REQUIRED_ENV_GROUPS = [
  {
    name: 'Supabase URL',
    vars: ['NEXT_PUBLIC_SUPABASE_URL'],
    reason: 'Supabase auth and database-backed routes need the project URL.',
  },
  {
    name: 'Supabase anon key',
    vars: ['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    reason: 'Supabase browser and server auth clients need the anon key.',
  },
  {
    name: 'Supabase service role key',
    vars: ['SUPABASE_SERVICE_ROLE_KEY'],
    reason: 'Account and admin server routes need the service role key.',
  },
  {
    name: 'Database URL',
    vars: ['DATABASE_URL', 'DIRECT_URL'],
    reason: 'Prisma needs at least one database connection string.',
  },
]

export const OPTIONAL_AI_PROVIDER_ENV = [
  { provider: 'gemini', key: 'GEMINI_API_KEY', model: 'GEMINI_MODEL', baseUrl: 'GEMINI_BASE_URL' },
  { provider: 'openai', key: 'OPENAI_API_KEY', model: 'OPENAI_MODEL' },
  { provider: 'deepseek', key: 'DEEPSEEK_API_KEY', model: 'DEEPSEEK_MODEL', baseUrl: 'DEEPSEEK_BASE_URL' },
  { provider: 'groq', key: 'GROQ_API_KEY', model: 'GROQ_MODEL', baseUrl: 'GROQ_BASE_URL' },
  { provider: 'openrouter', key: 'OPENROUTER_API_KEY', model: 'OPENROUTER_MODEL', baseUrl: 'OPENROUTER_BASE_URL' },
  { provider: 'anthropic', key: 'ANTHROPIC_API_KEY', model: 'ANTHROPIC_MODEL' },
  { provider: 'huggingface', key: 'HUGGINGFACE_API_KEY', fallbackKey: 'HUGGINGFACE_API_TOKEN', model: 'HUGGINGFACE_MODEL' },
  { provider: 'aisweden', key: 'AI_SWEDEN_API_KEY', model: 'AI_SWEDEN_MODEL', baseUrl: 'AI_SWEDEN_BASE_URL' },
  { provider: 'ollama', key: 'OLLAMA_BASE_URL', model: 'OLLAMA_MODEL', local: true },
] as const

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

  return 'gemini'
}

export function getConfiguredAIProvider(): AIProvider | undefined {
  const configured = readEnv('AI_PROVIDER').toLowerCase()

  if (configured === 'gpt-sw3') {
    return 'aisweden'
  }

  if (
    configured === 'gemini' ||
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
    provider === 'gemini' ? 'GEMINI_API_KEY'
    : provider === 'openai' ? 'OPENAI_API_KEY'
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
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY',
  'AI_SWEDEN_API_KEY',
  'HUGGINGFACE_API_KEY',
  'ANTHROPIC_API_KEY',
  'OLLAMA_BASE_URL',
]

export function getEnvironmentValidation() {
  const required = REQUIRED_ENV_GROUPS.map((group) => {
    const configured = group.vars.filter((name) => Boolean(getOptionalEnv(name)))
    return {
      ...group,
      configured,
      missing: configured.length === 0,
    }
  })

  const providers = OPTIONAL_AI_PROVIDER_ENV.map((provider) => {
    const configured = Boolean(getOptionalEnv(provider.key)) ||
      ('fallbackKey' in provider && Boolean(getOptionalEnv(provider.fallbackKey)))

    return {
      provider: provider.provider,
      key: provider.key,
      fallbackKey: 'fallbackKey' in provider ? provider.fallbackKey : undefined,
      model: provider.model,
      baseUrl: 'baseUrl' in provider ? provider.baseUrl : undefined,
      configured,
      local: 'local' in provider ? provider.local === true : false,
    }
  })

  return {
    required,
    missingRequired: required.filter((group) => group.missing),
    providers,
    configuredProviders: providers.filter((provider) => provider.configured),
    missingOptionalProviders: providers.filter((provider) => !provider.configured),
  }
}

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
