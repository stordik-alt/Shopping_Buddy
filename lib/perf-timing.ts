// Phase timing for server renders, to find out where a slow page load actually spends its time
// (a Server Component cannot set a `Server-Timing` header, so the result goes to the server log as one
// line; on Vercel it is in the function's logs). Off unless PERF_TIMING=1: a disabled timer only runs
// the work it is given, so the instrumentation costs nothing in normal operation.

export type PerfPhase = {
  name: string
  /** When the phase began, in ms after the timer was created: overlapping phases ran in parallel. */
  startMs: number
  ms: number
  /** The phase threw; the error still propagates to the caller. */
  failed?: true
}

export type PerfTimer = {
  /** Runs `work`, records how long it took under `name` and returns its result. */
  measure<T>(name: string, work: () => PromiseLike<T> | T): Promise<T>
  /** Writes one log line with every phase measured so far. */
  flush(): void
}

export function createPerfTimer(
  label: string,
  { enabled = process.env.PERF_TIMING === '1', now = () => performance.now(), log = (line: string) => console.log(line) }: { enabled?: boolean; now?: () => number; log?: (line: string) => void } = {},
): PerfTimer {
  if (!enabled) {
    return {
      measure: async (_name, work) => work(),
      flush: () => {},
    }
  }

  const origin = now()
  const phases: PerfPhase[] = []

  return {
    async measure(name, work) {
      const start = now()
      const record = (failed: boolean) => {
        const phase: PerfPhase = { name, startMs: Math.round(start - origin), ms: Math.round(now() - start) }
        if (failed) phase.failed = true
        phases.push(phase)
      }
      try {
        const result = await work()
        record(false)
        return result
      } catch (error) {
        record(true)
        throw error
      }
    },
    flush() {
      log(`[perf] ${JSON.stringify({ label, totalMs: Math.round(now() - origin), phases })}`)
    },
  }
}
