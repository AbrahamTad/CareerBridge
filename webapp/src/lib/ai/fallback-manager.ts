// Compatibility facade for AI callers that use the shared provider fallback manager.
import type { CompletionRequest } from './types'
import { completeWithProviderFallback } from './provider-manager'
import { getProviderPriority } from './provider-router'

export { getProviderPriority }

export async function completeWithFallback(request: CompletionRequest): Promise<string> {
  return completeWithProviderFallback(request)
}
