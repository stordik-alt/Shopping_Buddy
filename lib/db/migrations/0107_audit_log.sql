-- Who changed what in a household (docs/35_SECURITY_AUDIT.md, S18): budget and expense changes, members,
-- invitations, closing a period. Append-only from the application's side. `actor_member_id` is set to NULL
-- when that member's profile is deleted, so a departed person's name does not outlive their account; the
-- entry itself stays until the retention job removes it (lib/retention.ts). `detail` holds amounts and
-- field names only, never free text.
CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "actor_member_id" uuid REFERENCES "household_members"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "entity_id" uuid,
  "detail" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "audit_log_action_length" CHECK (char_length("action") BETWEEN 1 AND 64)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_household_created_idx" ON "audit_log" ("household_id", "created_at" DESC);
