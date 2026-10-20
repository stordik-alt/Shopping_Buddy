-- Daily reminder for a regular income expected today, with per-member notification preferences.
ALTER TABLE "recurring_incomes" ADD COLUMN IF NOT EXISTS "reminded_due_date" date;
--> statement-breakpoint
ALTER TABLE "member_notification_settings" DROP CONSTRAINT IF EXISTS "member_notification_settings_kind_check";
--> statement-breakpoint
ALTER TABLE "member_notification_settings" ADD CONSTRAINT "member_notification_settings_kind_check"
  CHECK ("kind" IN ('budget', 'category_limit', 'deal_on_list', 'new_deals', 'shopping_reminder', 'pantry_check', 'recurring_payment', 'recurring_income', 'household'));
