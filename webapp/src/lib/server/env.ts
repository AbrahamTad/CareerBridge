// Server-side environment loading and validation for app services, AI providers, and job sources.
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

// Only these names may be read from local env files by this helper.
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
  'AI_SWEDEN_PROVIDER',
  'AI_SWEDEN_MODEL',
  'AI_SWEDEN_BASE_URL',
  'HUGGINGFACE_API_KEY',
  'HUGGINGFACE_BASE_URL',
  'AI_PROVIDER_TIMEOUT_MS',
  'HF_TOKEN',
  'HUGGINGFACE_API_TOKEN',
  'HUGGINGFACE_MODEL',
  'GPT_SW3_MODEL',
  'GPT_SW3_ENDPOINT',
  'OLLAMA_BASE_URL',
  'OLLAMA_MODEL',
  'OLLAMA_TIMEOUT_MS',
  'ARBETSFORMEDLINGEN_JOBSEARCH_BASE_URL',
  'JOBTECH_TAXONOMY_BASE_URL',
  'JOB_SOURCE_TIMEOUT_MS',
  'JOB_SOURCE_RETRY_COUNT',
  'ENABLE_ARBETSFORMEDLINGEN',
  'ENABLE_JOBTECH_TAXONOMY',
  'ENABLE_KOMMUN_JOBS',
  'ENABLE_REGION_JOBS',
  'ENABLE_COMPANY_CAREER_PAGES',
  'ENABLE_LIA_PRAKTIK_SEARCH',
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
  { provider: 'huggingface', key: 'HUGGINGFACE_API_KEY', fallbackKeys: ['HF_TOKEN', 'HUGGINGFACE_API_TOKEN'], model: 'HUGGINGFACE_MODEL', baseUrl: 'HUGGINGFACE_BASE_URL' },
  { provider: 'aisweden', key: 'AI_SWEDEN_API_KEY', fallbackKeys: ['HUGGINGFACE_API_KEY', 'HF_TOKEN', 'HUGGINGFACE_API_TOKEN'], model: 'AI_SWEDEN_MODEL', baseUrl: 'AI_SWEDEN_BASE_URL' },
  { provider: 'ollama', key: 'OLLAMA_BASE_URL', model: 'OLLAMA_MODEL', local: true },
] as const

export const OPTIONAL_JOB_SOURCE_ENV = [
  { source: 'arbetsformedlingen', enabledKey: 'ENABLE_ARBETSFORMEDLINGEN', baseUrlKey: 'ARBETSFORMEDLINGEN_JOBSEARCH_BASE_URL', defaultEnabled: true },
  { source: 'jobtech-taxonomy', enabledKey: 'ENABLE_JOBTECH_TAXONOMY', baseUrlKey: 'JOBTECH_TAXONOMY_BASE_URL', defaultEnabled: true },
  { source: 'kommun-jobs', enabledKey: 'ENABLE_KOMMUN_JOBS', defaultEnabled: true },
  { source: 'region-jobs', enabledKey: 'ENABLE_REGION_JOBS', defaultEnabled: true },
  { source: 'company-career-pages', enabledKey: 'ENABLE_COMPANY_CAREER_PAGES', defaultEnabled: true },
  { source: 'lia-praktik-search', enabledKey: 'ENABLE_LIA_PRAKTIK_SEARCH', defaultEnabled: true },
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

// Read local env files in development so diagnostics match the Next.js runtime configuration.
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
    // Accept the standard Hugging Face token name and the older project alias.
    const huggingFaceKey = readEnv('HF_TOKEN') || readEnv('HUGGINGFACE_API_TOKEN')
    if (provider === 'huggingface' && huggingFaceKey) return huggingFaceKey
    if (
      provider === 'aisweden' &&
      readEnv('AI_SWEDEN_PROVIDER').toLowerCase() === 'huggingface'
    ) {
      const hostedModelKey = readEnv('HUGGINGFACE_API_KEY') || huggingFaceKey
      if (hostedModelKey) return hostedModelKey
    }
    throw new Error(`Missing ${envName}.`)
  }

  return key
}

export function getOptionalEnv(name: string): string | undefined {
  const value = readEnv(name)
  return value || undefined
}

