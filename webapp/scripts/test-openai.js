const { describeKey, loadNextEnv } = require('./env-utils')

async function main() {
  const sources = loadNextEnv()

  const apiKey = (process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY')

  console.log(describeKey('OPENAI_API_KEY', sources))

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      max_tokens: 5,
      messages: [{ role: 'user', content: 'Reply with ok.' }],
    }),
  })

  if (response.status === 401) throw new Error('Invalid OPENAI_API_KEY')
  if (response.status === 429) {
    console.log('OpenAI authentication OK, but quota/billing is blocking requests.')
    return
  }
  if (!response.ok) throw new Error(`OpenAI auth test failed with status ${response.status}: ${await response.text()}`)

  console.log('OpenAI authentication OK')
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
