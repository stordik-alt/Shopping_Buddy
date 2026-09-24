-- One account belongs to exactly one household (docs/01_CURRENT_STATE.md: "one household per
-- account for now"), but nothing in the database enforced it. Two concurrent first-login renders
-- (or two concurrent invitation joins) could each insert a membership, leaving the user with
-- several households and `findFirst(userId)` returning an arbitrary one.
--
-- NULL user_id rows (household members who are profiles, not accounts) stay allowed: a Postgres
-- unique index treats NULLs as distinct. This will FAIL, deliberately, on a database that already
-- holds duplicate memberships — those need a human decision about which household is the real
-- one; nothing here deletes data. The new index is created before the old plain one is dropped, so
-- the hot per-request lookup by user_id is never without an index.
CREATE UNIQUE INDEX IF NOT EXISTS "household_members_user_id_unique" ON "household_members" ("user_id");--> statement-breakpoint
DROP INDEX IF EXISTS "household_members_user_id_idx";
