import { expect, test } from '@playwright/test'
import { Client } from 'pg'

function testDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim()
  const testValue = process.env.TEST_DATABASE_URL?.trim()
  if (!value || !testValue || value !== testValue) {
    throw new Error('E2E smoke tests require DATABASE_URL to be exactly the isolated TEST_DATABASE_URL.')
  }
  if (process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production') {
    throw new Error('E2E smoke tests must never run against a Vercel production deployment.')
  }
  return value
}

async function cleanupTestAccount(email: string) {
  const client = new Client({
    connectionString: testDatabaseUrl(),
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
  })
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
    await expect(page.getByText('ANITKA')).toBeVisible()
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
      await page.getByRole('button', { name: 'Založit účet' }).click()

      await expect(page).toHaveURL(/\/$/)
      // The same words are in the brand (sidebar) and in the phone header, so take the first visible one.
      await expect(page.getByRole('heading', { name: 'Rodinný nákup', exact: true })).toBeVisible()

      await page.goto('/?tab=nakup')
      await expect(page.getByText('Nákupní seznam', { exact: true }).first()).toBeVisible()

      await page.goto('/?tab=zasoby')
      await expect(page.getByText('Zásoby', { exact: true }).first()).toBeVisible()

      await page.goto('/?tab=rozpocet')
      await expect(page.getByText('Aktuální stav', { exact: true }).first()).toBeVisible()

      await page.goto('/?tab=recepty')
      await expect(page.getByText('Recepty', { exact: true }).first()).toBeVisible()

      const mobileViewports = [
        { width: 320, height: 844 },
        { width: 360, height: 800 },
        { width: 390, height: 844 },
        { width: 430, height: 932 },
        { width: 768, height: 1024 },
        { width: 1280, height: 900 },
      ]
      const themes = ['light', 'dark'] as const
      const primaryTabs = [
        ['/', 'Domů'],
        ['/?tab=nakup', 'Nákupní seznam'],
        ['/?tab=zasoby', 'Zásoby'],
        ['/?tab=rozpocet', 'Aktuální stav'],
        ['/?tab=recepty', 'Recepty'],
      ] as const

      for (const colorScheme of themes) {
        await page.emulateMedia({ colorScheme })
        for (const viewport of mobileViewports) {
          await page.setViewportSize(viewport)
          await page.goto('/')
          await expect(page.getByRole('heading', { name: 'Rodinný nákup', exact: true })).toBeVisible()
          await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
          await expect.poll(() => page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('body *')).filter((element) => {
              const node = element as HTMLElement
              if (!node.innerText?.trim()) return false
              const style = getComputedStyle(node)
              return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0
            })
            return elements.every((element) => Number.parseFloat(getComputedStyle(element).fontSize) >= 12)
          })).toBe(true)
          await page.screenshot({
            path: 'test-results/mobile-ui-v2/' + colorScheme + '-' + viewport.width + 'x' + viewport.height + '-home.png',
            fullPage: true,
          })

          if (viewport.width === 390 && viewport.height === 844) {
            for (const [url, label] of primaryTabs) {
              await page.goto(url)
              await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
              await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
              await page.screenshot({
                path: 'test-results/mobile-ui-v2/' + colorScheme + '-390x844-' + label.replaceAll(' ', '-').toLowerCase() + '.png',
                fullPage: true,
              })
            }
          }
        }
      }
    } finally {
      await cleanupTestAccount(email)
    }
  })
})
