import { describe, expect, it } from 'vitest'
import { createPerfTimer } from '@/lib/perf-timing'

// A clock the test moves by hand, so the recorded numbers are exact.
function fakeClock() {
  let time = 0
  return { now: () => time, advance: (ms: number) => void (time += ms) }
}

describe('createPerfTimer', () => {
  it('records each phase with its start offset and duration, and logs one line on flush', async () => {
    const clock = fakeClock()
    const lines: string[] = []
    const timer = createPerfTimer('page /', { enabled: true, now: clock.now, log: (line) => lines.push(line) })

    const a = timer.measure('session', async () => {
      clock.advance(30)
      return 'user'
    })
    expect(await a).toBe('user')
    await timer.measure('data', async () => {
      clock.advance(50)
    })
    timer.flush()

    expect(lines).toHaveLength(1)
    expect(lines[0].startsWith('[perf] ')).toBe(true)
    expect(JSON.parse(lines[0].slice('[perf] '.length))).toEqual({
      label: 'page /',
      totalMs: 80,
      phases: [
        { name: 'session', startMs: 0, ms: 30 },
        { name: 'data', startMs: 30, ms: 50 },
      ],
    })
  })

  it('records a failed phase and still rethrows the error', async () => {
    const clock = fakeClock()
    const lines: string[] = []
    const timer = createPerfTimer('page /', { enabled: true, now: clock.now, log: (line) => lines.push(line) })

    await expect(
      timer.measure('boom', async () => {
        clock.advance(5)
        throw new Error('database unavailable')
      }),
    ).rejects.toThrow('database unavailable')
    timer.flush()

    expect(JSON.parse(lines[0].slice('[perf] '.length)).phases).toEqual([{ name: 'boom', startMs: 0, ms: 5, failed: true }])
  })

  it('does nothing but run the work when disabled', async () => {
    const lines: string[] = []
    const timer = createPerfTimer('page /', { enabled: false, log: (line) => lines.push(line) })

    expect(await timer.measure('x', () => 42)).toBe(42)
    timer.flush()

    expect(lines).toEqual([])
  })
})
