const CONNECTION_ERROR_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017'])

export type SafeDbError = {
  code: string
  message: string
  retryable: boolean
}

function errorCode(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string') return code
  }
  return 'UNKNOWN'
}

function sanitizeMessage(message: string) {
  return message
    .replace(/postgresql:\/\/[^@\s]+@/gi, 'postgresql://[credentials]@')
    .replace(/password=[^&\s]+/gi, 'password=[masked]')
    .replace(/(DATABASE_URL|DIRECT_URL)=\S+/gi, '$1=[masked]')
}

export function normalizeDbError(error: unknown): SafeDbError {
  const code = errorCode(error)
  const rawMessage = error instanceof Error ? error.message : String(error ?? 'Database query failed')
  const message = sanitizeMessage(rawMessage)

  return {
    code,
    message,
    retryable: CONNECTION_ERROR_CODES.has(code) || /can't reach database|timed out|connection/i.test(message),
  }
}

export function friendlyDbErrorMessage(error: unknown) {
  const normalized = normalizeDbError(error)

  if (normalized.code === 'P1001') {
    return 'Database connection is temporarily unavailable. Please check Supabase connection.'
  }

  if (normalized.code === 'P1002' || /timed out/i.test(normalized.message)) {
    return 'Database connection timed out. Please check Supabase connection.'
  }

  return 'Database is temporarily unavailable. Please try again later.'
}
