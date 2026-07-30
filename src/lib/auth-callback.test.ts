import { describe, expect, it } from 'vitest'
import {
  buildAuthCallbackRedirect,
  isEmailChangeType,
  isSupportedOtpType,
  resolveAuthCallbackErrorCode,
  resolveAuthCallbackErrorPath,
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
    expect(resolveAuthCallbackErrorPath('signup')).toBe('/login')
    expect(resolveAuthCallbackErrorCode('signup')).toBe('verification_failed')
  })
})
