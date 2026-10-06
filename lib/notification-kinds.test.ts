import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isNotificationKind, NOTIFICATION_KINDS, wantsNotification } from '@/lib/notification-kinds'

describe('notification kinds', () => {
  it('recognises only the fixed keys', () => {
    expect(isNotificationKind('budget')).toBe(true)
    expect(isNotificationKind('weekly_digest')).toBe(false)
    expect(isNotificationKind(null)).toBe(false)
  })

  it('shows everything except switched-off kinds, and always a row without a kind', () => {
    const off = new Set(['shopping_reminder'])
    expect(wantsNotification('shopping_reminder', off)).toBe(false)
    expect(wantsNotification('budget', off)).toBe(true)
    expect(wantsNotification(null, off)).toBe(true)
  })

  it('matches the database check constraint (last set by migration 0072)', () => {
    const sql = readFileSync('lib/db/migrations/0072_new_deals_notifications.sql', 'utf8')
    for (const { key } of NOTIFICATION_KINDS) expect(sql).toContain(`'${key}'`)
  })
})
