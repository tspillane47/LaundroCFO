import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { isOnboardingComplete } from '@/lib/onboarding'
import {
  SIGNUP_CONFIRMATION_SKEW_MS,
  buildAuthCallbackRedirect,
  isEmailChangeType,
  isNewSignupConfirmation,
  isSupportedOtpType,
  resolveAuthCallbackErrorCode,
  resolveAuthCallbackErrorPath,
  resolvePostAuthDestination,
  withSignupCompleteParam,
  type SignupConfirmationUser,
} from '@/lib/auth-callback'

// [TEMP-DEBUG] Remove with the other [TEMP-DEBUG] logs after GA4 sign_up diagnosis.
function tempDebugSignupConfirmationWhy(options: {
  user: SignupConfirmationUser | null | undefined
  type?: string | null
  onboardingComplete?: boolean
}): string {
  const { user, type, onboardingComplete } = options
  if (!user) return 'false because no user was returned on the session'
  if (onboardingComplete) return 'false because onboarding is already complete'
  if (isEmailChangeType(type) || type === 'recovery') {
    return `false because type=${String(type)} is excluded (email change / recovery)`
  }

  const confirmedRaw = user.email_confirmed_at ?? null
  const lastSignInRaw = user.last_sign_in_at ?? null
  const confirmedAt = Date.parse(confirmedRaw ?? '')
  const lastSignInAt = Date.parse(lastSignInRaw ?? '')
  if (Number.isNaN(confirmedAt) || Number.isNaN(lastSignInAt)) {
    return `false because timestamps were unparseable (email_confirmed_at=${String(confirmedRaw)}, last_sign_in_at=${String(lastSignInRaw)})`
  }

  const deltaMs = Math.abs(lastSignInAt - confirmedAt)
  if (deltaMs <= SIGNUP_CONFIRMATION_SKEW_MS) {
    return `true because |last_sign_in_at - email_confirmed_at|=${deltaMs}ms is within ${SIGNUP_CONFIRMATION_SKEW_MS}ms skew`
  }
  return `false because |last_sign_in_at - email_confirmed_at|=${deltaMs}ms exceeds ${SIGNUP_CONFIRMATION_SKEW_MS}ms skew`
}

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

  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  })

  if (error) {
    console.error('Auth confirm failed:', error.message)
    const errorPath = resolveAuthCallbackErrorPath(type)
    return NextResponse.redirect(
      buildAuthCallbackRedirect(origin, errorPath, {
        error: resolveAuthCallbackErrorCode(type),
        type,
      })
    )
  }

  const user = data.user
  // [TEMP-DEBUG] Remove after GA4 sign_up diagnosis. Server-only — check Vercel/runtime logs, not DevTools.
  console.log('[TEMP-DEBUG] /auth/confirm verifyOtp succeeded — user timestamps', {
    email_confirmed_at: user?.email_confirmed_at ?? null,
    last_sign_in_at: user?.last_sign_in_at ?? null,
    type,
  })

  const onboardingComplete = Boolean(user && (await isOnboardingComplete(supabase, user.id)))
  const isNewSignup = isNewSignupConfirmation({ user, type, onboardingComplete })
  // [TEMP-DEBUG] Remove after GA4 sign_up diagnosis.
  console.log('[TEMP-DEBUG] /auth/confirm isNewSignupConfirmation()', {
    result: isNewSignup,
    why: tempDebugSignupConfirmationWhy({ user, type, onboardingComplete }),
    onboardingComplete,
    type,
    email_confirmed_at: user?.email_confirmed_at ?? null,
    last_sign_in_at: user?.last_sign_in_at ?? null,
    willSetSignupCompleteParam: isNewSignup,
  })

  const destination = await resolvePostAuthDestination({
    nextParam,
    type,
    isOnboardingComplete: async () => onboardingComplete,
  })

  return NextResponse.redirect(
    buildAuthCallbackRedirect(origin, withSignupCompleteParam(destination, isNewSignup))
  )
}
