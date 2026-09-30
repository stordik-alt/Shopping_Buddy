import { expect, test, type Page } from '@playwright/test'
import { Client } from 'pg'

function testDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim()
  const testValue = process.env.TEST_DATABASE_URL?.trim()
  const testUnpooledValue = process.env.TEST_DATABASE_URL_UNPOOLED?.trim()
  const expectedValues = [testValue, testUnpooledValue].filter((item): item is string => Boolean(item))
  if (!value || expectedValues.length === 0 || !expectedValues.includes(value)) {
    throw new Error('E2E smoke tests require DATABASE_URL to be exactly the isolated TEST_DATABASE_URL or TEST_DATABASE_URL_UNPOOLED.')
  }
  if (process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production') {
    throw new Error('E2E smoke tests must never run against a Vercel production deployment.')
  }
  return value
}

async function cleanupTestAccount(email: string) {
  const client = new Client({ connectionString: testDatabaseUrl() })
  await client.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query<{ id: string }>(
      'SELECT id FROM neon_auth."user" WHERE lower(email) = lower($1)',
      [email],
    )
    for (const { id: userId } of result.rows) {
      await client.query(
        'DELETE FROM households WHERE id IN (SELECT household_id FROM household_members WHERE user_id = $1)',
        [userId],
      )
      await client.query('DELETE FROM neon_auth."user" WHERE id = $1', [userId])
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}

async function expectSection(page: Page, path: string, tab: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(path)
  await expect(page.getByRole('heading', { name: tab, level: 1 })).toBeVisible({ timeout: 15000 })

  const navigation = page.getByRole('navigation', { name: 'Hlavní navigace' })
  await expect(navigation).toBeVisible({ timeout: 15000 })
  await expect(navigation.getByRole('button', { name: tab, exact: true })).toHaveAttribute('aria-current', 'page')
}

test.describe('critical smoke flow', () => {
  test.setTimeout(90000)
  test('public intro is reachable', async ({ page }) => {
    await page.goto('/intro')
    await expect(page.getByRole('img', { name: 'ANITKA' })).toBeVisible()
  })

  test('new account reaches the protected app and main navigation remains usable', async ({ page }, testInfo) => {
    const email = `e2e-${process.env.GITHUB_RUN_ID ?? Date.now()}-${process.env.GITHUB_RUN_ATTEMPT ?? 1}-${testInfo.retry}-${process.env.PLAYWRIGHT_WORKER_INDEX ?? 0}@example.com`
    const password = 'SmokeTest-2026!'
    const name = 'E2E Smoke'

    try {
      await page.goto('/auth/sign-up')
      await page.getByLabel('Jméno').fill(name)
      await page.getByLabel('E-mail').fill(email)
      await page.getByLabel('Heslo').fill(password)
      const signUpResponsePromise = page.waitForResponse(
        (response) => {
          const url = new URL(response.url())
          return response.request().method() === 'POST' && url.pathname === '/api/auth/sign-up/email'
        },
        { timeout: 15000 },
      )
      await page.getByRole('button', { name: 'Založit účet' }).click()

      const signUpResponse = await signUpResponsePromise
      const signUpBody = await signUpResponse.text()
      if (!signUpResponse.ok()) {
        throw new Error(
          `Sign-up API failed with HTTP ${signUpResponse.status()}: ${signUpBody || '(empty response body)'}`,
        )
      }

      await expect(page).toHaveURL(/\/$/, { timeout: 15000 })
      await expect(page.getByRole('navigation', { name: 'Hlavní navigace' })).toBeVisible({ timeout: 15000 })

      await expectSection(page, '/?tab=nakup', 'Nákup')
      await expect(page.getByRole('group', { name: 'Zobrazení nákupu' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Nákupní seznam', exact: true })).toHaveAttribute('aria-pressed', 'true')

      await expectSection(page, '/?tab=zasoby', 'Zásoby')
      await expectSection(page, '/?tab=rozpocet', 'Rozpočet')
      await expectSection(page, '/?tab=recepty', 'Recepty')
    } finally {
      await cleanupTestAccount(email)
    }
  })
})