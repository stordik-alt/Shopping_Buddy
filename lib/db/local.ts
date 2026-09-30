// The app runs against Neon in production (HTTP driver) and can run against a plain PostgreSQL on
// this machine (docs/10_LOCAL_DATABASE.md). The connection string decides: a loopback host means local.
export function isLocalDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host === 'host.docker.internal'
  } catch {
    return false
  }
}
