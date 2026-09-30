import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000/intro',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // The CI/local smoke suite uses the self-hosted Better Auth implementation. Keep the
      // browser client on the same implementation as lib/auth/server.ts; otherwise a missing
      // NEXT_PUBLIC_LOCAL_DATABASE value makes the browser use Neon Auth while the server uses
      // local Better Auth, producing a successful-looking signup request without a usable session.
      NEXT_PUBLIC_LOCAL_DATABASE: '1',
    },
  },
})
