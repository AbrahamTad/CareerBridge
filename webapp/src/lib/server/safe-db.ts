import { normalizeDbError } from './db-errors'

export type SafeDbQueryResult<T> = {
  data: T
  ok: boolean
  error?: ReturnType<typeof normalizeDbError>
}

const DEFAULT_DB_QUERY_TIMEOUT_MS = 5_000

function timeoutError(label: string, timeoutMs: number) {
  return new Error(`Database query "${label}" timed out after ${timeoutMs}ms.`)
}

function withTimeout<T>(query: Promise<T>, label: string, timeoutMs: number) {
  return Promise.race([
    query,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(timeoutError(label, timeoutMs)), timeoutMs)
    }),
  ])
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function safeDbQuery<T>(
  label: string,
  query: () => Promise<T>,
  fallback: T,
  options: { timeoutMs?: number; retries?: number } = {}
): Promise<SafeDbQueryResult<T>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_DB_QUERY_TIMEOUT_MS
  const retries = options.retries ?? 0
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const data = await withTimeout(query(), label, timeoutMs)
      return { data, ok: true }
    } catch (error) {
      lastError = error
      const normalized = normalizeDbError(error)
      console.warn('Database query failed', {
        label,
        attempt: attempt + 1,
        code: normalized.code,
        retryable: normalized.retryable,
        message: normalized.message,
      })

      if (!normalized.retryable || attempt >= retries) break
      await delay(250 * (attempt + 1))
    }
  }

  return {
    data: fallback,
    ok: false,
    error: normalizeDbError(lastError),
  }
}
