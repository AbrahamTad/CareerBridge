import { getAIProviderKey, getOptionalEnv } from '@/lib/server/env'
import type { AIProvider, AIProviderClient } from '../types'
import { anthropicProvider } from './anthropic'
import { aiSwedenProvider } from './aisweden'
import { deepseekProvider } from './deepseek'
import { geminiProvider } from './gemini'
import { groqProvider } from './groq'
import { huggingFaceProvider } from './huggingface'
import { ollamaProvider } from './ollama'
import { openaiProvider } from './openai'
import { openrouterProvider } from './openrouter'
import { parseProviderError } from './utils'

export const DEFAULT_PROVIDER_PRIORITY: AIProvider[] = [
  'gemini',
  'openai',
  'deepseek',
  'groq',
  'openrouter',
  'anthropic',
  'huggingface',
  'aisweden',
  'ollama',
]

export const SWEDISH_PROVIDER_PRIORITY: AIProvider[] = [
  'gemini',
  'openai',
  'deepseek',
  'groq',
  'openrouter',
  'anthropic',
  'huggingface',
  'aisweden',
  'ollama',
]

export const providerClients: Record<AIProvider, AIProviderClient> = {
  gemini: geminiProvider,
  openai: openaiProvider,
  deepseek: deepseekProvider,
  aisweden: aiSwedenProvider,
  groq: groqProvider,
  openrouter: openrouterProvider,
  huggingface: huggingFaceProvider,
  anthropic: anthropicProvider,
  ollama: ollamaProvider,
}

export function isProviderConfigured(provider: AIProvider): boolean {
  const client = providerClients[provider]
  if (provider === 'ollama') return Boolean(getOptionalEnv('OLLAMA_BASE_URL'))
  if (!client.requiresApiKey) return true
  try {
    getAIProviderKey(provider)
    return true
  } catch {
    return false
  }
}

export const isProviderAvailable = isProviderConfigured
export { parseProviderError }

export function providerLabel(provider: AIProvider) {
  const labels: Record<AIProvider, string> = {
    openai: 'OpenAI',
    gemini: 'Gemini',
    deepseek: 'DeepSeek',
    aisweden: 'AI Sweden GPT-SW3',
    groq: 'Groq',
    openrouter: 'OpenRouter',
    huggingface: 'Hugging Face',
    anthropic: 'Anthropic Claude',
    ollama: 'Ollama',
  }
  return labels[provider]
}
