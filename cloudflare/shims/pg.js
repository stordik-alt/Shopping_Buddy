// Stand-in for `pg` in the Cloudflare build only (next.config.mjs aliases `pg` to this file when
// BUILD_TARGET=cloudflare). pg is used solely for the optional local-PostgreSQL mode
// (docs/10_LOCAL_DATABASE.md); the Worker always talks to Neon over HTTP and never reaches it, and
// bundling the real driver fails on its optional `pg-cloudflare` dependency.
class Unavailable {
  constructor() {
    throw new Error('pg is not available in the Cloudflare build — the Worker uses the Neon HTTP driver')
  }
}

export const Pool = Unavailable
export const Client = Unavailable
export default { Pool, Client, types: {} }
