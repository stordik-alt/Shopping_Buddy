-- Product types added to lib/product-types.ts from the taxonomy seed proposal (docs/12), batches 2-7:
-- drinks, dairy, sweets, ice cream, sauces, spices, plant drinks, salami, seafood, sweet pastry,
-- and drugstore hygiene/cosmetics. Insert-only, so it is safe to run before the code that classifies by
-- them is live. No product is reassigned here: `scripts/apply-product-types-batch.ts` does that, after a
-- dry run on the real catalog.

INSERT INTO "product_types" ("key", "name", "category", "unit") VALUES
  ('limonady', 'Limonády a nealko nápoje', 'Potraviny', 'l'),
  ('dzusy', 'Džusy a ovocné šťávy', 'Potraviny', 'l'),
  ('sirupy', 'Sirupy', 'Potraviny', 'l'),
  ('jogurt-ochuceny', 'Ochucený jogurt', 'Potraviny', 'kg'),
  ('jogurt-pitny', 'Pitný jogurt', 'Potraviny', 'l'),
  ('skyr', 'Skyr', 'Potraviny', 'kg'),
  ('susenky-oplatky', 'Sušenky a oplatky', 'Potraviny', 'kg'),
  ('tycinky-sladke', 'Sladké tyčinky', 'Potraviny', 'kg'),
  ('bonbony-zvykaci', 'Bonbóny a žvýkačky', 'Potraviny', 'kg'),
  ('zmrzliny', 'Zmrzliny', 'Potraviny', 'l'),
  ('omacky-hotove', 'Hotové omáčky', 'Potraviny', 'kg'),
  ('nahrazky-mleka-rostlinne', 'Rostlinné nápoje', 'Potraviny', 'l'),
  ('koreni', 'Koření', 'Potraviny', 'kg'),
  ('salam', 'Salám', 'Potraviny', 'kg'),
  ('morske-plody', 'Mořské plody', 'Potraviny', 'kg'),
  ('pecivo-sladke', 'Sladké pečivo', 'Potraviny', 'ks'),
  ('damska-hygiena', 'Dámská hygiena', 'Drogerie', 'ks'),
  ('ustni-hygiena', 'Ústní hygiena', 'Drogerie', 'ks'),
  ('vlhcene-ubrousky', 'Vlhčené ubrousky', 'Drogerie', 'ks'),
  ('holeni', 'Holení', 'Drogerie', 'ks'),
  ('dekorativni-kosmetika', 'Dekorativní kosmetika', 'Drogerie', 'ks'),
  ('pece-o-plet', 'Péče o pleť', 'Drogerie', 'ks')
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "category" = EXCLUDED."category",
  "unit" = EXCLUDED."unit";
