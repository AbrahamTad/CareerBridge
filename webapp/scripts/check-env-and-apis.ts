// Safe combined diagnostics for local environment files, provider credentials, and public APIs.
import fs from 'fs'
import path from 'path'
import { providerClients, providerLabel, isProviderConfigured } from '../src/lib/ai/providers'
import { AIProviderError, type AIProvider } from '../src/lib/ai/types'
import { sanitizeProviderMessage } from '../src/lib/ai/providers/utils'
import { getEnvironmentValidation, getOptionalEnv } from '../src/lib/server/env'
import { inspectEnvFiles, loadEnvFiles, maskValue } from './env-utils'

type Problem = {
  provider: string
  variable: string
  problem: string
  reason: string
  fix: string
  blocking?: boolean
}

type UrlCheck = {
  label: string
  variable: string
  baseUrl: string
  requestUrl?: string
  method?: 'GET' | 'HEAD'
  required?: boolean
}

type UrlResult = UrlCheck & {
  valid: boolean
  reachable: boolean
  status: string
}

const PROVIDERS: AIProvider[] = [
  'openai',
  'anthropic',
  'gemini',
  'deepseek',
  'groq',
  'openrouter',
  'huggingface',
  'aisweden',
  'ollama',
]

const EXPECTED_ENV_NAMES = new Set([
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'DIRECT_URL',
  'NEXT_PUBLIC_APP_URL',
  'DEV_AI_CALLS_LIMIT',
  'DISABLE_AI_USAGE_LIMITS',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRO_PRICE_ID',
  'AI_PROVIDER',
  'AI_PROVIDER_TIMEOUT_MS',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_MODEL',
  'DEEPSEEK_BASE_URL',
  'GROQ_API_KEY',
  'GROQ_MODEL',
  'GROQ_BASE_URL',
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
  'OPENROUTER_BASE_URL',
  'HUGGINGFACE_API_KEY',
  'HF_TOKEN',
  'HUGGINGFACE_API_TOKEN',
  'HUGGINGFACE_BASE_URL',
  'HUGGINGFACE_MODEL',
  'AI_SWEDEN_API_KEY',
  'AI_SWEDEN_PROVIDER',
  'AI_SWEDEN_MODEL',
  'AI_SWEDEN_BASE_URL',
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
])

const PUBLIC_ENV_NAMES = new Set([
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
])

const SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|DIRECT_URL)/i
const DEFAULT_HUGGING_FACE_BASE_URL = 'https://router.huggingface.co/v1'
const URL_LABEL_BY_PROVIDER: Partial<Record<AIProvider, string>> = {
  anthropic: 'Anthropic',
  aisweden: 'AI Sweden',
}

function collectEffectiveEntries() {
  const inspections = inspectEnvFiles()
  const runtimeFiles = inspections.filter(({ file }) => file === '.env' || file === '.env.local')
  const effective = new Map<string, { file: string; line: number; value: string }>()
  const layers = new Map<string, string[]>()

  for (const inspection of runtimeFiles) {
    for (const entry of inspection.entries) {
      effective.set(entry.name, entry)
      layers.set(entry.name, [...(layers.get(entry.name) ?? []), `${entry.file}:${entry.line}`])
    }
  }

  return { inspections, effective, layers }
}

function listCodeEnvNames() {
  const roots = ['src', 'scripts', 'prisma'].map((folder) => path.join(process.cwd(), folder))
  const names = new Set<string>()
  const extensions = new Set(['.ts', '.tsx', '.js', '.mjs'])

  function scan(directory: string) {
    if (!fs.existsSync(directory)) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        scan(filePath)
      } else if (entry.name === 'check-env-and-apis.ts') {
        continue
      } else if (extensions.has(path.extname(entry.name))) {
        const source = fs.readFileSync(filePath, 'utf8')
        for (const match of source.matchAll(/\b[A-Z][A-Z0-9_]{2,}\b/g)) names.add(match[0])
      }
    }
  }

  roots.forEach(scan)
  return new Set([...names].filter((name) => EXPECTED_ENV_NAMES.has(name)))
}

function isSecret(name: string) {
  return SECRET_NAME.test(name) && !PUBLIC_ENV_NAMES.has(name)
}

function looksLikePlaceholder(value: string) {
  return /(?:replace_me|your[-_]|xxxxx|password)/i.test(value)
}

function normalizeUrl(value: string) {
  return value.replace(/\/+$/, '')
}

