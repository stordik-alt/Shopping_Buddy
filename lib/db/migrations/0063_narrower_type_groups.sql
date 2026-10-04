-- Narrower groups (owner decision 2026-10-04, product types phase 2): "Kuřecí maso" is the chicken
-- meat itself — offal and soup parts only when a list item names them — and "Sýr" is everyday cheese
-- (eidam, gouda, mozzarella, balkánský). The types themselves stay; only their group membership goes,
-- matching lib/product-types.ts's PRODUCT_TYPE_GROUPS (a database test compares the two).
DELETE FROM "product_type_group_members" m
USING "product_type_groups" g, "product_types" t
WHERE m."group_id" = g."id" AND m."type_id" = t."id"
  AND ((g."key" = 'kureci-maso' AND t."key" IN ('kureci-vnitrnosti', 'kureci-na-polevku'))
    OR (g."key" = 'syr' AND t."key" IN ('hermelin', 'parmazan', 'taveny-syr', 'niva', 'cottage')));
