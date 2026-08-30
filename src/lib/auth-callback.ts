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
