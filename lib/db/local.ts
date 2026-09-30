// The app runs against Neon in production (HTTP driver). It can instead use the plain `pg` driver,
// which works with any PostgreSQL: one on this machine (docker-free local setup) or a hosted one
// (a fallback if Neon is unavailable). DATABASE_DRIVER=pg selects it explicitly; a loopback host
// selects it implicitly so the local setup needs no extra variable.
export function usesPgDriver(url: string | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (env.DATABASE_DRIVER === 'pg') return true
  if (!url) return false
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host === 'host.docker.internal'
  } catch {
    return false
  }
}

// Serverless functions each hold their own pool, so keep it small; raise it on a long-running host.
export function poolMax(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.DATABASE_POOL_MAX)
  return Number.isInteger(value) && value > 0 ? value : 5
}
