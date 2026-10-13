-- product_category_changes.decided_by and product_subcategory_changes.decided_by hold the id of the administrator
-- (neon_auth."user") who approved or rejected a change, but nothing tied them to that account (docs/35_SECURITY_AUDIT.md,
-- L8): deleting the account left an id that points at nothing. Same treatment as household_members.user_id
-- (migration 0103): ids of accounts that no longer exist are cleared first, then the key is added with
-- ON DELETE SET NULL, so the decision stays on record when the administrator's account is deleted.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.product_category_changes'::regclass AND conname = 'product_category_changes_decided_by_neon_auth_user_id_fk') THEN
    UPDATE product_category_changes SET decided_by = NULL
      WHERE decided_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM neon_auth."user" u WHERE u.id = product_category_changes.decided_by);
    ALTER TABLE product_category_changes
      ADD CONSTRAINT product_category_changes_decided_by_neon_auth_user_id_fk
      FOREIGN KEY (decided_by) REFERENCES neon_auth."user"(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.product_subcategory_changes'::regclass AND conname = 'product_subcategory_changes_decided_by_neon_auth_user_id_fk') THEN
    UPDATE product_subcategory_changes SET decided_by = NULL
      WHERE decided_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM neon_auth."user" u WHERE u.id = product_subcategory_changes.decided_by);
    ALTER TABLE product_subcategory_changes
      ADD CONSTRAINT product_subcategory_changes_decided_by_neon_auth_user_id_fk
      FOREIGN KEY (decided_by) REFERENCES neon_auth."user"(id) ON DELETE SET NULL;
  END IF;
END
$$;
--> statement-breakpoint
