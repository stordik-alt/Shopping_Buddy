-- Invitation e-mails are stored in lower case (docs/35_SECURITY_AUDIT.md, S10). The application lower-cases the
-- address when it writes an invitation, and the first-login join compares with `lower(user e-mail)`, so an
-- address stored in mixed case would silently never match. Fix any such old row, then let the database refuse one.
UPDATE "invitations" SET "email" = lower("email") WHERE "email" <> lower("email");--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_email_lowercase' AND conrelid = 'public.invitations'::regclass) THEN
    ALTER TABLE "invitations" ADD CONSTRAINT "invitations_email_lowercase" CHECK ("email" = lower("email"));
  END IF;
END $$;
