import { describe, expect, it } from 'vitest'
import {
  AUTH_CONFIRMATION_ERROR_COPY,
  buildAuthCallbackRedirect,
  isEmailChangeType,
  isSupportedOtpType,
  resolveAuthCallbackErrorCode,
  resolveAuthCallbackErrorPath,
  resolveAuthConfirmationErrorCopy,
  resolveAuthConfirmationErrorKind,
  resolvePostAuthDestination,
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
