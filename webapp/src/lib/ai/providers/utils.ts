export async function parseProviderError(response: Response): Promise<string> {
  try {
    const data = await response.json()
    if (typeof data?.error?.message === 'string') return data.error.message
    if (typeof data?.error === 'string') return data.error
    if (typeof data?.message === 'string') return data.message
  } catch {
    // Provider error bodies are not guaranteed to be JSON.
  }

  return response.statusText || 'Provider request failed'
}
