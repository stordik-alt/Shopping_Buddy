import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CRON_JOBS, cronPaths, cronRequest, cronSchedules } from './cron'

// wrangler.jsonc is JSON with comments. Strip `//` comments outside strings, then parse.
function readJsonc(file: string): unknown {
  const text = readFileSync(join(process.cwd(), file), 'utf8')
  let out = ''
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      out += c
      if (c === '\\') out += text[++i]
      else if (c === '"') inString = false
    } else if (c === '"') {
      inString = true
      out += c
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else out += c
  }
  return JSON.parse(out)
}

type WranglerConfig = { triggers: { crons: string[] }; env: Record<string, { triggers?: { crons: string[] } }> }
const wrangler = readJsonc('wrangler.jsonc') as WranglerConfig

describe('Cloudflare cron triggers', () => {
  it('lists exactly the schedules in vercel.json, each once', () => {
    expect([...wrangler.triggers.crons].sort()).toEqual(cronSchedules().sort())
    expect(new Set(wrangler.triggers.crons).size).toBe(wrangler.triggers.crons.length)
  })

  it('maps every fired schedule back to its vercel.json path(s)', () => {
    for (const job of CRON_JOBS) expect(cronPaths(job.schedule)).toContain(job.path)
    const called = wrangler.triggers.crons.flatMap((cron) => cronPaths(cron))
    expect(called.sort()).toEqual(CRON_JOBS.map((job) => job.path).sort())
  })

  it('calls nothing for an unknown schedule', () => {
    expect(cronPaths('1 2 3 4 5')).toEqual([])
  })

  it('runs several jobs that share a schedule', () => {
    const jobs = [
      { path: '/api/cron/a', schedule: '0 5 * * *' },
      { path: '/api/cron/b', schedule: '0 5 * * *' },
      { path: '/api/cron/c', schedule: '0 6 * * *' },
    ]
    expect(cronSchedules(jobs)).toEqual(['0 5 * * *', '0 6 * * *'])
    expect(cronPaths('0 5 * * *', jobs)).toEqual(['/api/cron/a', '/api/cron/b'])
  })

  it('never schedules staging: it must not run price ingestion or reminders', () => {
    expect(wrangler.env.staging.triggers?.crons).toEqual([])
  })

  it('sends the same bearer header Vercel Cron sends', () => {
    const request = cronRequest('/api/cron/shopping-reminders', 's3cret')
    expect(request.method).toBe('GET')
    expect(new URL(request.url).pathname).toBe('/api/cron/shopping-reminders')
    expect(request.headers.get('authorization')).toBe('Bearer s3cret')
    // Without a secret no header is sent, so the route's own check decides (it rejects when CRON_SECRET is set).
    expect(cronRequest('/api/cron/x', undefined).headers.get('authorization')).toBeNull()
  })
})
