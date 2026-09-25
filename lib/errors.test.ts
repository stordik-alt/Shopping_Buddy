import { describe, expect, it } from 'vitest'
import { userFacingError } from '@/lib/errors'

describe('userFacingError', () => {
  it('replaces the generic production message of a failed Server Action with the fallback', () => {
    const prod = new Error('Minified React error #441; visit https://react.dev/errors/441 for the full message')
    expect(userFacingError(prod, 'Zkuste to znovu.')).toBe('Zkuste to znovu.')
    expect(userFacingError(new Error('An error occurred in the Server Components render. The specific message is omitted in production builds'), 'X')).toBe('X')
  })

  it('keeps a real message, and falls back for anything that is not an Error', () => {
    expect(userFacingError(new Error('Fotografie je příliš velká (max. 10 MB).'), 'X')).toBe('Fotografie je příliš velká (max. 10 MB).')
    expect(userFacingError('boom', 'X')).toBe('X')
    expect(userFacingError(new Error(''), 'X')).toBe('X')
  })
})
