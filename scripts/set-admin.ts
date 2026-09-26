import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { describeError } from '@/lib/errors'

// Makes an existing account an app administrator (`app_admins`), or with --remove takes it away.
// The account must already have signed up. There is deliberately no way to do this from inside the
// app: the role comes from whoever runs this against the database in .env.local.
//   pnpm db:set-admin someone@example.com
//   pnpm db:set-admin someone@example.com --remove
async function main() {
  const email = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
  if (!email) throw new Error('Usage: pnpm db:set-admin <email> [--remove]')
  const remove = process.argv.includes('--remove')
  const db = getDb()

  const found = await db.execute<{ id: string }>(sql`select id from neon_auth."user" where lower(email) = lower(${email})`)
  if (found.rows.length === 0) throw new Error(`No account with the e-mail ${email} — it has to sign up first.`)
  const userId = found.rows[0].id

  if (remove) {
    await db.delete(schema.appAdmins).where(eq(schema.appAdmins.userId, userId))
    console.log(`${email} is no longer an administrator.`)
    return
  }
  await db.insert(schema.appAdmins).values({ userId }).onConflictDoNothing()
  console.log(`${email} is an administrator.`)
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(describeError(err))
  process.exit(1)
})
