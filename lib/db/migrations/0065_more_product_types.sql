-- More product types (docs/12_PRODUCT_TYPES.md phase 5, 2026-10-04): kefír, cuketa, celer, čočka, med,
-- ocet. Additive and idempotent; the rows mirror lib/product-types.ts (a database test compares them).
-- Products get their type from `pnpm db:assign-product-types`, not here.
INSERT INTO "product_types" ("key", "name", "category", "unit") VALUES
  ('kefir', 'Kefír', 'Potraviny', 'kg'),
  ('cuketa', 'Cuketa', 'Potraviny', 'kg'),
  ('celer', 'Celer', 'Potraviny', 'kg'),
  ('cocka', 'Čočka', 'Potraviny', 'kg'),
  ('med', 'Med', 'Potraviny', 'kg'),
  ('ocet', 'Ocet', 'Potraviny', 'l')
ON CONFLICT ("key") DO NOTHING;
