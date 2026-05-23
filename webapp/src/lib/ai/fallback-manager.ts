import type { CompletionRequest } from './types'
import { completeWithProviderFallback } from './provider-manager'
import { getProviderPriority } from './provider-router'
import { isProviderConfigured as isProviderAvailable } from './providers/index'

export { getProviderPriority, isProviderAvailable }

export async function completeWithFallback(request: CompletionRequest): Promise<string> {
  return completeWithProviderFallback(request)
}
