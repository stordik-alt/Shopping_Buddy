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

  it('matches the database check constraint of migration 0066', () => {
    const sql = readFileSync('lib/db/migrations/0066_notification_preferences.sql', 'utf8')
    for (const { key } of NOTIFICATION_KINDS) expect(sql).toContain(`'${key}'`)
  })
})
