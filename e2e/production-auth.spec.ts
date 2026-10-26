import { expect, test } from '@playwright/test'

const productionUrl = 'https://mojeanitka.cz'

test.describe('production Neon Auth smoke', () => {
  // This test is deliberately not run on PRs: avoid accidental production login bursts
  // and auth rate limits. It runs after pushes to main or on manual workflow dispatch.
  test.skip(
    process.env.RUN_PRODUCTION_AUTH_SMOKE !== 'true'
      || !process.env.PRODUCTION_AUTH_EMAIL
      || !process.env.PRODUCTION_AUTH_PASSWORD,
    'Production auth smoke requires an enabled main/manual run and dedicated GitHub Actions credentials.',
  )
  test.describe.configure({ retries: 0 })

  test('can sign in to the production account and reports the exact failure', async ({ page }) => {
    const email = process.env.PRODUCTION_AUTH_EMAIL!
    const password = process.env.PRODUCTION_AUTH_PASSWORD!
    const authResponses: Array<{ status: number; url: string; body: Promise<string> }> = []

    page.on('response', (response) => {
      // Neon Auth endpoint is cross-origin; retain response details only for the sign-in request.
      if (/\/sign-in\/email(?:\?|$)/i.test(response.url())) {
        authResponses.push({
          status: response.status(),
          url: response.url(),
          body: response.text().catch(() => '[response body unavailable]'),
        })
      }
    })

    await page.goto(`${productionUrl}/auth/sign-in`, { waitUntil: 'domcontentloaded' })
    await page.getByLabel('E-mail').fill(email)
    await page.getByLabel('Heslo').fill(password)
    await page.getByRole('button', { name: 'Přihlásit se' }).click()

    const errorMessage = page.locator('form p.text-destructive')
    const result = await Promise.race([
      page.waitForURL((url) => !url.pathname.startsWith('/auth/sign-in'), { timeout: 20_000 })
        .then(() => 'success' as const)
        .catch(() => 'navigation-timeout' as const),
      errorMessage.waitFor({ state: 'visible', timeout: 20_000 })
        .then(() => 'ui-error' as const)
        .catch(() => 'error-timeout' as const),
    ])

    if (result !== 'success' || new URL(page.url()).pathname.startsWith('/auth/sign-in')) {
      const uiMessage = await errorMessage.textContent().catch(() => null)
      const responses = await Promise.all(authResponses.map(async (entry) => ({
        status: entry.status,
        url: entry.url.replace(/([?&](?:email|token|code)=)[^&]*/gi, '$1[redacted]'),
        body: (await entry.body).slice(0, 1500),
      })))
      const diagnostics = {
        result,
        currentUrl: page.url(),
        uiMessage: uiMessage?.trim() || null,
        authResponses: responses,
      }
      console.error('[production-auth-smoke] Login failed:', JSON.stringify(diagnostics, null, 2))
      throw new Error(`Production login failed. Diagnostics: ${JSON.stringify(diagnostics)}`)
    }

    // Login only: do not create, edit, or delete any production records.
    await expect(page).not.toHaveURL(/\/auth\/sign-in/)
  })
})
