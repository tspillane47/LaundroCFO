import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { isOnboardingComplete } from '@/lib/onboarding'
import {
  buildAuthCallbackRedirect,
  isSupportedOtpType,
  resolveAuthCallbackErrorCode,
  resolveAuthCallbackErrorPath,
  resolvePostAuthDestination,
} from '@/lib/auth-callback'

/**
 * Server-side OTP verification for email links that include token_hash + type
 * (Supabase's recommended PKCE/SSR pattern — see auth email templates docs).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const nextParam = searchParams.get('next')
  const code = searchParams.get('code')

  if (code) {
    const redirectUrl = new URL('/auth/callback', origin)
    redirectUrl.search = searchParams.toString()
    return NextResponse.redirect(redirectUrl.toString())
  }

  if (!tokenHash || !type) {
    return NextResponse.redirect(
      buildAuthCallbackRedirect(origin, '/auth/auth-code-error', {
        reason: 'missing_params',
      })
    )
  }

  if (!isSupportedOtpType(type)) {
    return NextResponse.redirect(
      buildAuthCallbackRedirect(origin, '/auth/auth-code-error', {
        reason: 'unsupported_type',
        type,
      })
    )
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: Record<string, unknown>) {
          cookieStore.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  })

  if (error) {
    console.error('Auth confirm failed:', error.message)
    const errorPath = resolveAuthCallbackErrorPath(type)
    return NextResponse.redirect(
      buildAuthCallbackRedirect(origin, errorPath, {
        error: resolveAuthCallbackErrorCode(type),
        message: error.message,
      })
    )
  }

  const destination = await resolvePostAuthDestination({
    nextParam,
    type,
    isOnboardingComplete: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      return Boolean(user && (await isOnboardingComplete(supabase, user.id)))
    },
  })

  return NextResponse.redirect(buildAuthCallbackRedirect(origin, destination))
}
