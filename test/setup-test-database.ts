// Database-backed tests write real rows — households, receipts, products, prices — and clean them
// up afterwards. A run that times out or is interrupted never reaches its cleanup, and those rows
// stayed behind in the production database: users saw a "Mléko" product with 68 invented receipt
// prices and two Lidl branches called "OCR Testovací …" (removed 2026-09-25). So tests never use
// the production DATABASE_URL.
//
// They use TEST_DATABASE_URL instead — a separate Neon branch (see docs/01_CURRENT_STATE.md, "Test
// database"). Without it DATABASE_URL is cleared, so a database-backed test fails with a missing
// connection instead of quietly writing to production; pure unit tests are unaffected.
const testUrl = process.env.TEST_DATABASE_URL

if (testUrl) {
  if (testUrl === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is the same as DATABASE_URL — point it at the separate test branch, not production.')
  }
  process.env.DATABASE_URL = testUrl
  process.env.DATABASE_URL_UNPOOLED = process.env.TEST_DATABASE_URL_UNPOOLED ?? testUrl
} else {
  delete process.env.DATABASE_URL
  delete process.env.DATABASE_URL_UNPOOLED
}
