import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    // Runs before every test file: routes database-backed tests to the test branch, never production.
    setupFiles: ['./test/setup-test-database.ts'],
  },
})
