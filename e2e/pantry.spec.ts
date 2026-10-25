import { expect, test, type Page } from '@playwright/test'
import { Client } from 'pg'

// Audit of the Zásoby screen (docs: the "obrazková mřížka buněk" redesign).
//
// The run has two phases, chosen by PANTRY_AUDIT_PHASE:
//   "before" — captures the current row list (the audit baseline) and skips the functional checks,
//              because the grid does not exist yet;
//   "after"  — captures the new grid and runs the twelve checks from the brief.
//
// Every test writes to the isolated test database only. `testDatabaseUrl()` refuses to run unless
// DATABASE_URL is exactly TEST_DATABASE_URL, so production stock can never be touched here.

const PHASE = process.env.PANTRY_AUDIT_PHASE === 'before' ? 'before' : 'after'
const SHOTS = `test-results/pantry-audit/${PHASE}`

type SeedItem = {
  name: string
  category: string
  subcategory: string | null
  location: string
  quantity: number
  unit: string
  pieceQuantity?: number
  pieceUnit?: string
  typeKey: string
}

// A realistic household stock: fresh produce in the fridge, dry goods in the pantry, something in
// the freezer, something in the bathroom, one item already used up (quantity 0) and one name long
// enough to break a two-column grid.
const SEED: SeedItem[] = [
  { name: 'Rajčata', category: 'Potraviny', subcategory: 'Ovoce a zelenina', location: 'Lednice', quantity: 4, unit: 'ks', typeKey: 'rajcata' },
  { name: 'Banány', category: 'Potraviny', subcategory: 'Ovoce a zelenina', location: 'Spíž', quantity: 3, unit: 'ks', typeKey: 'banany' },
  { name: 'Minerálka', category: 'Potraviny', subcategory: 'Nápoje', location: 'Lednice', quantity: 3, unit: 'ks', pieceQuantity: 1.5, pieceUnit: 'l', typeKey: 'voda-neperliva' },
  { name: 'Těstoviny', category: 'Potraviny', subcategory: 'Těstoviny a rýže', location: 'Spíž', quantity: 2, unit: 'ks', pieceQuantity: 500, pieceUnit: 'g', typeKey: 'testoviny' },
  { name: 'Mléko polotučné', category: 'Potraviny', subcategory: 'Mléčné výrobky', location: 'Lednice', quantity: 2, unit: 'l', typeKey: 'mleko-polotucne' },
  { name: 'Chléb', category: 'Potraviny', subcategory: 'Pečivo', location: 'Spíž', quantity: 1, unit: 'ks', typeKey: 'chleb' },
  { name: 'Kuřecí prsa', category: 'Potraviny', subcategory: 'Maso a uzeniny', location: 'Lednice', quantity: 0.5, unit: 'kg', typeKey: 'kureci-prsa' },
  { name: 'Hranolky', category: 'Potraviny', subcategory: null, location: 'Mrazák', quantity: 0.75, unit: 'kg', typeKey: 'hranolky' },
  { name: 'Mýdlo', category: 'Drogerie', subcategory: 'Hygiena', location: 'Drogérka', quantity: 1, unit: 'ks', typeKey: 'mydlo' },
  {
    name: 'Extra premium italské olivové oleje panské extra virgin 0,5 l',
    category: 'Potraviny',
    subcategory: 'Oleje a tuky',
    location: 'Spíž',
    quantity: 1,
    unit: 'ks',
    typeKey: 'olej-olivovy',
  },
  { name: 'Kefír', category: 'Potraviny', subcategory: 'Mléčné výrobky', location: 'Lednice', quantity: 0, unit: 'kg', typeKey: 'kefir' },
]

const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 1280, height: 900 },
]

function testDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim()
  const testValue = process.env.TEST_DATABASE_URL?.trim()
  if (!value || !testValue || value !== testValue) {
    throw new Error('E2E pantry tests require DATABASE_URL to be exactly the isolated TEST_DATABASE_URL.')
  }
  if (process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production') {
    throw new Error('E2E pantry tests must never run against a production deployment.')
  }
  return value
}

async function withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: testDatabaseUrl(), connectionTimeoutMillis: 5_000, query_timeout: 15_000 })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

async function markTestAccountEmailVerified(email: string) {
  // The isolated E2E database has no inbox for OTP delivery. This fixture simulates the state
  // reached only after a real OTP has been accepted in production.
  await withClient((client) =>
    client.query('UPDATE neon_auth."user" SET "emailVerified" = true WHERE lower(email) = lower($1)', [email]),
  )
}

