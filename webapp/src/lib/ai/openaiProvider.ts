import type { ProviderRequest } from './types'
import { openaiProvider as provider } from './providers/openai'

export function openaiProvider(request: ProviderRequest): Promise<string> {
  return provider.complete(request)
}
