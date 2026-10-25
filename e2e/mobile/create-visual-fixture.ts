import { hashPassword } from 'better-auth/crypto'
import { Client } from 'pg'

const databaseUrl = process.env.DATABASE_URL?.trim()
const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim()
const email = process.env.MOBILE_VISUAL_EMAIL?.trim()
const password = process.env.MOBILE_VISUAL_PASSWORD

if (!databaseUrl || !testDatabaseUrl || databaseUrl !== testDatabaseUrl) {
  throw new Error('Mobile visual fixtures require DATABASE_URL to be exactly the isolated TEST_DATABASE_URL.')
}
if (process.env.NEXT_PUBLIC_LOCAL_DATABASE !== '1' || !email || !password) {
  throw new Error('Mobile visual fixtures require local auth and explicit disposable account credentials.')
}

async function main() {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000, query_timeout: 15_000 })
  const userId = crypto.randomUUID()
  const passwordHash = await hashPassword(password!)

  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      'INSERT INTO neon_auth."user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)',
      [userId, 'Mobile Visual', email],
    )
    await client.query(
      'INSERT INTO neon_auth.account ("accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, now(), now())',
      [userId, 'credential', userId, passwordHash],
    )
    const household = await client.query<{ id: string }>(
      'INSERT INTO households (name, monthly_budget, currency) VALUES ($1, 12500, $2) RETURNING id',
      ['Vizuální domácnost', 'CZK'],
    )
    const householdId = household.rows[0].id
    await client.query('INSERT INTO household_members (household_id, user_id, name, role) VALUES ($1, $2, $3, $4)', [householdId, userId, 'Mobile Visual', 'owner'])
    await client.query('INSERT INTO preferences (household_id) VALUES ($1)', [householdId])
    const list = await client.query<{ id: string }>(
      'INSERT INTO shopping_lists (household_id, name) VALUES ($1, $2) RETURNING id',
      [householdId, 'Hlavní seznam'],
    )
    for (const [name, quantity, unit, category] of [
      ['Mléko', 2, 'ks', 'Potraviny'],
      ['Chléb', 1, 'ks', 'Potraviny'],
      ['Jablka', 1, 'kg', 'Potraviny'],
    ] as const) {
      await client.query(
        'INSERT INTO shopping_list_items (list_id, name, quantity, unit, category) VALUES ($1, $2, $3, $4, $5)',
        [list.rows[0].id, name, quantity, unit, category],
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
    process.stdout.write(`Created disposable mobile visual account ${email}.\n`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})