async function cleanupTestAccount(email: string) {
  await withClient(async (client) => {
    await client.query('BEGIN')
    try {
      const result = await client.query<{ id: string }>('SELECT id FROM neon_auth."user" WHERE lower(email) = lower($1)', [email])
      for (const row of result.rows) {
        await client.query('DELETE FROM households WHERE id IN (SELECT household_id FROM household_members WHERE user_id = $1)', [row.id])
        await client.query('DELETE FROM neon_auth."user" WHERE id = $1', [row.id])
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  })
}

/** The household the freshly signed-up account got, so the seeded stock belongs to it. */
async function householdIdFor(email: string): Promise<string> {
  return withClient(async (client) => {
    const result = await client.query<{ id: string }>(
      `SELECT h.id FROM households h
         JOIN household_members m ON m.household_id = h.id
         JOIN neon_auth."user" u ON u.id = m.user_id
        WHERE lower(u.email) = lower($1)`,
      [email],
    )
    if (result.rows.length !== 1) throw new Error(`Expected exactly one household for ${email}, found ${result.rows.length}`)
    return result.rows[0].id
  })
}

async function seedPantry(householdId: string) {
  await withClient(async (client) => {
    await client.query('BEGIN')
    try {
      for (const item of SEED) {
        const type = await client.query<{ id: string }>('SELECT id FROM product_types WHERE key = $1', [item.typeKey])
        if (type.rows.length !== 1) throw new Error(`Unknown product type key: ${item.typeKey}`)
        const subcategory = item.subcategory
          ? await client.query<{ id: string }>('SELECT id FROM product_subcategories WHERE name = $1 AND category = $2', [item.subcategory, item.category])
          : { rows: [] as { id: string }[] }
        await client.query(
          `INSERT INTO pantry_items
             (household_id, product_type_id, name, category, subcategory_id, location, quantity, unit, piece_quantity, piece_unit, tracking, added_at)
           VALUES ($1, $2, $3, $4::item_category, $5, $6::pantry_location, $7, $8::item_unit, $9, $10::item_unit, 'normal', now() - interval '1 day')`,
          [
            householdId,
            type.rows[0].id,
            item.name,
            item.category,
            subcategory.rows[0]?.id ?? null,
            item.location,
            item.quantity,
            item.unit,
            item.pieceQuantity ?? null,
            item.pieceUnit ?? null,
          ],
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  })
}

/**
 * The sign-up and sign-in forms are limited per address (app/api/auth/[...path]/route.ts, five
 * sign-ups an hour). The isolated E2E database is used by nothing else, so the fixture clears its
 * own counters before it starts; without this, a second local run would be locked out.
 */
async function resetAuthRateLimits() {
  await withClient((client) => client.query("DELETE FROM rate_limits WHERE key LIKE 'signup:%' OR key LIKE 'signin:%'"))
}

async function accountExists(email: string): Promise<boolean> {
  return withClient(async (client) => {
    const result = await client.query('SELECT 1 FROM neon_auth."user" WHERE lower(email) = lower($1) LIMIT 1', [email])
    return result.rows.length > 0
  })
}

/**
 * Creates the disposable test account and signs in.
 *
 * The sign-up and sign-in forms are client components: a click that lands before React has
 * hydrated submits the form natively and the page reloads instead of navigating. That is a race of
 * the test harness, not of the app, so both forms are retried until the navigation happens (or
 * until the account is known to exist).
 */
async function signUpAndSignIn(page: Page, email: string, password: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto('/auth/sign-up')
    await page.getByLabel('Jméno').fill('E2E Zásoby')
    await page.getByLabel('E-mail').fill(email)
    await page.getByLabel('Heslo').fill(password)
    await page.getByRole('button', { name: 'Založit účet' }).click()
    // The form's own error paragraph; Next.js' route announcer also carries role="alert".
    const signUpError = page.locator('form p[role="alert"]')
    const outcome = await Promise.race([
      page.waitForURL('**/auth/verify-email**', { timeout: 10_000 }).then(() => 'verified' as const),
      signUpError.waitFor({ timeout: 10_000 }).then(() => 'refused' as const),
    ]).catch(() => 'silent' as const)
    if (outcome === 'refused') throw new Error(`Sign-up was refused: ${await signUpError.textContent()}`)
    if (outcome === 'verified') break
    if (await accountExists(email)) break
  }

  await markTestAccountEmailVerified(email)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(`/auth/sign-in?verified=1&email=${encodeURIComponent(email)}`)
    await page.getByLabel('E-mail').fill(email)
    await page.getByLabel('Heslo').fill(password)
    await page.getByRole('button', { name: 'Přihlásit se' }).click()
    const signInError = page.locator('form p.text-destructive')
    const outcome = await Promise.race([
      page.waitForURL((url) => url.pathname === '/', { timeout: 10_000 }).then(() => 'in' as const),
      signInError.waitFor({ timeout: 10_000 }).then(() => 'refused' as const),
    ]).catch(() => 'silent' as const)
    if (outcome === 'refused') throw new Error(`Sign-in was refused: ${await signInError.textContent()}`)
    if (outcome === 'in') break
  }

  // First-time accounts get Anitka's guide, which floats over the app and animates; dismiss it so
  // the pantry underneath can be reached and its buttons stop moving.
  const guide = page.getByRole('dialog', { name: 'Průvodce aplikací' })
  await guide.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined)
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Přeskočit' }).click()
    await expect(guide).toHaveCount(0)
  }
}

/** Open the Zásoby tab and wait for the stock to be on screen. */
async function openPantry(page: Page) {
  await page.goto('/?tab=zasoby', { timeout: 120_000 })
  await expect(page.getByRole('navigation', { name: 'Umístění zásob' })).toBeVisible()
}

async function openPlace(page: Page, place: string) {
  await page.getByRole('button', { name: new RegExp(`^${place}`) }).first().click()
}

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
}

