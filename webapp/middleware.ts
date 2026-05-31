import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_PATHS = [
  '/dashboard',
  '/profile',
  '/jobs',
  '/applications',
  '/cv-builder',
  '/cover-letter',
  '/companies',
  '/settings',
]

const AUTH_PATHS = ['/login', '/register', '/forgot-password']
const ADMIN_PATHS = ['/admin']
const PUBLIC_FILE = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt)$/i

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  if (path.startsWith('/_next/') || path === '/favicon.ico' || PUBLIC_FILE.test(path)) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (PROTECTED_PATHS.some((p) => path.startsWith(p)) && !user) {
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('redirectTo', path)
    return NextResponse.redirect(redirectUrl)
  }

  if (AUTH_PATHS.some((p) => path.startsWith(p)) && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (ADMIN_PATHS.some((p) => path.startsWith(p)) && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Keep Next internals, static assets, auth callback/signout, and webhooks out of middleware.
    '/((?!_next/|favicon.ico|api/auth/callback|api/auth/signout|api/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt)$).*)',
  ],
}
