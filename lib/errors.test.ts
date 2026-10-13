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

describe('userFacingError — internal messages', () => {
  // docs/35_SECURITY_AUDIT.md, L5: the allow-list is "anything that does not look internal".
  it.each([
    'Failed query: select "id" from "households" where "id" = $1\nparams: 6c396ab1',
    'NeonDbError: Error connecting to database: TypeError: fetch failed',
    'insert or update on table "x" violates foreign key constraint "x_fk"',
    'connect ETIMEDOUT 3.215.191.145:443',
    'Cannot find module /home/app/node_modules/foo/index.js',
    'TypeError: x is not a function\n    at run (/srv/app/server.js:10:5)',
    'getaddrinfo ENOTFOUND db.example.com',
    'https://bucket.r2.example.com/file?X-Amz-Signature=abc',
    'could not use postgresql://user:secret@host/db',
  ])('falls back for %j', (message) => {
    expect(userFacingError(new Error(message), 'Zkuste to znovu.')).toBe('Zkuste to znovu.')
  })

  it('still shows our own messages, including ones that mention words like "pozvánka" or "účtenka"', () => {
    for (const message of ['Pozvánka je neplatná, už byla použita nebo jí vypršela platnost.', 'Množství musí být kladné číslo.', 'Uložené položky účtenky se nepodařilo přečíst. Zkontrolujte účtenku znovu.']) {
      expect(userFacingError(new Error(message), 'X')).toBe(message)
    }
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