function pantryCard(page: Page, name: string) {
  const detailButton = page.getByRole('button', { name: `Otevřít detail: ${name}`, exact: true })
  return page.getByTestId('pantry-card').filter({ has: detailButton })
}

test.describe('Zásoby audit', () => {
  test('grid of product cells with in-cell quantity and availability', async ({ page }) => {
    // The audit signs in, seeds a household, walks every viewport and captures 32 full-page
    // screenshots. Keep enough time for those captures, while bounding a missing UI control so
    // one stalled locator cannot consume the entire CI step timeout.
    test.setTimeout(300_000)
    page.setDefaultTimeout(15_000)
    const email = `e2e-pantry-${process.env.GITHUB_RUN_ID ?? Date.now()}-${process.env.PLAYWRIGHT_WORKER_INDEX ?? 0}@example.com`
    const password = 'PantryTest-2026!'

    try {
      await resetAuthRateLimits()
      await signUpAndSignIn(page, email, password)

      // The empty pantry, before any stock exists.
      await openPantry(page)
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme })
        for (const viewport of VIEWPORTS) {
          await page.setViewportSize(viewport)
          await openPantry(page)
          await page.screenshot({ path: `${SHOTS}/${theme}-${viewport.width}x${viewport.height}-empty.png`, fullPage: true })
        }
      }

      await seedPantry(await householdIdFor(email))
      await page.reload()

      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme })
        for (const viewport of VIEWPORTS) {
          await page.setViewportSize(viewport)
          await openPantry(page)
          await page.screenshot({ path: `${SHOTS}/${theme}-${viewport.width}x${viewport.height}-spiz.png`, fullPage: true })
          await openPlace(page, 'Lednice')
          await page.screenshot({ path: `${SHOTS}/${theme}-${viewport.width}x${viewport.height}-lednice.png`, fullPage: true })
          await openPlace(page, 'Mrazák')
          await page.screenshot({ path: `${SHOTS}/${theme}-${viewport.width}x${viewport.height}-mrazak.png`, fullPage: true })
        }
      }

      // From here on the checks need the new grid; the "before" phase only captured the baseline.
      test.skip(PHASE === 'before', 'Functional checks need the new grid (PANTRY_AUDIT_PHASE=after).')

      // ---------------------------------------------------------------- 1. plus raises the amount
      await page.setViewportSize({ width: 390, height: 844 })
      await openPantry(page)
      await openPlace(page, 'Spíž')
      const bananas = pantryCard(page, 'Banány')
      await expect(bananas.getByTestId('pantry-quantity')).toHaveText('3')
      await bananas.getByRole('button', { name: /Přidat/ }).click()
      await expect(bananas.getByTestId('pantry-quantity')).toHaveText('4')

      // ---------------------------------------------------------------- 2. minus lowers the amount
      await bananas.getByRole('button', { name: /Ubrat/ }).click()
      await expect(bananas.getByTestId('pantry-quantity')).toHaveText('3')

      // ---------------------------------------------------------------- 3. the amount never goes below zero
      await openPlace(page, 'Lednice')
      const milk = pantryCard(page, 'Kefír')
      await expect(milk.getByTestId('pantry-quantity')).toHaveText('0')
      await expect(milk.getByRole('button', { name: /Ubrat/ })).toBeDisabled()

      // ---------------------------------------------------------------- 5. at zero the item reads "Nemám"
      await expect(milk.getByRole('button', { name: /Dostupnost/ })).toHaveText('Nemám')

      // ---------------------------------------------------------------- 6. availability can be restored by hand
      // Kefír is counted in kilos, so "I have it again" restores one step of its own unit — a
      // tenth of a kilo. The last known amount is nowhere in the data and is never invented.
      await milk.getByRole('button', { name: /Dostupnost/ }).click()
      await expect(milk.getByTestId('pantry-quantity')).toHaveText('0,1')
      await expect(milk.getByRole('button', { name: /Dostupnost/ })).toHaveText('Mám')

      // ---------------------------------------------------------------- 4. the change is really saved
      await page.reload()
      await openPantry(page)
      await openPlace(page, 'Spíž')
      await expect(pantryCard(page, 'Banány').getByTestId('pantry-quantity')).toHaveText('3')
      await openPlace(page, 'Lednice')
      await expect(pantryCard(page, 'Kefír').getByTestId('pantry-quantity')).toHaveText('0,1')

      // ---------------------------------------------------------------- 8. units and packaging are shown correctly
      const water = pantryCard(page, 'Minerálka')
      await expect(water).toContainText('3')
      await expect(water).toContainText('1,5 l')
      await openPlace(page, 'Spíž')
      const pasta = pantryCard(page, 'Těstoviny')
      await expect(pasta).toContainText('2')
      await expect(pasta).toContainText('500 g')

      // ---------------------------------------------------------------- 12. one item does not change another
      await openPlace(page, 'Lednice')
      const tomatoes = pantryCard(page, 'Rajčata')
      await expect(tomatoes.getByTestId('pantry-quantity')).toHaveText('4')
      await tomatoes.getByRole('button', { name: /Přidat/ }).click()
      await expect(tomatoes.getByTestId('pantry-quantity')).toHaveText('5')
      await expect(water.getByTestId('pantry-quantity')).toHaveText('3')
      await expect(milk.getByTestId('pantry-quantity')).toHaveText('0,1')

      // ---------------------------------------------------------------- 7. the detail opens and saves
      await tomatoes.getByRole('button', { name: /Otevřít detail/ }).click()
      const detail = page.getByRole('dialog')
      await expect(detail).toBeVisible()
      await detail.getByLabel(/Množství/).fill('7')
      await detail.getByLabel(/Množství/).press('Enter')
      await detail.getByRole('button', { name: /Uložit/ }).click()
      await expect(detail).toHaveCount(0)
      await expect(tomatoes.getByTestId('pantry-quantity')).toHaveText('7')

      // ---------------------------------------------------------------- 10. keyboard operation and accessible names
      await openPlace(page, 'Spíž')
      const bread = pantryCard(page, 'Chléb')
      const addButton = bread.getByRole('button', { name: /Přidat/ })
      await addButton.focus()
      await expect(addButton).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(bread.getByTestId('pantry-quantity')).toHaveText('2')

      // ---------------------------------------------------------------- 11. no horizontal overflow, no overlapping cells
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport)
        await openPantry(page)
        await openPlace(page, 'Lednice')
        expect(await hasHorizontalOverflow(page)).toBe(false)
        const overflow = await page.evaluate(() => {
          const cards = Array.from(document.querySelectorAll('[data-testid="pantry-card"]'))
          return cards.some((card) => {
            const rect = card.getBoundingClientRect()
            return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1
          })
        })
        expect(overflow).toBe(false)
      }

      // ---------------------------------------------------------------- 9. a failed save does not lose the change silently
      await page.setViewportSize({ width: 390, height: 844 })
      await openPantry(page)
      await openPlace(page, 'Lednice')
      const waterCard = pantryCard(page, 'Minerálka')
      await page.route('**/*', async (route) => {
        const request = route.request()
        if (request.method() === 'POST' && request.headers()['next-action']) {
          await route.abort('failed')
          return
        }
        await route.continue()
      })
      await waterCard.getByRole('button', { name: /Přidat/ }).click()
      await expect(page.getByText(/nepodařilo uložit/i).first()).toBeVisible()
      await expect(waterCard.getByTestId('pantry-quantity')).toHaveText('3')
      await page.unroute('**/*')
    } finally {
      await cleanupTestAccount(email)
    }
  })
})
