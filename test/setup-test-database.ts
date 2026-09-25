// Database-backed tests write real rows — households, receipts, products, prices — and clean them
// up afterwards. A run that times out or is interrupted never reaches its cleanup, and those rows
// stayed behind in the production database: users saw a "Mléko" product with 68 invented receipt
// prices and two Lidl branches called "OCR Testovací …" (removed 2026-09-25). So tests never use
// the production DATABASE_URL.
//
// They use TEST_DATABASE_URL instead — a separate Neon branch (see docs/01_CURRENT_STATE.md, "Test
// database"). Without it DATABASE_URL is cleared, so a database-backed test fails with a missing
// connection instead of quietly writing to production; pure unit tests are unaffected.
//
// A malformed value used to surface as neon()'s generic "connection string format should be …" in
// the first database test, without saying which variable or what is wrong. It is checked here and
// stops the run at once, naming the variable and the problem — never the value, which contains the
// password.

/** What is wrong with a Postgres connection string, or null when it has the shape neon() accepts
 *  (postgresql://user:password@host/dbname). Exported for its test. */
export function connectionStringProblem(value: string): string | null {
  const trimmed = value.trim()
  if (/^psql\s/.test(trimmed)) return 'it starts with "psql" — copy only the postgresql://… part of the Neon connection snippet'
  if (/^['"]/.test(trimmed)) return 'it is wrapped in quotes that are part of the value — remove them'
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return 'it is not a URL — it must look like postgresql://user:password@host/dbname'
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') return `it starts with "${url.protocol}" instead of "postgresql:" — use the Postgres connection string of the branch, not an HTTPS/API URL`
  if (!url.username) return 'it has no user name — expected postgresql://USER:PASSWORD@host/dbname'
  if (!url.password) return 'it has no password — expected postgresql://user:PASSWORD@host/dbname'
  if (!url.hostname) return 'it has no host name'
  if (!url.pathname || url.pathname === '/') return 'it has no database name at the end — expected …/dbname (for Neon usually …/neondb)'
  return null
}

const testUrl = process.env.TEST_DATABASE_URL?.trim()

for (const name of ['TEST_DATABASE_URL', 'TEST_DATABASE_URL_UNPOOLED'] as const) {
  const value = process.env[name]
  const problem = value ? connectionStringProblem(value) : null
  if (problem) throw new Error(`${name} in .env.local is not a usable Postgres connection string: ${problem}.`)
}

if (testUrl) {
  if (testUrl === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is the same as DATABASE_URL — point it at the separate test branch, not production.')
  }
  process.env.DATABASE_URL = testUrl
  process.env.DATABASE_URL_UNPOOLED = process.env.TEST_DATABASE_URL_UNPOOLED?.trim() || testUrl
} else {
  delete process.env.DATABASE_URL
  delete process.env.DATABASE_URL_UNPOOLED
}
