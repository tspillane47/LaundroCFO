import type { EmailOtpType } from '@supabase/supabase-js'

const EMAIL_CHANGE_TYPES = new Set([
  'email_change',
  'email_change_new',
  'email_change_current',
])

export function isEmailChangeType(type: string | null | undefined): boolean {
  return type != null && EMAIL_CHANGE_TYPES.has(type)
}

export function isSupportedOtpType(type: string): type is EmailOtpType {
  return (
    type === 'signup' ||
    type === 'invite' ||
    type === 'magiclink' ||
    type === 'recovery' ||
    type === 'email' ||
    type === 'email_change' ||
    type === 'email_change_new' ||
    type === 'email_change_current'
  )
}

export const SIGNUP_COMPLETE_PARAM = 'signup_complete'

/** GoTrue writes both timestamps in the same verify/exchange for first confirmation. */
export const SIGNUP_CONFIRMATION_SKEW_MS = 15_000

export type SignupConfirmationUser = {
  email_confirmed_at?: string | null
  last_sign_in_at?: string | null
}

export function isSignupConfirmationType(type: string | null | undefined): boolean {
  return type === 'signup'
}

/**
 * True for a first email-confirmation session.
 *
 * exchangeCodeForSession / verifyOtp do not expose a signup-vs-login grant.
 * URL `type=signup` is also dropped when ConfirmationURL falls back to Site URL.
 *
 * Reliable fields on the returned user:
 * - email_confirmed_at is set when the email is confirmed (first confirm or email change)
 * - last_sign_in_at is set on this session and moves on later logins
 * First confirmation writes both in the same request; later sessions only bump last_sign_in_at.
 */
export function isNewSignupConfirmation(options: {
  user: SignupConfirmationUser | null | undefined
  type?: string | null
  onboardingComplete?: boolean
}): boolean {
  const { user, type, onboardingComplete } = options

  if (!user) return false
  if (onboardingComplete) return false
  if (isEmailChangeType(type) || type === 'recovery') return false

  const confirmedAt = Date.parse(user.email_confirmed_at ?? '')
  const lastSignInAt = Date.parse(user.last_sign_in_at ?? '')
  if (Number.isNaN(confirmedAt) || Number.isNaN(lastSignInAt)) return false

  return Math.abs(lastSignInAt - confirmedAt) <= SIGNUP_CONFIRMATION_SKEW_MS
}

export function buildAuthCallbackRedirect(
  origin: string,
  path: string,
  params?: Record<string, string>
): string {
  const url = new URL(path, origin)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
  }
  return url.toString()
}

/** Passed to email templates as `{{ .RedirectTo }}` / `next` — not a PKCE callback. */
export function buildSignupEmailRedirectTo(origin: string): string {
  return buildAuthCallbackRedirect(origin, '/auth/confirm')
}

/** Append `signup_complete=1` so the client can fire GA after a server verify. */
export function withSignupCompleteParam(destination: string, isNewSignup: boolean): string {
  if (!isNewSignup) return destination
  const url = new URL(destination, 'https://placeholder.invalid')
  url.searchParams.set(SIGNUP_COMPLETE_PARAM, '1')
  return `${url.pathname}${url.search}${url.hash}`
}

export async function resolvePostAuthDestination(options: {
  nextParam: string | null
  type: string | null
  isOnboardingComplete: () => Promise<boolean>
}): Promise<string> {
  const { nextParam, type, isOnboardingComplete } = options

  if (nextParam?.startsWith('/') && !nextParam.startsWith('//')) {
    return nextParam
  }

  if (isEmailChangeType(type)) {
    return '/account?email_updated=1'
  }

  if (type === 'recovery') {
    return '/reset-password'
  }

  if (await isOnboardingComplete()) {
    return '/portfolio'
  }

  return '/onboarding'
}

export function resolveAuthCallbackErrorPath(type: string | null): string {
  return isEmailChangeType(type) ? '/account' : '/auth/auth-code-error'
}

export function resolveAuthCallbackErrorCode(type: string | null): string {
  return isEmailChangeType(type) ? 'email_change_failed' : 'verification_failed'
}

export type AuthConfirmationErrorKind = 'signup' | 'email_change' | 'recovery'

export type AuthConfirmationErrorCopy = {
  title: string
  body: string
  primaryLabel: string
  primaryHref: string
  secondaryLabel: string | null
  secondaryKind: 'resend_signup' | null
}

export const AUTH_CONFIRMATION_ERROR_COPY: Record<
  AuthConfirmationErrorKind,
  AuthConfirmationErrorCopy
> = {
  signup: {
    title: "This confirmation link didn't complete",
    body: "This can happen if your email provider scanned the link for security before you clicked it yourself. The good news: your account is very likely already confirmed.",
    primaryLabel: 'Try logging in — your account may already be confirmed',
    primaryHref: '/login',
    secondaryLabel: 'Request a new confirmation email',
    secondaryKind: 'resend_signup',
  },
  email_change: {
    title: "We couldn't confirm your email change",
    body: "This can happen if the link expired or was opened automatically by your email provider. Request a new confirmation from your account settings.",
    primaryLabel: 'Back to Account',
    primaryHref: '/account',
    secondaryLabel: null,
    secondaryKind: null,
  },
  recovery: {
    title: "This password reset link didn't complete",
    body: "This can happen if the link expired, was already used, or was opened automatically by your email provider. Request a new reset email and open it in this browser.",
    primaryLabel: 'Request a new password reset',
    primaryHref: '/forgot-password',
    secondaryLabel: null,
    secondaryKind: null,
  },
}

export function resolveAuthConfirmationErrorKind(
  type: string | null | undefined
): AuthConfirmationErrorKind {
  if (isEmailChangeType(type)) return 'email_change'
  if (type === 'recovery') return 'recovery'
  return 'signup'
}

export function resolveAuthConfirmationErrorCopy(
  kind: AuthConfirmationErrorKind
): AuthConfirmationErrorCopy {
  return AUTH_CONFIRMATION_ERROR_COPY[kind]
}

export function logAuthConfirmationError(context: string, message: string | null | undefined): void {
  if (!message) return
  console.error(`[${context}]`, message)
}
