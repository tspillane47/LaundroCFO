import { describe, expect, it } from 'vitest'
import {
  AUTH_CONFIRMATION_ERROR_COPY,
  buildAuthCallbackRedirect,
  buildSignupEmailRedirectTo,
  isEmailChangeType,
  isNewSignupConfirmation,
  isSignupConfirmationType,
  isSupportedOtpType,
  resolveAuthCallbackErrorCode,
  resolveAuthCallbackErrorPath,
  resolveAuthConfirmationErrorCopy,
  resolveAuthConfirmationErrorKind,
  resolvePostAuthDestination,
  withSignupCompleteParam,
} from '@/lib/auth-callback'

describe('auth callback helpers', () => {
  it('detects email change verification types', () => {
    expect(isEmailChangeType('email_change')).toBe(true)
    expect(isEmailChangeType('email_change_new')).toBe(true)
    expect(isEmailChangeType('email_change_current')).toBe(true)
    expect(isEmailChangeType('signup')).toBe(false)
    expect(isEmailChangeType(null)).toBe(false)
  })

  it('accepts supported OTP types', () => {
    expect(isSupportedOtpType('email_change')).toBe(true)
    expect(isSupportedOtpType('recovery')).toBe(true)
    expect(isSupportedOtpType('unknown')).toBe(false)
  })

  it('builds redirect URLs with query params', () => {
    expect(
      buildAuthCallbackRedirect('https://app.example.com', '/account', {
        email_updated: '1',
      })
    ).toBe('https://app.example.com/account?email_updated=1')
  })

  it('points signup confirmation emails at /auth/confirm (token_hash next, not PKCE callback)', () => {
    expect(buildSignupEmailRedirectTo('https://app.example.com')).toBe(
      'https://app.example.com/auth/confirm'
    )
    expect(isSignupConfirmationType('signup')).toBe(true)
    expect(isSignupConfirmationType('recovery')).toBe(false)
    expect(isSignupConfirmationType(null)).toBe(false)
  })

  it('appends signup_complete=1 only when the user-object signal says new signup', () => {
    expect(withSignupCompleteParam('/onboarding', true)).toBe(
      '/onboarding?signup_complete=1'
    )
    expect(withSignupCompleteParam('/portfolio', true)).toBe(
      '/portfolio?signup_complete=1'
    )
    expect(withSignupCompleteParam('/reset-password', false)).toBe('/reset-password')
    expect(withSignupCompleteParam('/account?email_updated=1', false)).toBe(
      '/account?email_updated=1'
    )
    expect(withSignupCompleteParam('/onboarding', false)).toBe('/onboarding')
  })

  it('treats matching confirmation and first-sign-in timestamps as a new signup', () => {
    const now = '2026-09-13T17:00:00.000Z'
    expect(
      isNewSignupConfirmation({
        user: { email_confirmed_at: now, last_sign_in_at: now },
      })
    ).toBe(true)
    expect(
      isNewSignupConfirmation({
        user: { email_confirmed_at: now, last_sign_in_at: now },
        type: 'email',
      })
    ).toBe(true)
  })

  it('does not treat later logins, recovery, email change, or onboarded users as signup', () => {
    const confirmed = '2026-09-13T17:00:00.000Z'
    const laterLogin = '2026-09-13T17:00:30.000Z'
    const matching = { email_confirmed_at: confirmed, last_sign_in_at: confirmed }

    expect(
      isNewSignupConfirmation({
        user: { email_confirmed_at: confirmed, last_sign_in_at: laterLogin },
      })
    ).toBe(false)
    expect(isNewSignupConfirmation({ user: matching, type: 'recovery' })).toBe(false)
    expect(isNewSignupConfirmation({ user: matching, type: 'email_change' })).toBe(false)
    expect(isNewSignupConfirmation({ user: matching, onboardingComplete: true })).toBe(false)
    expect(isNewSignupConfirmation({ user: null })).toBe(false)
    expect(
      isNewSignupConfirmation({
        user: { email_confirmed_at: null, last_sign_in_at: confirmed },
      })
    ).toBe(false)
  })

  it('routes email change confirmations to account', async () => {
    await expect(
      resolvePostAuthDestination({
        nextParam: null,
        type: 'email_change',
        isOnboardingComplete: async () => true,
      })
    ).resolves.toBe('/account?email_updated=1')
  })

  it('prefers an explicit next path when safe', async () => {
    await expect(
      resolvePostAuthDestination({
        nextParam: '/account',
        type: 'email_change',
        isOnboardingComplete: async () => true,
      })
    ).resolves.toBe('/account')
  })

  it('rejects unsafe next paths', async () => {
    await expect(
      resolvePostAuthDestination({
        nextParam: '//evil.example/phish',
        type: 'email_change',
        isOnboardingComplete: async () => true,
      })
    ).resolves.toBe('/account?email_updated=1')
  })

  it('routes recovery confirmations to reset password', async () => {
    await expect(
      resolvePostAuthDestination({
        nextParam: null,
        type: 'recovery',
        isOnboardingComplete: async () => true,
      })
    ).resolves.toBe('/reset-password')
  })

  it('maps email change errors back to account', () => {
    expect(resolveAuthCallbackErrorPath('email_change_new')).toBe('/account')
    expect(resolveAuthCallbackErrorCode('email_change_new')).toBe('email_change_failed')
    expect(resolveAuthCallbackErrorPath('signup')).toBe('/auth/auth-code-error')
    expect(resolveAuthCallbackErrorCode('signup')).toBe('verification_failed')
  })

  it('uses calm signup confirmation copy instead of technical error text', () => {
    const copy = resolveAuthConfirmationErrorCopy('signup')
    expect(resolveAuthConfirmationErrorKind('signup')).toBe('signup')
    expect(resolveAuthConfirmationErrorKind(null)).toBe('signup')
    expect(copy.title).toBe("This confirmation link didn't complete")
    expect(copy.body).toMatch(/email provider scanned the link/i)
    expect(copy.body).toMatch(/already confirmed/i)
    expect(copy.primaryLabel).toBe('Try logging in — your account may already be confirmed')
    expect(copy.primaryHref).toBe('/login')
    expect(copy.secondaryLabel).toBe('Request a new confirmation email')

    const leaked = Object.values(AUTH_CONFIRMATION_ERROR_COPY)
      .flatMap((entry) => [entry.title, entry.body, entry.primaryLabel, entry.secondaryLabel ?? ''])
      .join(' ')
      .toLowerCase()
    expect(leaked).not.toMatch(/pkce|code verifier|supabase|storage/)
  })

  it('keeps email-change and recovery errors user-facing', () => {
    expect(resolveAuthConfirmationErrorKind('email_change')).toBe('email_change')
    expect(resolveAuthConfirmationErrorKind('recovery')).toBe('recovery')
    expect(resolveAuthConfirmationErrorCopy('email_change').primaryHref).toBe('/account')
    expect(resolveAuthConfirmationErrorCopy('recovery').primaryHref).toBe('/forgot-password')
  })
})