function urlChecks(): UrlCheck[] {
  const jobSearch = normalizeUrl(getOptionalEnv('ARBETSFORMEDLINGEN_JOBSEARCH_BASE_URL') ?? 'https://jobsearch.api.jobtechdev.se')
  const taxonomy = normalizeUrl(getOptionalEnv('JOBTECH_TAXONOMY_BASE_URL') ?? 'https://taxonomy.api.jobtechdev.se')
  const huggingFace = normalizeUrl(getOptionalEnv('HUGGINGFACE_BASE_URL') ?? DEFAULT_HUGGING_FACE_BASE_URL)
  const ollama = normalizeUrl(getOptionalEnv('OLLAMA_BASE_URL') ?? 'http://localhost:11434')
  const checks: UrlCheck[] = [
    {
      label: 'Arbetsformedlingen',
      variable: 'ARBETSFORMEDLINGEN_JOBSEARCH_BASE_URL',
      baseUrl: jobSearch,
      requestUrl: `${jobSearch}/search?${new URLSearchParams({ q: 'underskoterska', limit: '1' })}`,
      method: 'GET',
      required: true,
    },
    {
      label: 'JobTech Taxonomy',
      variable: 'JOBTECH_TAXONOMY_BASE_URL',
      baseUrl: taxonomy,
      requestUrl: `${taxonomy}/v1/taxonomy/main/concepts?type=occupation-name`,
      method: 'GET',
      required: true,
    },
    { label: 'OpenAI', variable: 'OPENAI_API_KEY', baseUrl: 'https://api.openai.com/v1' },
    { label: 'Anthropic', variable: 'ANTHROPIC_API_KEY', baseUrl: 'https://api.anthropic.com/v1' },
    { label: 'Gemini', variable: 'GEMINI_BASE_URL', baseUrl: getOptionalEnv('GEMINI_BASE_URL') ?? 'https://generativelanguage.googleapis.com/v1beta' },
    { label: 'DeepSeek', variable: 'DEEPSEEK_BASE_URL', baseUrl: getOptionalEnv('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com/v1' },
    { label: 'Groq', variable: 'GROQ_BASE_URL', baseUrl: getOptionalEnv('GROQ_BASE_URL') ?? 'https://api.groq.com/openai/v1' },
    { label: 'OpenRouter', variable: 'OPENROUTER_BASE_URL', baseUrl: getOptionalEnv('OPENROUTER_BASE_URL') ?? 'https://openrouter.ai/api/v1' },
    { label: 'Hugging Face', variable: 'HUGGINGFACE_BASE_URL', baseUrl: huggingFace },
    { label: 'Ollama', variable: 'OLLAMA_BASE_URL', baseUrl: ollama, requestUrl: `${ollama}/api/tags`, method: 'GET' },
  ]
  const aiSweden = getOptionalEnv('AI_SWEDEN_BASE_URL') ??
    getOptionalEnv('GPT_SW3_ENDPOINT') ??
    (getOptionalEnv('AI_SWEDEN_PROVIDER')?.toLowerCase() === 'huggingface' ? huggingFace : undefined)
  if (aiSweden) checks.push({ label: 'AI Sweden', variable: 'AI_SWEDEN_BASE_URL', baseUrl: aiSweden })
  return checks
}

async function probeUrl(check: UrlCheck): Promise<UrlResult> {
  try {
    new URL(check.baseUrl)
  } catch {
    return { ...check, valid: false, reachable: false, status: 'invalid URL' }
  }

  try {
    const response = await fetch(check.requestUrl ?? check.baseUrl, {
      method: check.method ?? 'HEAD',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    })
    return {
      ...check,
      valid: true,
      reachable: response.status < 500,
      status: `HTTP ${response.status}`,
    }
  } catch {
    return { ...check, valid: true, reachable: false, status: 'unreachable' }
  }
}

function providerReason(error: unknown) {
  if (error instanceof AIProviderError) {
    if (error.status === 402) return 'billing required or insufficient balance'
    const reasons: Partial<Record<AIProviderError['code'], string>> = {
      missing_api_key: 'missing key',
      missing_configuration: 'missing configuration',
      invalid_api_key: 'invalid key',
      insufficient_permissions: 'insufficient inference permissions',
      quota_exceeded: 'quota exceeded',
      server_offline: 'server offline',
      timeout: 'timeout',
      invalid_response: 'invalid response',
    }
    return reasons[error.code] ?? (error.status ? `HTTP ${error.status}` : 'request failed')
  }
  return sanitizeProviderMessage(error instanceof Error ? error.message : String(error)).slice(0, 80)
}

async function probeProvider(provider: AIProvider) {
  if (!isProviderConfigured(provider)) {
    return { provider, present: false, live: 'skipped', status: 'missing key' }
  }

  try {
    const available = await providerClients[provider].healthCheck?.(AbortSignal.timeout(10_000)) ?? true
    return { provider, present: true, live: available ? 'passed' : 'failed', status: available ? 'ok' : 'unavailable' }
  } catch (error) {
    return { provider, present: true, live: 'failed', status: providerReason(error) }
  }
}

function printTable(headers: string[], rows: string[][]) {
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)))
  const line = (row: string[]) => row.map((value, index) => value.padEnd(widths[index]!)).join('  ')
  console.log(line(headers))
  console.log(line(widths.map((width) => '-'.repeat(width))))
  rows.forEach((row) => console.log(line(row)))
}

