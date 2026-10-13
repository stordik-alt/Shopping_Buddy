-- household_members.user_id points at the login account (neon_auth."user"). Neon Auth owns that table, so
-- Drizzle does not model the link, and it was only ever created by a hand-written migration that is no
-- longer in this directory: a database built from these migrations alone (a new Neon branch, local or CI
-- PostgreSQL) had no such key, so deleting an account left its membership pointing at nothing.
-- Databases that already have the key (production and the Neon branches made from it) are left as they are.
-- Where it is missing, memberships of accounts that no longer exist are detached first (exactly what the
-- key's ON DELETE SET NULL does), then the key is added.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.household_members'::regclass AND conname = 'household_members_user_id_neon_auth_user_id_fk'
  ) THEN
    UPDATE household_members SET user_id = NULL
      WHERE user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM neon_auth."user" u WHERE u.id = household_members.user_id);
    ALTER TABLE household_members
      ADD CONSTRAINT household_members_user_id_neon_auth_user_id_fk
      FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE SET NULL;
  END IF;
END
$$;
--> statement-breakpoint
