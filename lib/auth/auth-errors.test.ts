import { describe, expect, it, vi } from 'vitest'
import { authErrorMessage, refusalOf } from '@/lib/auth/auth-errors'

describe('authErrorMessage', () => {
  it('translates the known refusals by code or message', () => {
    expect(authErrorMessage({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'x' }, 'f')).toBe('Nesprávný e-mail nebo heslo.')
    expect(authErrorMessage(new Error('Invalid email or password'), 'f')).toBe('Nesprávný e-mail nebo heslo.')
    expect(authErrorMessage({ message: 'User already exists' }, 'f')).toMatch(/už existuje/)
  })
  it('knows the snake_case codes the Neon Auth client reports', () => {
    expect(authErrorMessage({ code: 'invalid_credentials' }, 'f')).toBe('Nesprávný e-mail nebo heslo.')
    expect(authErrorMessage({ code: 'email_not_confirmed', message: 'Email not confirmed' }, 'f')).toMatch(/není ověřený/)
    expect(authErrorMessage({ code: 'over_request_rate_limit' }, 'f')).toMatch(/Příliš mnoho/)
  })
  it('adds the code of an unknown refusal so it can be reported', () => {
    expect(authErrorMessage({ code: 'weird_thing' }, 'Nezdařilo se.')).toBe('Nezdařilo se. (kód: weird_thing)')
  })
  it('falls back for anything else, even a non-error value', () => {
    expect(authErrorMessage(new Error('boom'), 'fallback')).toBe('fallback')
    expect(authErrorMessage(undefined, 'fallback')).toBe('fallback')
  })
})

describe('refusalOf', () => {
  it('returns null when the call goes through', async () => {
    expect(await refusalOf(async () => ({ error: null }), 'f')).toBeNull()
  })
  it('returns a message for a returned error', async () => {
    expect(await refusalOf(async () => ({ error: { code: 'INVALID_EMAIL_OR_PASSWORD' } }), 'f')).toBe('Nesprávný e-mail nebo heslo.')
  })
  it('returns a message for a thrown error instead of leaving the form hanging', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await refusalOf(async () => { throw Object.assign(new Error('Invalid email or password'), { code: 'INVALID_EMAIL_OR_PASSWORD' }) }, 'f')).toBe('Nesprávný e-mail nebo heslo.')
    expect(await refusalOf(async () => { throw new Error('network') }, 'Přihlášení se nezdařilo.')).toBe('Přihlášení se nezdařilo.')
  })
})
