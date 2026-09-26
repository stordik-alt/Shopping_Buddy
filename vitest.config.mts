import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    // Runs before every test file: routes database-backed tests to the test branch, never production.
    setupFiles: ['./test/setup-test-database.ts'],
    // Database-backed tests talk to the Neon test branch in us-east-1 over the internet: a test makes
    // several round trips and a cleanup hook deletes row after row. The defaults (5 s per test, 10 s
    // per hook) failed tests at random from Czechia, and a cleanup cut off by its timeout left rows
    // behind that failed the next runs (2026-09-26: a leftover "Mléko" product let a receipt that
    // should need review complete on its own). Pure tests finish in milliseconds either way.
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // The Cloudflare build output (`pnpm cf:build`) contains copies of dependencies; never test those.
    exclude: [...configDefaults.exclude, '.open-next/**', '.wrangler/**'],
  },
})
