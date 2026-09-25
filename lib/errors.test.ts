import { describe, expect, it } from 'vitest'
import { describeError, userFacingError } from '@/lib/errors'

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

describe('describeError', () => {
  it('follows the causes a wrapper hides, with the Postgres code', () => {
    const db = Object.assign(new Error('relation "flyer_pages" does not exist'), { code: '42P01' })
    const wrapped = new Error('Failed query: delete from "flyer_pages"', { cause: db })
    expect(describeError(wrapped)).toBe('Failed query: delete from "flyer_pages" ← relation "flyer_pages" does not exist (42P01)')
  })

  it('handles plain values and errors without a cause', () => {
    expect(describeError(new Error('boom'))).toBe('boom')
    expect(describeError('text')).toBe('text')
  })
})
