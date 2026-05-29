import fs from 'fs'
import path from 'path'

export type EnvSources = Record<string, string>

function parseEnvLine(line: string) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (!match || line.trimStart().startsWith('#')) return null

  let value = match[2].trim()
  const commentIndex = value.search(/\s+#/)
  if (commentIndex >= 0) value = value.slice(0, commentIndex).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }

  return { name: match[1], value: value.trim() }
}

function loadEnvFile(file: string, sources: EnvSources) {
  const filePath = path.join(process.cwd(), file)
  if (!fs.existsSync(filePath)) return

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const parsed = parseEnvLine(line)
    if (!parsed) continue
    process.env[parsed.name] = parsed.value
    sources[parsed.name] = file
  }
}

export function loadEnvFiles() {
  const sources: EnvSources = {}
  loadEnvFile('.env', sources)
  loadEnvFile('.env.local', sources)
  return sources
}

export function sourceFor(name: string, sources: EnvSources) {
  return sources[name] ?? (process.env[name] ? 'process env' : 'missing')
}

export function maskValue(value: string | undefined) {
  const clean = (value ?? '').trim()
  if (!clean) return 'missing'
  return `[set, ${clean.length} chars]`
}
