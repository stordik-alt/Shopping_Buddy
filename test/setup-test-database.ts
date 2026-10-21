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
  if (testUrl === process.env.DATABASE_URL && process.env.DATABASE_DRIVER !== 'pg') {
    throw new Error('TEST_DATABASE_URL is the same as DATABASE_URL — point it at the separate test database, not production.')
  }
  process.env.DATABASE_URL = testUrl
  process.env.DATABASE_URL_UNPOOLED = process.env.TEST_DATABASE_URL_UNPOOLED?.trim() || testUrl
} else {
  delete process.env.DATABASE_URL
  delete process.env.DATABASE_URL_UNPOOLED
}

/**
 * Proměnné, které rozhodují, jakou cestou kód běží — ne o tom, kam se píše do databáze.
 *
 * `.env.local` obsahuje i produkční klíče (Azure OCR, Google Vision, VAPID), a testy pak běží
 * jinou cestou než v CI, kde ty proměnné chybí: v 61 testech to znamenalo padnutí, i když je
 * kód v pořádku. Až naopak — testy si volají skutečné Azure API s produkčním klíčem, takže
 * běh testů utrácí peníze a sahá na cizí službu.
 *
 * Proto se tu vymažou. Test, který danou službu potřebuje, si ji nastaví sám (například
 * app/actions/push.test.ts generuje vlastní VAPID klíče) a toto vymazání mu nic nezkazí:
 * setup soubor běží před každým testovacím souborem, takže test si proměnnou nastaví až poté.
 *
 * R2 a Neon Auth tu nejsou: R2 testy si nastavují falešné hodnoty a mockují síť, Neon Auth je
 * ve všech dotčených testech mockovaný. Proměnné, které se v této izolaci výslovně neuvádí,
 * patří buď databázi (viz výše) nebo konfiguraci hostingu.
 */
const PROVIDER_ENV = [
  // OCR — Azure Document Intelligence a Google Vision (docs/08_OCR_RECEIPT_PIPELINE.md).
  'AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT',
  'AZURE_DOCUMENT_INTELLIGENCE_KEY',
  'GOOGLE_VISION_API_KEY',
  // Web Push (docs/push-notifications.md).
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  // AI Gateway (lib/ai/client.ts).
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_AI_GATEWAY_ID',
  'CLOUDFLARE_AI_GATEWAY_TOKEN',
  // Google Cloud OIDC (lib/gcp-oidc.ts).
  'GCP_OIDC_ISSUER',
  'GCP_OIDC_KEY_ID',
  'GCP_OIDC_PRIVATE_KEY',
  'GCP_OIDC_SUBJECT',
  'GCP_OIDC_TOKEN_SOURCE',
  'GCP_PROJECT_ID',
  'GCP_PROJECT_NUMBER',
  'GCP_SERVICE_ACCOUNT_EMAIL',
  'GCP_WORKLOAD_IDENTITY_POOL_ID',
  'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
] as const

for (const name of PROVIDER_ENV) delete process.env[name]
