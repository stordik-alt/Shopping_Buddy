import { describe, expect, it } from 'vitest'
import { safeErrorMessage } from '@/lib/errors'
import { redactSecrets } from '@/lib/redact'

// Security regression (docs/37_SECURITY_REMEDIATION_PLAN.md, V6): raw Drizzle and storage-client messages
// carried SQL parameters (a household's names and e-mail addresses) and signed-URL credentials into logs
// and into the body of a cron route's response.
describe('redactSecrets', () => {
  it("withholds Drizzle's SQL statement and parameters but keeps the database's own reason", () => {
    const message = 'Failed query: insert into "invitations" ("email", "token") values ($1, $2)\nparams: jana@example.com,s3cr3tT0ken ← duplicate key value violates unique constraint (23505)'
    const redacted = redactSecrets(message)
    expect(redacted).not.toContain('jana@example.com')
    expect(redacted).not.toContain('s3cr3tT0ken')
    expect(redacted).not.toContain('invitations')
    expect(redacted).toBe('Failed query: [statement and parameters withheld] ← duplicate key value violates unique constraint (23505)')
  })

  it('removes the credentials of a signed storage URL and an AWS authorization header', () => {
    const url = 'https://bucket.r2.cloudflarestorage.com/x?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20261012&X-Amz-Signature=deadbeef0123&X-Amz-Date=20261012T000000Z'
    const redacted = redactSecrets(`PUT ${url} failed`)
    expect(redacted).not.toContain('AKIAIOSFODNN7EXAMPLE')
    expect(redacted).not.toContain('deadbeef0123')
    expect(redacted).toContain('X-Amz-Date=20261012T000000Z')
    expect(redactSecrets('Authorization: AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/20261012/auto/s3/aws4_request, Signature=abc123')).not.toMatch(/AKIAEXAMPLE|abc123/)
  })

  it('removes a password embedded in a connection string and token-like pairs', () => {
    expect(redactSecrets('connect to postgresql://app_user:hunter2@db.example.com/prod failed')).not.toContain('hunter2')
    expect(redactSecrets('postgresql://app_user:hunter2@db.example.com/prod')).toContain('postgresql://[redacted]@db.example.com/prod')
    expect(redactSecrets('request failed: api_key=sk-12345 token: abc.def secret="xyz"')).not.toMatch(/sk-12345|abc\.def|xyz/)
  })

  it('still redacts a secret that would otherwise sit across the truncation point', () => {
    const redacted = redactSecrets(`${'x'.repeat(480)} ?key=AIzaSyVERYSECRETKEY123456 more`)
    expect(redacted).not.toContain('VERYSECRET')
    expect(redacted.length).toBeLessThanOrEqual(500)
  })

  it('leaves an ordinary message and a plain "API key" sentence unchanged', () => {
    expect(redactSecrets('Google Vision request failed (403): API key not valid')).toBe('Google Vision request failed (403): API key not valid')
    expect(redactSecrets('relation "flyer_pages" does not exist (42P01)')).toBe('relation "flyer_pages" does not exist (42P01)')
  })
})

describe('safeErrorMessage', () => {
  it('describes the cause chain without the SQL or its parameters', () => {
    const cause = Object.assign(new Error('relation "flyer_pages" does not exist'), { code: '42P01' })
    const wrapped = new Error('Failed query: select * from "flyer_pages" where "chain" = $1\nparams: lidl', { cause })
    const message = safeErrorMessage(wrapped)
    expect(message).toBe('Failed query: [statement and parameters withheld] ← relation "flyer_pages" does not exist (42P01)')
  })
  it('handles a value that is not an Error', () => {
    expect(safeErrorMessage('plain text')).toBe('plain text')
  })
})
