const fs = require('fs')
const path = require('path')

function parseEnvLine(line) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (!match || match[1].startsWith('#')) return null

  let value = match[2].trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }

  return { name: match[1], value: value.trim() }
}

function loadEnvFile(file, sources) {
  const filePath = path.join(process.cwd(), file)
  if (!fs.existsSync(filePath)) return

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const parsed = parseEnvLine(line)
    if (!parsed) continue

    process.env[parsed.name] = parsed.value
    sources[parsed.name] = file
  }
}

function loadNextEnv() {
  const sources = {}
  loadEnvFile('.env', sources)
  loadEnvFile('.env.local', sources)
  return sources
}

function describeKey(name, sources) {
  const value = (process.env[name] || '').trim()
  if (!value) return `${name}: missing`

  return `${name}: loaded from ${sources[name] || 'process env'}, length ${value.length}, masked`
}

module.exports = {
  describeKey,
  loadNextEnv,
}
