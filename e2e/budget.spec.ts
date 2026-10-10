import { expect, test, type Page } from '@playwright/test'
import { Client } from 'pg'

// Rozpočet → Plánování end to end (docs/15_BUDGET_PERIODS.md): collapsed blocks on a phone, Kapsy moved
// only by hand, planning a period ahead, history → Výdaje and the closing sheet. Like smoke.spec.ts it
// signs up a throw-away account and needs DATABASE_URL to be exactly the isolated TEST_DATABASE_URL.

function testDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim()
  const testValue = process.env.TEST_DATABASE_URL?.trim()
  if (!value || !testValue || value !== testValue) throw new Error('E2E tests require DATABASE_URL to be exactly the isolated TEST_DATABASE_URL.')
  if (process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production') throw new Error('E2E tests must never run against a Vercel production deployment.')
  return value
}

const iso = (date: Date) => date.toISOString().slice(0, 10)
const now = new Date()
/** Day `d` of the month `offset` months from now, as an ISO date. */
const day = (offset: number, d: number) => iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, d)))

async function openPlanning(page: Page) {
  await page.goto('/?tab=rozpocet')
  await page.getByRole('button', { name: 'Plánování' }).first().click()
  await expect(page.getByText('Rozpočtové období:')).toBeVisible()
}

test.describe('Rozpočet → Plánování', () => {
  test('plans, saves to Kapsy by hand only, and closes nothing by itself', async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const client = new Client({ connectionString: testDatabaseUrl(), connectionTimeoutMillis: 5_000 })
    await client.connect()
    const email = `e2e-budget-${process.env.GITHUB_RUN_ID ?? Date.now()}@example.com`
    let userId: string | undefined
    const one = async (sql: string, args: unknown[] = []) => (await client.query(sql, args)).rows[0]
    const transferTotal = async (householdId: string) => Number((await one('SELECT coalesce(sum(amount), 0) AS s FROM pocket_transfers WHERE household_id = $1', [householdId])).s)

    try {
      await page.goto('/auth/sign-up')
      await page.getByLabel('Jméno').fill('E2E Rozpočet')
      await page.getByLabel('E-mail').fill(email)
      await page.getByLabel('Heslo').fill('SmokeTest-2026!')
      await page.getByRole('button', { name: 'Založit účet' }).click()
      await expect(page).toHaveURL(/\/$/)
      await expect(page.getByRole('heading', { name: 'Rodinný nákup', exact: true })).toBeVisible()

      userId = (await one('SELECT id FROM neon_auth."user" WHERE lower(email) = lower($1)', [email])).id
      const householdId = (await one('SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1', [userId])).household_id as string
      await client.query(`UPDATE households SET budget_period_type = 'calendar', budget_period_start_day = 1, monthly_budget = 40000 WHERE id = $1`, [householdId])
      // The month just ended (to be closed) and the running one.
      await client.query(`INSERT INTO incomes (household_id, amount, date, status, description) VALUES ($1, 38000, $2, 'actual', 'Výplata')`, [householdId, day(-1, 5)])
      await client.query(`INSERT INTO expenses (household_id, amount, date, category, note) VALUES ($1, 9000, $2, 'Potraviny', 'Velký nákup')`, [householdId, day(-1, 14)])
      await client.query(`INSERT INTO incomes (household_id, amount, date, status, description) VALUES ($1, 38000, $2, 'actual', 'Výplata')`, [householdId, day(0, 1)])

      // Blocks are collapsed on a phone, and nothing overflows.
      await openPlanning(page)
      await expect(page.getByText('Minulé období skončilo')).toBeVisible()
      const kapsy = page.getByRole('button', { name: /^Kapsy/ })
      await expect(kapsy).toHaveAttribute('aria-expanded', 'false')
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

      // A Kapsa with a free name, renamed later; neither moves money.
      await kapsy.click()
      await page.getByRole('button', { name: 'Přidat Kapsu' }).first().click()
      await page.getByLabel('Název').fill('Dovolená u moře')
      await page.getByRole('button', { name: 'Přidat Kapsu' }).last().click()
      await expect(page.getByText('Dovolená u moře').first()).toBeVisible()
      await page.getByRole('button', { name: 'Upravit Kapsu Dovolená u moře' }).click()
      await page.getByLabel('Název').fill('Rodinná dovolená')
      await page.getByRole('button', { name: 'Uložit' }).last().click()
      await expect(page.getByText('Rodinná dovolená').first()).toBeVisible()
      expect(await transferTotal(householdId)).toBe(0)

      // Money moves exactly as typed, and only then.
      await page.getByRole('button', { name: 'Uložit', exact: true }).first().click()
      await page.getByRole('dialog').getByRole('textbox').first().fill('1500')
      await page.getByRole('dialog').getByRole('button', { name: /Uložit|Potvrdit|Převést/ }).last().click()
      await expect.poll(() => transferTotal(householdId)).toBe(1500)
      await page.getByRole('button', { name: 'Vzít', exact: true }).first().click()
      await page.getByRole('dialog').getByRole('textbox').first().fill('500')
      await page.getByRole('dialog').getByRole('button', { name: /Vzít|Potvrdit|Převést/ }).last().click()
      await expect.poll(() => transferTotal(householdId)).toBe(1000)

      // A period ahead is only a plan: no actual balance, blocks open, planning moves no money.
      await page.getByRole('button', { name: 'Následující období' }).click()
      await expect(page.getByText('Plán budoucího období')).toBeVisible()
      await expect(page.getByText('Skutečný zůstatek')).toHaveCount(0)
      await expect(page.getByRole('button', { name: /^Převod do dalšího období/ })).toHaveAttribute('aria-expanded', 'true')
      await page.getByRole('button', { name: 'Přidat příjem' }).first().click()
      await page.getByRole('dialog').getByLabel(/Částka/).fill('38000')
      await page.getByRole('dialog').getByRole('button', { name: /Uložit|Přidat/ }).last().click()
      await expect.poll(async () => Number((await one(`SELECT count(*) AS c FROM incomes WHERE household_id = $1 AND status = 'planned'`, [householdId])).c)).toBe(1)
      await page.getByLabel('Plánovaný převod do dalšího období').fill('2000')
      await page.getByRole('button', { name: 'Uložit plán' }).click()
      await expect.poll(async () => (await client.query('SELECT amount FROM planned_carries WHERE household_id = $1', [householdId])).rows.map((row) => Number(row.amount))).toEqual([2000])
      expect(await transferTotal(householdId)).toBe(1000)

      // History → Výdaje opens the finished period's expenses.
      await page.getByRole('button', { name: 'Předchozí období' }).click()
      await page.getByRole('button', { name: /^Historie období/ }).click()
      await page.getByRole('button', { name: /^Zobrazit výdaje/ }).first().click()
      await expect(page.getByText(/9[\s ]000,00/).first()).toBeVisible()

      // The closing sheet only suggests; nothing is closed until the user confirms.
      await openPlanning(page)
      await page.getByRole('button', { name: 'Uzavřít období' }).first().click()
      await expect(page.getByText('Doporučení ANITKY')).toBeVisible()
      expect(Number((await one('SELECT count(*) AS c FROM period_closings WHERE household_id = $1', [householdId])).c)).toBe(0)
    } finally {
      if (userId) {
        await client.query('DELETE FROM households WHERE id IN (SELECT household_id FROM household_members WHERE user_id = $1)', [userId])
        await client.query('DELETE FROM neon_auth."user" WHERE id = $1', [userId])
      }
      await client.end()
    }
  })
})
