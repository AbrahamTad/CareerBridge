import { loadEnvFiles, sourceFor } from './env-utils'

type ParsedDatabaseUrl = {
  scheme: string
  user: string
  host: string
  port: string
  database: string
  sslmode: string
  pgbouncer: string
}

function parseDatabaseUrl(value: string): ParsedDatabaseUrl | null {
  const match = value.match(/^([^:]+):\/\/([^@]+)@([^/]+)(\/[^?]*)?(\?.*)?$/)
  if (!match) return null

  const [, scheme, userinfo, hostport, path = '', rawQuery = ''] = match
  const [host, port = ''] = hostport.split(':')
  const query = new URLSearchParams(rawQuery.replace(/^\?/, ''))
  return {
    scheme,
    user: userinfo.split(':')[0] ?? '',
    host,
    port,
    database: path.replace(/^\//, '') || 'postgres',
    sslmode: query.get('sslmode') ?? '',
    pgbouncer: query.get('pgbouncer') ?? '',
  }
}

function describeDatabaseUrl(name: string, value: string | undefined, source: string) {
  if (!value) {
    console.log(`${name}: missing`)
    return
  }

  const parsed = parseDatabaseUrl(value)
  if (!parsed) {
    console.log(`${name}: set in ${source}, but could not be parsed safely`)
    return
  }

  console.log(`${name}: ${parsed.scheme}://${parsed.user}:***@${parsed.host}:${parsed.port}/${parsed.database} (${source})`)
  if (name === 'DATABASE_URL' && parsed.port !== '6543') {
    console.log('  warning: Supabase pooled app connections usually use port 6543.')
  }
  if (name === 'DATABASE_URL' && parsed.pgbouncer !== 'true') {
    console.log('  warning: add pgbouncer=true when using the Supabase transaction pooler.')
  }
  if (name === 'DIRECT_URL' && parsed.port !== '5432') {
    console.log('  warning: Supabase direct/session connections usually use port 5432.')
  }
  if (parsed.sslmode !== 'require') {
    console.log('  warning: add sslmode=require for Supabase Postgres connections.')
  }
}

async function main() {
  const sources = loadEnvFiles()
  const databaseUrl = process.env.DATABASE_URL
  const directUrl = process.env.DIRECT_URL

  console.log('CareerBridge database check')
  console.log('')
  describeDatabaseUrl('DATABASE_URL', databaseUrl, sourceFor('DATABASE_URL', sources))
  describeDatabaseUrl('DIRECT_URL', directUrl, sourceFor('DIRECT_URL', sources))

  if (!databaseUrl) {
    console.log('')
    console.log('DATABASE_URL is required for the webapp.')
    process.exitCode = 1
    return
  }

  const { default: prisma } = await import('../src/lib/prisma')

  try {
    console.log('')
    console.log('Connecting with Prisma...')
    await prisma.$connect()
    await prisma.$queryRaw`SELECT 1`
    console.log('Database connection OK.')
  } catch (error) {
    const { normalizeDbError, friendlyDbErrorMessage } = await import('../src/lib/server/db-errors')
    const normalized = normalizeDbError(error)
    console.log('Database connection failed.')
    console.log(`Code: ${normalized.code}`)
    console.log(`Message: ${friendlyDbErrorMessage(error)}`)
    console.log(`Detail: ${normalized.message}`)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error('Database check failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
