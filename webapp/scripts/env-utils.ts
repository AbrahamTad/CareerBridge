import fs from 'fs'
import path from 'path'

export type EnvSources = Record<string, string>
export const INSPECTED_ENV_FILES = ['.env', '.env.local', '.env.production', '.env.example'] as const

export interface EnvEntry {
  file: string
  line: number
  name: string
  value: string
}

export interface EnvFileInspection {
  file: string
  found: boolean
  entries: EnvEntry[]
  duplicates: { name: string; lines: number[] }[]
  invalidLines: number[]
}

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

// Parse env files for diagnostics without printing values or mutating process.env.
export function inspectEnvFiles(files: readonly string[] = INSPECTED_ENV_FILES): EnvFileInspection[] {
  return files.map((file) => {
    const filePath = path.join(process.cwd(), file)
    if (!fs.existsSync(filePath)) {
      return { file, found: false, entries: [], duplicates: [], invalidLines: [] }
    }

    const entries: EnvEntry[] = []
    const invalidLines: number[] = []
    const linesByName = new Map<string, number[]>()
    for (const [index, line] of fs.readFileSync(filePath, 'utf8').split(/\r?\n/).entries()) {
      const lineNumber = index + 1
      if (!line.trim() || line.trimStart().startsWith('#')) continue
      const parsed = parseEnvLine(line)
      if (!parsed) {
        invalidLines.push(lineNumber)
        continue
      }
      entries.push({ file, line: lineNumber, ...parsed })
      linesByName.set(parsed.name, [...(linesByName.get(parsed.name) ?? []), lineNumber])
    }

    const duplicates = [...linesByName.entries()]
      .filter(([, lines]) => lines.length > 1)
      .map(([name, lines]) => ({ name, lines }))
    return { file, found: true, entries, duplicates, invalidLines }
  })
}

export function sourceFor(name: string, sources: EnvSources) {
  return sources[name] ?? (process.env[name] ? 'process env' : 'missing')
}

export function maskValue(value: string | undefined) {
  const clean = (value ?? '').trim()
  if (!clean) return 'missing'
  const prefix = clean.match(/^[A-Za-z]+[-_]/)?.[0] ?? ''
  return `${prefix}****${clean.slice(-4)}`
}