async function main() {
  loadEnvFiles()
  const { inspections, effective, layers } = collectEffectiveEntries()
  const validation = getEnvironmentValidation()
  const problems: Problem[] = []

  console.log('CareerBridge Environment Diagnostics')
  console.log('')
  console.log('Environment files:')
  inspections.forEach(({ file, found }) => console.log(`- ${file}: ${found ? 'found' : 'missing'}`))

  const empty = [...effective.entries()].filter(([, entry]) => !entry.value).map(([name]) => name).sort()
  const duplicates = inspections.flatMap(({ file, duplicates: fileDuplicates }) =>
    fileDuplicates.map(({ name, lines }) => `${name} (${file}:${lines.join(',')})`)
  )
  const invalidLines = inspections.flatMap(({ file, invalidLines: fileInvalidLines }) =>
    fileInvalidLines.map((line) => `${file}:${line}`)
  )
  const overrides = [...layers.entries()].filter(([, locations]) => locations.length > 1)

  console.log('')
  console.log(`Empty values: ${empty.length ? empty.join(', ') : 'none'}`)
  console.log(`Duplicate declarations in one file: ${duplicates.length ? duplicates.join(', ') : 'none'}`)
  console.log(`Invalid env lines: ${invalidLines.length ? invalidLines.join(', ') : 'none'}`)
  console.log(`Layered overrides (.env -> .env.local): ${overrides.length ? overrides.map(([name]) => name).sort().join(', ') : 'none'}`)
  for (const location of invalidLines) {
    problems.push({
      provider: 'Environment syntax',
      variable: location,
      problem: 'Environment line could not be parsed',
      reason: 'Each active line must use NAME=value syntax.',
      fix: 'Correct or remove the malformed line.',
      blocking: true,
    })
  }

  const runtimeInspections = inspections.filter(({ file }) => file === '.env' || file === '.env.local')
  const baseEntries = new Map(runtimeInspections.find(({ file }) => file === '.env')?.entries.map((entry) => [entry.name, entry]) ?? [])
  const localEntries = new Map(runtimeInspections.find(({ file }) => file === '.env.local')?.entries.map((entry) => [entry.name, entry]) ?? [])
  for (const [name, baseEntry] of baseEntries) {
    const localEntry = localEntries.get(name)
    if (baseEntry.value && localEntry && !localEntry.value) {
      problems.push({
        provider: 'Environment layering',
        variable: name,
        problem: 'Empty .env.local value overrides a configured .env value',
        reason: '.env.local takes precedence over .env during local development.',
        fix: 'Set the intended value in .env.local or remove the empty override.',
      })
    }
    if (isSecret(name) && baseEntry.value && !looksLikePlaceholder(baseEntry.value)) {
      problems.push({
        provider: 'Environment structure',
        variable: name,
        problem: 'Sensitive value is stored in .env',
        reason: 'The file is ignored, but local secrets are easier to manage safely in .env.local.',
        fix: 'Move the value to .env.local and keep .env limited to non-secret defaults.',
      })
    }
  }

  console.log('')
  console.log('Masked configured secrets:')
  const configuredSecrets = [...effective.entries()].filter(([name, entry]) => isSecret(name) && entry.value)
  if (!configuredSecrets.length) console.log('- none')
  configuredSecrets.sort(([left], [right]) => left.localeCompare(right))
    .forEach(([name, entry]) => console.log(`- ${name}=${maskValue(entry.value)} (${entry.file})`))

  const codeEnvNames = listCodeEnvNames()
  const localNames = new Set(effective.keys())
  const usedButMissing = [...codeEnvNames].filter((name) => !effective.get(name)?.value).sort()
  const unused = [...localNames].filter((name) => !codeEnvNames.has(name)).sort()
  console.log('')
  console.log(`Variables used by code but missing or empty locally: ${usedButMissing.length ? usedButMissing.join(', ') : 'none'}`)
  console.log(`Local variables not referenced by code: ${unused.length ? unused.join(', ') : 'none'}`)

  const publicVariables = [...localNames].filter((name) => name.startsWith('NEXT_PUBLIC_') || name.startsWith('VITE_')).sort()
  console.log(`Public frontend variables: ${publicVariables.length ? publicVariables.join(', ') : 'none'}`)
  for (const name of publicVariables) {
    if (!PUBLIC_ENV_NAMES.has(name) && SECRET_NAME.test(name)) {
      problems.push({
        provider: 'Frontend environment',
        variable: name,
        problem: 'Potential secret exposed through a public frontend prefix',
        reason: 'NEXT_PUBLIC_ and VITE_ values can be bundled into browser code.',
        fix: 'Move this value to a server-only variable and remove the public prefix.',
        blocking: true,
      })
    }
  }

  if (effective.has('HUGGINGFACE_API_TOKEN')) {
    problems.push({
      provider: 'Hugging Face',
      variable: 'HUGGINGFACE_API_TOKEN',
      problem: 'Legacy token variable name is in use',
      reason: 'CareerBridge still accepts this alias, but Hugging Face documents HF_TOKEN.',
      fix: 'Prefer HUGGINGFACE_API_KEY or HF_TOKEN in .env.local.',
    })
  }

  const urlResults = await Promise.all(urlChecks().map(probeUrl))
  for (const result of urlResults) {
    if (!result.valid || !result.reachable) {
      problems.push({
        provider: result.label,
        variable: result.variable,
        problem: 'Base URL is not reachable',
        reason: result.status,
        fix: result.label === 'Hugging Face'
          ? 'Use HUGGINGFACE_BASE_URL=https://router.huggingface.co/v1.'
          : 'Check the configured URL and network access.',
        blocking: result.required,
      })
    }
  }

  const providerResults = await Promise.all(PROVIDERS.map(probeProvider))
  const urlByLabel = new Map(urlResults.map((result) => [result.label, result]))
  console.log('')
  printTable(
    ['Provider', 'Key Present', 'URL Valid', 'Live Test', 'Status'],
    providerResults.map((result) => {
      const url = urlByLabel.get(URL_LABEL_BY_PROVIDER[result.provider] ?? providerLabel(result.provider).replace(' GPT-SW3', ''))
      return [
        providerLabel(result.provider),
        result.present ? 'yes' : 'no',
        url ? (url.valid && url.reachable ? 'yes' : 'no') : 'unknown',
        result.live,
        result.status,
      ]
    })
  )

  console.log('')
  console.log('Public API checks:')
  printTable(
    ['Source', 'Variable', 'URL Valid', 'Live Test', 'Status'],
    urlResults.slice(0, 2).map((result) => [
      result.label,
      result.variable,
      result.valid ? 'yes' : 'no',
      result.reachable ? 'passed' : 'failed',
      result.status,
    ])
  )

  for (const result of providerResults) {
    if (result.present && result.live === 'failed') {
      if (result.provider === 'ollama' && problems.some((problem) => problem.variable === 'OLLAMA_BASE_URL')) continue
      const local = providerClients[result.provider].local === true
      problems.push({
        provider: providerLabel(result.provider),
        variable: providerClients[result.provider].envKey,
        problem: local ? 'Local provider is configured but unavailable' : 'Key exists but API request failed',
        reason: result.status,
        fix: local
          ? 'Start the local provider or remove its base URL to skip it.'
          : result.status === 'quota exceeded'
          ? 'Check provider billing, credits, or rate limits.'
          : result.status === 'insufficient inference permissions'
          ? 'Create a Hugging Face token with permission to call Inference Providers, then update HUGGINGFACE_API_KEY and HF_TOKEN.'
          : 'Verify the key, model, base URL, and provider account.',
      })
    }
  }

  for (const required of validation.missingRequired) {
    problems.push({
      provider: 'Application infrastructure',
      variable: required.vars.join(' or '),
      problem: 'Required environment variable is missing',
      reason: required.reason,
      fix: 'Add the missing value to .env.local before starting the webapp.',
      blocking: true,
    })
  }

  console.log('')
  console.log('PROBLEM FOUND')
  console.log('-------------')
  if (!problems.length) {
    console.log('none')
  } else {
    problems.forEach((problem, index) => {
      if (index) console.log('')
      console.log(`Provider: ${problem.provider}`)
      console.log(`Variable: ${problem.variable}`)
      console.log(`Problem: ${problem.problem}`)
      console.log(`Reason: ${problem.reason}`)
      console.log(`Fix: ${problem.fix}`)
    })
  }

  if (problems.some((problem) => problem.blocking)) process.exitCode = 1
}

main().catch((error) => {
  console.error('Environment diagnostics failed:', sanitizeProviderMessage(error instanceof Error ? error.message : String(error)))
  process.exitCode = 1
})
