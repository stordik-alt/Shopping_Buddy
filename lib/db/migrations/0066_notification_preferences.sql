-- Notification preferences (docs/14_NOTIFICATION_PREFERENCES.md): which kinds of notification each
-- member wants. Additive and safe before the new code is live: the running code ignores both.

-- The kind of a notification row; NULL for rows written before kinds existed (shown to everyone).
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "kind" text;

-- Only switched-off kinds are stored; a missing row means the member gets that kind.
CREATE TABLE IF NOT EXISTS "member_notification_settings" (
  "member_id" uuid NOT NULL REFERENCES "household_members"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("member_id", "kind"),
  CONSTRAINT "member_notification_settings_kind_check" CHECK ("kind" IN ('budget', 'category_limit', 'deal_on_list', 'shopping_reminder', 'pantry_check', 'recurring_payment', 'household'))
);
