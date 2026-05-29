const { describeKey, loadNextEnv } = require('./env-utils')

async function main() {
  const sources = loadNextEnv()

  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY')

  console.log(describeKey('ANTHROPIC_API_KEY', sources))

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest',
      max_tokens: 5,
      messages: [{ role: 'user', content: 'Reply with ok.' }],
    }),
  })

  if (response.status === 401) throw new Error('Invalid ANTHROPIC_API_KEY')
  if (response.status === 429) {
    console.log('Anthropic authentication OK, but quota/rate limits are blocking requests.')
    return
  }
  if (!response.ok) throw new Error(`Anthropic auth test failed with status ${response.status}: ${await response.text()}`)

  console.log('Anthropic authentication OK')
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
