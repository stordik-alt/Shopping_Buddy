-- Purpose: hand up identity to Neon Auth (Managed Better Auth) instead of the
-- unused local `users` placeholder table, per docs/03_DATABASE.md's instruction
-- to inspect `neon_auth` before building a second authentication system.
--
-- `household_members.user_id` previously pointed at the two demo rows seeded
-- into `public.users` (Lucie/Petr fixtures). Those rows were never linked to a
-- real login, so they are cleared rather than migrated — no real account data
-- is lost. All other household data (the household row itself, its shopping
-- lists, expenses, notifications, purchase history) is untouched.

UPDATE household_members SET user_id = NULL;

ALTER TABLE household_members DROP CONSTRAINT IF EXISTS household_members_user_id_users_id_fk;

DROP TABLE IF EXISTS users;

-- Neon manages the neon_auth schema directly; this constraint only references
-- neon_auth.user(id), it does not alter that schema.
ALTER TABLE household_members
  ADD CONSTRAINT household_members_user_id_neon_auth_user_id_fk
  FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE SET NULL;
