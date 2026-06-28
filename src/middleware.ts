import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_ROUTES = [
  '/',
  '/pricing',
  '/about',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/terms',
]

const PROTECTED_PREFIXES = [
  '/portfolio',
  '/dashboard',
  '/valuation',
  '/financials',
  '/lease',
  '/equipment',
  '/insurance',
  '/scenarios',
  '/benchmarking',
  '/reports',
  '/alerts',
  '/settings',
  '/onboarding',
  '/integrations',
]

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true
  if (pathname.startsWith('/auth/callback')) return true
  return false
}

function isProtectedRoute(pathname: string): boolean {
  if (isPublicRoute(pathname)) return false
  if (pathname === '/onboarding/complete' || pathname.startsWith('/onboarding/complete/')) {
    return true
  }
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value },
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          request.cookies.set({ name, value: '', ...options })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  if (!user && isProtectedRoute(pathname)) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/portfolio', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
