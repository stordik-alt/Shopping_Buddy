import { expect, test } from '@playwright/test'
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
    if (result.rows.length > 0) {
      const userId = result.rows[0].id
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

test.describe('critical smoke flow', () => {
  test('public intro is reachable', async ({ page }) => {
    await page.goto('/intro')
    await expect(page.getByRole('img', { name: 'ANITKA' })).toBeVisible()
  })

  test('new account reaches the protected app and main navigation remains usable', async ({ page }) => {
    const email = `e2e-${process.env.GITHUB_RUN_ID ?? Date.now()}-${process.env.PLAYWRIGHT_WORKER_INDEX ?? 0}@example.com`
    const password = 'SmokeTest-2026!'
    const name = 'E2E Smoke'

    try {
      await page.goto('/auth/sign-up')
      await page.getByLabel('Jméno').fill(name)
      await page.getByLabel('E-mail').fill(email)
      await page.getByLabel('Heslo').fill(password)
      const signUpResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url())
        return response.request().method() === 'POST' && url.pathname === '/api/auth/sign-up/email'
      })
      await page.getByRole('button', { name: 'Založit účet' }).click()

      const signUpResponse = await signUpResponsePromise
      const signUpBody = await signUpResponse.text()
      if (!signUpResponse.ok()) {
        throw new Error(
          `Sign-up API failed with HTTP ${signUpResponse.status()}: ${signUpBody || '(empty response body)'}`,
        )
      }

      await expect(page).toHaveURL(/\/$/, { timeout: 15000 })
      await expect(
        page.getByRole('navigation', { name: 'Hlavní navigace' }),
      ).toBeVisible({ timeout: 15000 })

      await page.goto('/?tab=nakup')
      await expect(page.getByText('Nákupní seznam', { exact: true })).toBeVisible()

      await page.goto('/?tab=zasoby')
      await expect(page.getByText('Zásoby', { exact: true })).toBeVisible()

      await page.goto('/?tab=rozpocet')
      await expect(page.getByText('Aktuální stav', { exact: true })).toBeVisible()

      await page.goto('/?tab=recepty')
      await expect(page.getByText('Recepty', { exact: true })).toBeVisible()
    } finally {
      await cleanupTestAccount(email)
    }
  })
})
