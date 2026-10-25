import { expect, test } from '@playwright/test'
import { Client } from 'pg'

async function expectVisibleExactText(page: import('@playwright/test').Page, text: string) {
  await expect.poll(async () => page.getByText(text, { exact: true }).evaluateAll((elements) => elements.some((element) => {
    const node = element as HTMLElement
    const style = getComputedStyle(node)
    return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0
  }))).toBe(true)
}

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

async function markTestAccountEmailVerified(email: string) {
  const client = new Client({
    connectionString: testDatabaseUrl(),
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
  })
  await client.connect()
  try {
    // E2E uses an isolated test database and has no configured mail inbox. This test fixture
    // simulates the state reached only after a real OTP has been accepted in production.
    await client.query('UPDATE neon_auth."user" SET "emailVerified" = true WHERE lower(email) = lower($1)', [email])
  } finally {
    await client.end()
  }
}

async function seedVisualAccount(email: string) {
  const client = new Client({
    connectionString: testDatabaseUrl(),
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
  })
  await client.connect()
  try {
    await client.query('BEGIN')
    const account = await client.query<{ household_id: string }>(
      `SELECT hm.household_id
       FROM household_members hm
       JOIN neon_auth."user" u ON u.id = hm.user_id
       WHERE lower(u.email) = lower($1)
       ORDER BY hm.joined_at DESC
       LIMIT 1`,
      [email],
    )
    const householdId = account.rows[0]?.household_id
    if (!householdId) throw new Error('The visual smoke account has no household.')

    const lists = await client.query<{ id: string }>(
      'SELECT id FROM shopping_lists WHERE household_id = $1 ORDER BY created_at LIMIT 1',
      [householdId],
    )
    const listId = lists.rows[0]?.id ?? (await client.query<{ id: string }>(
      'INSERT INTO shopping_lists (household_id, name) VALUES ($1, $2) RETURNING id',
      [householdId, 'Hlavní seznam'],
    )).rows[0].id

    for (const [name, quantity, unit, category] of [
      ['Mléko', 2, 'ks', 'Potraviny'],
      ['Chléb', 1, 'ks', 'Potraviny'],
      ['Jablka', 1, 'kg', 'Potraviny'],
    ] as const) {
      await client.query(
        'INSERT INTO shopping_list_items (list_id, name, quantity, unit, category) VALUES ($1, $2, $3, $4, $5)',
        [listId, name, quantity, unit, category],
      )
    }
    await client.query(
      'INSERT INTO pantry_items (household_id, name, category, location, quantity, unit) VALUES ($1, $2, $3, $4, $5, $6)',
      [householdId, 'Rýže', 'Potraviny', 'Spíž', 2, 'kg'],
    )
    await client.query(
      'INSERT INTO expenses (household_id, amount, note, category, date) VALUES ($1, $2, $3, $4, current_date)',
      [householdId, 685, 'Vizuální nákup', 'Potraviny'],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
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
    await expect(page.getByRole('img', { name: 'ANITKA', exact: true })).toBeVisible()
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

      await expect(page).toHaveURL(/\/auth\/verify-email/)
      await expect(page.getByRole('heading', { name: 'Ověření e-mailu' })).toBeVisible()
      await expect(page.getByLabel('Ověřovací kód')).toBeVisible()

      // The isolated E2E database has no inbox for OTP delivery. Mark this disposable test
      // account verified as a fixture, then continue testing the authenticated application.
      await markTestAccountEmailVerified(email)
      await seedVisualAccount(email)
      await page.goto(`/auth/sign-in?verified=1&email=${encodeURIComponent(email)}`)
      await page.getByLabel('E-mail').fill(email)
      await page.getByLabel('Heslo').fill(password)
      await page.getByRole('button', { name: 'Přihlásit se' }).click()
      await expect(page).toHaveURL(/\/$/)
      // The same words are in the brand (sidebar) and in the phone header, so take the first visible one.
      await expect(page.locator('body')).toContainText('Asistent pro domácnost')
      // First-time accounts automatically get Anitka's guide. Dismiss it so this test can exercise
      // navigation underneath it; the guide itself is covered by its component tests.
      const guide = page.getByRole('dialog', { name: 'Průvodce aplikací' })
      await expect(guide).toBeVisible()
      await page.setViewportSize({ width: 390, height: 844 })
      await page.emulateMedia({ colorScheme: 'light' })
      await page.screenshot({ path: 'test-results/mobile-ui-v2/light-390x844-guide-welcome.png', fullPage: true })
      await guide.getByRole('button', { name: 'Začít' }).click()
      await expect(guide.getByRole('heading', { name: 'Jak se tu pohybovat' })).toBeVisible()
      await page.screenshot({ path: 'test-results/mobile-ui-v2/light-390x844-guide-navigation-spotlight.png', fullPage: true })
      await guide.getByRole('button', { name: 'Zavřít průvodce' }).click()
      await expect(guide).toHaveCount(0)

      await page.goto('/?tab=nakup')
      await expectVisibleExactText(page, 'Nákupní seznam')

      await page.goto('/?tab=zasoby')
      await expectVisibleExactText(page, 'Zásoby')

      await page.goto('/?tab=rozpocet')
      await expectVisibleExactText(page, 'Přehled')

      await page.goto('/?tab=recepty')
      await expectVisibleExactText(page, 'Recepty')

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
        ['/', 'Domů', 'home'],
        ['/?tab=nakup', 'Nákupní seznam', 'shopping'],
        ['/?tab=zasoby', 'Zásoby', 'pantry'],
        ['/?tab=rozpocet', 'Přehled', 'budget'],
        ['/?tab=recepty', 'Recepty', 'recipes'],
        ['/?tab=akce', 'Akce', 'deals'],
        ['/?tab=obchody', 'Obchody', 'stores'],
        ['/?tab=profil', 'Profil', 'profile'],
      ] as const

      for (const colorScheme of themes) {
        await page.emulateMedia({ colorScheme })
        for (const viewport of mobileViewports) {
          await page.setViewportSize(viewport)
          await page.goto('/')
          if (viewport.width < 1024) {
            await expect(page.getByRole('heading', { name: 'Asistent pro domácnost', exact: true })).toBeVisible()
          } else {
            await expect(page.locator('aside').getByText('Asistent pro domácnost', { exact: true })).toBeVisible()
          }
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
            for (const [url, label, screenshotName] of primaryTabs) {
              await page.goto(url)
              await expectVisibleExactText(page, label)
              await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
              await page.screenshot({ path: `test-results/mobile-parity/pwa/${colorScheme}-${screenshotName}.png`, fullPage: false })
              await page.screenshot({
                path: 'test-results/mobile-ui-v2/' + colorScheme + '-390x844-' + label.replaceAll(' ', '-').toLowerCase() + '.png',
                fullPage: true,
              })
              if (url === '/?tab=nakup') {
                await page.getByRole('button', { name: 'Účtenky', exact: true }).first().click()
                await expect(page.getByText('Rozpracované účtenky', { exact: true })).toBeVisible()
                await page.screenshot({ path: `test-results/mobile-parity/pwa/${colorScheme}-receipts.png`, fullPage: false })
                await page.screenshot({ path: 'test-results/mobile-ui-v2/' + colorScheme + '-390x844-uctenky.png', fullPage: true })
              }
              if (url === '/?tab=recepty') {
                await page.getByRole('button', { name: 'Jídelníček', exact: true }).first().click()
                await expect(page.getByText('Jídelníček', { exact: true }).first()).toBeVisible()
                await page.screenshot({ path: `test-results/mobile-parity/pwa/${colorScheme}-mealplan.png`, fullPage: false })
                await page.screenshot({ path: 'test-results/mobile-ui-v2/' + colorScheme + '-390x844-jidelnicek.png', fullPage: true })
              }
              if (url === '/?tab=rozpocet') {
                await page.getByRole('button', { name: 'Plánování', exact: true }).first().click()
                await expect(page.getByText('Rozpočtové období:')).toBeVisible()
                await page.screenshot({ path: `test-results/mobile-parity/pwa/${colorScheme}-budget-plan.png`, fullPage: false })
                await page.screenshot({ path: 'test-results/mobile-ui-v2/' + colorScheme + '-390x844-rozpocet-planovani.png', fullPage: true })
              }
            }

            await page.goto('/')
            await expect(page.getByRole('heading', { name: 'Asistent pro domácnost', exact: true })).toBeVisible()
            await page.getByRole('button', { name: 'Otevřít chat s Anitkou' }).click()
            await expect(page.getByRole('dialog', { name: 'Chat s Anitkou' })).toBeVisible()
            await page.screenshot({ path: `test-results/mobile-parity/pwa/${colorScheme}-ai-chat.png`, fullPage: false })
            await page.screenshot({ path: 'test-results/mobile-ui-v2/' + colorScheme + '-390x844-ai-chat.png', fullPage: true })
            await page.getByRole('button', { name: 'Zavřít' }).click()

            await page.getByRole('button', { name: 'Účet a nastavení' }).click()
            await page.getByRole('menuitem', { name: 'Průvodce aplikací' }).click()
            const reopenedGuide = page.getByRole('dialog', { name: 'Průvodce aplikací' })
            await expect(reopenedGuide).toBeVisible()
            await page.screenshot({ path: `test-results/mobile-parity/pwa/${colorScheme}-guide-welcome.png`, fullPage: false })
            await page.screenshot({ path: 'test-results/mobile-ui-v2/' + colorScheme + '-390x844-guide-welcome.png', fullPage: true })
            await reopenedGuide.getByRole('button', { name: 'Začít' }).click()
            await expect(reopenedGuide.getByRole('heading', { name: 'Jak se tu pohybovat' })).toBeVisible()
            await page.screenshot({ path: `test-results/mobile-parity/pwa/${colorScheme}-guide-spotlight.png`, fullPage: false })
            await page.screenshot({ path: 'test-results/mobile-ui-v2/' + colorScheme + '-390x844-guide-navigation-spotlight.png', fullPage: true })
            await reopenedGuide.getByRole('button', { name: 'Další' }).click()
            await reopenedGuide.getByRole('heading', { name: 'Domů: dnešní přehled' }).waitFor()
            await reopenedGuide.getByRole('button', { name: 'Další' }).click()
            await expect(reopenedGuide.getByRole('heading', { name: 'Nákupní seznam: co máme koupit' })).toBeVisible()
            await expect(page.getByText('Sem napište, co chybí', { exact: true })).toBeVisible()
            await page.screenshot({ path: `test-results/mobile-parity/pwa/${colorScheme}-guide-feature-spotlight.png`, fullPage: false })
            await reopenedGuide.getByRole('button', { name: 'Zavřít průvodce' }).click()
          }
        }
      }
    } finally {
      await cleanupTestAccount(email)
    }
  })
})
