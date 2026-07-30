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
  return isEmailChangeType(type) ? '/account' : '/login'
}

export function resolveAuthCallbackErrorCode(type: string | null): string {
  return isEmailChangeType(type) ? 'email_change_failed' : 'verification_failed'
}
