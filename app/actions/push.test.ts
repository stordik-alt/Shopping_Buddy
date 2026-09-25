import { eq, inArray, sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { pushToHousehold } from '@/lib/push/deliver'
import { base64UrlEncode, generateVapidKeys, type sendWebPush } from '@/lib/push/web-push'

// Integration coverage for push subscriptions (app/actions/push.ts, lib/push/deliver.ts) against the
// test database. The session lookup is mocked; validation, scoping and every write are real. No
// request reaches a real push service: delivery goes through an injected `send`.
let session = { userId: '', memberId: '', householdId: '' }
vi.mock('@/lib/auth/authorize', () => ({
  requireHousehold: () => Promise.resolve({ ...session, userEmail: 'test@example.com', role: 'owner' }),
}))

import { removePushSubscriptionAction, savePushSubscriptionAction } from '@/app/actions/push'

const db = getDb()
const createdHouseholdIds: string[] = []
const createdUserIds: string[] = []
const p256dh = base64UrlEncode(new Uint8Array([4, ...new Array(64).fill(7)]))
const auth = base64UrlEncode(new Uint8Array(16).fill(9))
const subscription = (id: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/test-${id}`, keys: { p256dh, auth } })

type Member = { userId: string; memberId: string; householdId: string }
let alice: Member
let bob: Member
let stranger: Member

/** A real Neon Auth user: household_members.user_id references neon_auth."user". */
async function createAuthUser(name: string): Promise<string> {
  const result = await db.execute<{ id: string }>(
    sql`insert into neon_auth."user" (name, email, "emailVerified") values (${name}, ${`push-test-${crypto.randomUUID()}@example.com`}, false) returning id`,
  )
  createdUserIds.push(result.rows[0].id)
  return result.rows[0].id
}

async function createMember(householdId: string, name: string): Promise<Member> {
  const userId = await createAuthUser(name)
  const [member] = await db.insert(schema.householdMembers).values({ householdId, userId, name, role: 'member' }).returning()
  return { userId, memberId: member.id, householdId }
}

beforeEach(async () => {
  const keys = await generateVapidKeys()
  process.env.VAPID_PUBLIC_KEY = keys.publicKey
  process.env.VAPID_PRIVATE_KEY = keys.privateKey
  process.env.VAPID_SUBJECT = 'mailto:test@example.com'
  const [household] = await db.insert(schema.households).values({ name: '__test_household_push__' }).returning()
  const [otherHousehold] = await db.insert(schema.households).values({ name: '__test_household_push_other__' }).returning()
  createdHouseholdIds.push(household.id, otherHousehold.id)
  alice = await createMember(household.id, 'Alice')
  bob = await createMember(household.id, 'Bob')
  stranger = await createMember(otherHousehold.id, 'Cizí')
  session = alice
})

afterEach(() => {
  for (const name of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) delete process.env[name]
})

afterAll(async () => {
  // Members and push subscriptions go with their household (ON DELETE CASCADE).
  if (createdHouseholdIds.length > 0) await db.delete(schema.households).where(inArray(schema.households.id, createdHouseholdIds))
  if (createdUserIds.length > 0) await db.execute(sql`delete from neon_auth."user" where id in (${sql.join(createdUserIds.map((id) => sql`${id}::uuid`), sql`, `)})`)
})

const rowsFor = (householdId: string) => db.query.pushSubscriptions.findMany({ where: eq(schema.pushSubscriptions.householdId, householdId) })

describe('savePushSubscriptionAction', () => {
  it('stores the device for the signed-in member and household, once per endpoint', async () => {
    const id = crypto.randomUUID()
    expect(await savePushSubscriptionAction(subscription(id))).toEqual({ ok: true })
    expect(await savePushSubscriptionAction(subscription(id))).toEqual({ ok: true })
    const rows = await rowsFor(alice.householdId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ memberId: alice.memberId, endpoint: subscription(id).endpoint, p256dh, auth })
  })

  it('moves a device to whoever signs in on it next', async () => {
    const id = crypto.randomUUID()
    await savePushSubscriptionAction(subscription(id))
    session = stranger
    await savePushSubscriptionAction(subscription(id))
    expect(await rowsFor(alice.householdId)).toHaveLength(0)
    expect((await rowsFor(stranger.householdId))[0]).toMatchObject({ memberId: stranger.memberId })
  })

  it('refuses an endpoint outside the known push services and does nothing when push is off', async () => {
    const result = await savePushSubscriptionAction({ endpoint: 'https://169.254.169.254/latest', keys: { p256dh, auth } })
    expect(result.ok).toBe(false)
    delete process.env.VAPID_PUBLIC_KEY
    delete process.env.VAPID_PRIVATE_KEY
    delete process.env.VAPID_SUBJECT
    expect((await savePushSubscriptionAction(subscription(crypto.randomUUID()))).ok).toBe(false)
    expect(await rowsFor(alice.householdId)).toHaveLength(0)
  })
})

describe('removePushSubscriptionAction', () => {
  it("removes only the signed-in member's own device", async () => {
    const id = crypto.randomUUID()
    session = bob
    await savePushSubscriptionAction(subscription(id))
    session = alice
    await removePushSubscriptionAction(subscription(id).endpoint) // not Alice's device
    expect(await rowsFor(alice.householdId)).toHaveLength(1)
    session = bob
    await removePushSubscriptionAction(subscription(id).endpoint)
    expect(await rowsFor(alice.householdId)).toHaveLength(0)
  })
})

describe('pushToHousehold', () => {
  it("sends to the household's devices except the actor's, and deletes the ones reported gone", async () => {
    const aliceDevice = subscription(`alice-${crypto.randomUUID()}`)
    const bobPhone = subscription(`bob-${crypto.randomUUID()}`)
    const bobOldTablet = subscription(`bob-old-${crypto.randomUUID()}`)
    const strangerDevice = subscription(`x-${crypto.randomUUID()}`)
    session = alice
    await savePushSubscriptionAction(aliceDevice)
    session = bob
    await savePushSubscriptionAction(bobPhone)
    await savePushSubscriptionAction(bobOldTablet)
    session = stranger
    await savePushSubscriptionAction(strangerDevice)

    const send = vi.fn<typeof sendWebPush>(async (target) =>
      target.endpoint === bobOldTablet.endpoint ? { ok: false, status: 410, gone: true, detail: '' } : { ok: true, status: 201 },
    )
    const report = await pushToHousehold(alice.householdId, { title: 'Rozpočet', body: '80 %', url: '/?tab=rozpocet' }, { excludeUserId: alice.userId, send })

    expect(send.mock.calls.map(([target]) => target.endpoint).sort()).toEqual([bobOldTablet.endpoint, bobPhone.endpoint].sort())
    expect(JSON.parse(send.mock.calls[0][1])).toEqual({ title: 'Rozpočet', body: '80 %', url: '/?tab=rozpocet' })
    expect(report).toEqual({ sent: 1, removed: 1, failed: 0 })
    const remaining = await rowsFor(alice.householdId)
    expect(remaining.map((row) => row.endpoint).sort()).toEqual([aliceDevice.endpoint, bobPhone.endpoint].sort())
    expect(remaining.find((row) => row.endpoint === bobPhone.endpoint)?.lastSuccessAt).toBeInstanceOf(Date)
  })

  it('keeps a device after a temporary failure and reports it', async () => {
    session = bob
    await savePushSubscriptionAction(subscription(crypto.randomUUID()))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const send = vi.fn<typeof sendWebPush>(async () => ({ ok: false, status: 503, gone: false, detail: 'try later' }))
    const report = await pushToHousehold(alice.householdId, { title: 'x', body: 'y', url: '/' }, { onlyUserId: bob.userId, send })
    expect(report).toEqual({ sent: 0, removed: 0, failed: 1 })
    expect(await rowsFor(alice.householdId)).toHaveLength(1)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('"event":"push_failed"'))
    error.mockRestore()
  })
})
