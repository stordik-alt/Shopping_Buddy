# 14 — Notification preferences (which notifications a member wants)

Status: implemented 2026-10-05 (concept owner-approved the same day ("Přidat možnost povolení upozornění, uživatel musí mít na výběr, která
upozornění chce a která ne"). Feature A of the post-redesign plan (A → B → C → D → E, see docs/13_UI_REDESIGN.md)).

## Today (verified in code)
- Every notification is created by `createHouseholdNotification` (`lib/notify.ts`): one row in `notifications` for the
  whole household (the bell panel reads it) and, with Web Push configured, a push to every member's subscribed
  devices (`pushToHousehold`, `lib/push/deliver.ts`), except the member who caused it.
- Seven places raise one, each a distinct kind of message:
  | Kind (key) | Where | Title (example) |
  |---|---|---|
  | `budget` | `lib/db/budget-notify.ts` (overall budget) | Blížíte se limitu rozpočtu / Rozpočet byl překročen |
  | `category_limit` | `lib/db/budget-notify.ts` (category limits) | Potraviny: 80 % limitu |
  | `deal_on_list` | `app/actions/shopping.ts` (item added) | Skvělá cena na vašem seznamu |
  | `shopping_reminder` | `app/api/cron/shopping-reminders` (daily) | Nezapomeňte na nákup |
  | `pantry_check` | `app/api/cron/pantry-checkin` (weekly) | Kontrola zásob |
  | `recurring_payment` | `lib/db/recurring-reminders.ts` | Dnes je splatná platba |
  | `household` | `lib/db/queries.ts` (invitation accepted) | Nový člen domácnosti |
- Nothing lets a member choose; Profil ▸ Upozornění has a "Týdenní souhrn" switch that is local state only (saved
  nowhere, changes nothing).

## Rules
1. Preferences are **per member** (a signed-in user in a household), not per household: one person may want the
   daily reminder, another not.
2. **Default on.** A member gets every kind unless they switched it off; only "off" is stored.
3. A kind switched off is neither **pushed** to that member's devices nor **shown** in that member's bell panel.
   Other members are unaffected.
4. The household's notification row is still written once (it stays shared); hiding is per reader. Rows written before
   this feature have no kind and are shown to everyone.
5. The server decides: the member comes from the session; a kind outside the fixed list is refused.
6. "Push on this device" stays a separate switch (`PushToggle`): the kinds say *what*, the device switch says *whether
   this phone* receives pushes at all.

## Data
- `notifications.kind text NULL` — the kind of a new row (one of the keys above); `NULL` for older rows.
- `member_notification_settings (member_id uuid → household_members ON DELETE CASCADE, kind text, enabled boolean,
  updated_at)`, primary key `(member_id, kind)`, check that `kind` is one of the keys. Absent row = enabled.
- Migration `0066_notification_preferences.sql`, additive (new nullable column, new table); the running code ignores
  both, so it is safe to apply before the new code is live (CLAUDE.md section 7).

## Code
- `lib/notification-kinds.ts` — the kinds with their Czech label and description, `isNotificationKind`, and the pure
  filter used by the bell panel.
- `createHouseholdNotification(db, householdId, content, { kind, … })` stores the kind and passes it to
  `pushToHousehold`, which skips subscriptions of members who switched it off.
- `getHouseholdData` returns the member's switched-off kinds (`notificationsOff`); the app shell leaves those kinds out
  of the bell panel and the unread count — one filter for loaded rows and for a notification an action returns straight
  to the member who caused it.
- `setNotificationPreferenceAction(kind, enabled)` (`app/actions/notifications.ts`).
- UI: Profil ▸ Upozornění lists the kinds as switches (label + one-line description) and the device's push switch; the
  dead "Týdenní souhrn" switch is removed.

## Not in scope
- Quiet hours, digests, e-mail. A kind of notification that does not exist yet (e.g. "deals on your preferred
  products", feature C) gets its own key when it is built.