// Environment switches accept common false-like values and default consistently.
export function getBooleanEnv(name: string, defaultValue = false): boolean {
  const value = getOptionalEnv(name)
  if (!value) return defaultValue
  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase())
}

function isHttpUrl(value?: string) {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const AI_SETUP_PROVIDERS = [
  { provider: 'gemini', label: 'Gemini', requirement: 'GEMINI_API_KEY' },
  { provider: 'openai', label: 'OpenAI', requirement: 'OPENAI_API_KEY' },
  { provider: 'deepseek', label: 'DeepSeek', requirement: 'DEEPSEEK_API_KEY' },
  { provider: 'groq', label: 'Groq', requirement: 'GROQ_API_KEY' },
  { provider: 'openrouter', label: 'OpenRouter', requirement: 'OPENROUTER_API_KEY' },
  { provider: 'anthropic', label: 'Anthropic', requirement: 'ANTHROPIC_API_KEY' },
  { provider: 'huggingface', label: 'Hugging Face', requirement: 'HUGGINGFACE_API_KEY or HF_TOKEN' },
  { provider: 'aisweden', label: 'AI Sweden', requirement: 'AI_SWEDEN_API_KEY or Hugging Face fallback' },
  { provider: 'ollama', label: 'Ollama', requirement: 'OLLAMA_BASE_URL' },
] as const

// Validate presence and URL shape without logging secret values.
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
    const configured = provider.provider === 'ollama'
      ? Boolean(getOptionalEnv(provider.key))
      : (() => {
          try {
            getAIProviderKey(provider.provider)
            return true
          } catch {
            return false
          }
        })()

    return {
      provider: provider.provider,
      key: provider.key,
      fallbackKeys: 'fallbackKeys' in provider ? provider.fallbackKeys : undefined,
      model: provider.model,
      baseUrl: 'baseUrl' in provider ? provider.baseUrl : undefined,
      configured,
      local: 'local' in provider ? provider.local === true : false,
    }
  })
  const jobSources = OPTIONAL_JOB_SOURCE_ENV.map((source) => ({
    ...source,
    enabled: getBooleanEnv(source.enabledKey, source.defaultEnabled),
    baseUrl: 'baseUrlKey' in source ? getOptionalEnv(source.baseUrlKey) : undefined,
    validBaseUrl: 'baseUrlKey' in source ? isHttpUrl(getOptionalEnv(source.baseUrlKey)) : true,
  }))

  return {
    required,
    missingRequired: required.filter((group) => group.missing),
    providers,
    configuredProviders: providers.filter((provider) => provider.configured),
    missingOptionalProviders: providers.filter((provider) => !provider.configured),
    jobSources,
  }
}

export function getAIEnvironmentDiagnostics() {
  const configured = AI_SETUP_PROVIDERS.filter(({ provider }) => {
    if (provider === 'ollama') return Boolean(getOptionalEnv('OLLAMA_BASE_URL'))
    try {
      getAIProviderKey(provider)
      return true
    } catch {
      return false
    }
  }).map(({ provider }) => provider)
  const missing = AI_SETUP_PROVIDERS
    .filter(({ provider }) => !configured.includes(provider))
    .map(({ provider }) => provider)

  return {
    configured,
    missing,
    hasAnyRemoteProvider: configured.some((provider) => provider !== 'ollama'),
    hasOllama: configured.includes('ollama'),
  }
}

let loggedAIEnvironmentDiagnostics = false

// Log provider availability once per process without exposing API keys.
export function logAIEnvironmentDiagnostics() {
  if (loggedAIEnvironmentDiagnostics) return
  loggedAIEnvironmentDiagnostics = true

  const diagnostics = getAIEnvironmentDiagnostics()
  const lines = AI_SETUP_PROVIDERS.map(({ provider, label, requirement }) => {
    return diagnostics.configured.includes(provider)
      ? `[ok] ${label} configured`
      : `[missing] ${label} - ${requirement} not set`
  })

  if (diagnostics.missing.length === AI_SETUP_PROVIDERS.length) {
    console.warn('[AI] No providers configured - using local fallback mode')
    console.warn('[AI] Providers:\n' + lines.join('\n'))
    return
  }

  console.info('[AI] Providers:\n' + lines.join('\n'))
}
