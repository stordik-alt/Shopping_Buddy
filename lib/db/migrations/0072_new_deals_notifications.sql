-- New flyer notifications (docs/21_NEW_FLYER_NOTIFICATIONS.md). Additive and safe before the new code is
-- live: the running code never writes the new kind and ignores the new table.

-- One row per chain and flyer start date that has been announced, written before the notifications go
-- out, so overlapping cron runs never announce a flyer twice.
CREATE TABLE IF NOT EXISTS "deal_announcements" (
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "valid_from" date NOT NULL,
  "deal_count" integer NOT NULL CHECK ("deal_count" >= 0),
  "announced_at" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("store_id", "valid_from")
);

-- Members can switch the new kind off like any other.
ALTER TABLE "member_notification_settings" DROP CONSTRAINT IF EXISTS "member_notification_settings_kind_check";
ALTER TABLE "member_notification_settings" ADD CONSTRAINT "member_notification_settings_kind_check"
  CHECK ("kind" IN ('budget', 'category_limit', 'deal_on_list', 'new_deals', 'shopping_reminder', 'pantry_check', 'recurring_payment', 'household'));
