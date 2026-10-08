-- Refine common manual product types: split laundry detergent and add food mushrooms.
-- Existing generic laundry assignments are reclassified where the product name is explicit;
-- ambiguous capsule/tablet/generic entries become untyped and can be selected again explicitly.

INSERT INTO "product_types" ("key", "name", "category", "unit") VALUES
  ('praci-gel', 'Prací gel', 'Drogerie', 'l'),
  ('praci-prasek', 'Prací prášek', 'Drogerie', 'kg'),
  ('avivaz', 'Aviváž', 'Drogerie', 'l'),
  ('houby', 'Houby', 'Potraviny', 'kg'),
  ('pomazanky', 'Pomazánky', 'Potraviny', 'kg'),
  ('mrazena-zelenina', 'Mražená zelenina', 'Potraviny', 'kg'),
  ('cerealie', 'Cereálie', 'Potraviny', 'kg'),
  ('ovesne-vlocky', 'Ovesné vločky', 'Potraviny', 'kg'),
  ('kecup', 'Kečup', 'Potraviny', 'l'),
  ('horcice', 'Hořčice', 'Potraviny', 'kg'),
  ('majoneza', 'Majonéza', 'Potraviny', 'kg'),
  ('dzem', 'Džem a marmeláda', 'Potraviny', 'kg'),
  ('kakao', 'Kakao', 'Potraviny', 'kg'),
  ('orechy', 'Ořechy', 'Potraviny', 'kg'),
  ('seminka', 'Semínka', 'Potraviny', 'kg'),
  ('klobasy', 'Klobásy', 'Potraviny', 'kg'),
  ('pastika', 'Paštika', 'Potraviny', 'kg'),
  ('mrazene-ovoce', 'Mražené ovoce', 'Potraviny', 'kg'),
  ('hranolky', 'Hranolky', 'Potraviny', 'kg'),
  ('pizza-mrazena', 'Pizza mražená', 'Potraviny', 'ks'),
  ('sul-do-mycky', 'Sůl do myčky', 'Drogerie', 'kg'),
  ('lestidlo-do-mycky', 'Leštidlo do myčky', 'Drogerie', 'l'),
  ('cistic-wc', 'Čistič WC', 'Drogerie', 'l'),
  ('cistic-koupelny', 'Čistič koupelny', 'Drogerie', 'l'),
  ('cistic-kuchyne', 'Čistič kuchyně', 'Drogerie', 'l'),
  ('univerzalni-cistic', 'Univerzální čistič', 'Drogerie', 'l'),
  ('cistic-oken', 'Čistič oken', 'Drogerie', 'l'),
  ('odstranovac-skvrn', 'Odstraňovač skvrn', 'Drogerie', 'l'),
  ('dezinfekce', 'Dezinfekce', 'Drogerie', 'l'),
  ('houbicky-na-nadobi', 'Houbičky na nádobí', 'Drogerie', 'ks'),
  ('uterky', 'Utěrky', 'Domácnost', 'ks'),
  ('pytle-na-odpadky', 'Pytle na odpadky', 'Domácnost', 'ks'),
  ('alobal', 'Alobal', 'Domácnost', 'ks'),
  ('potravinova-folie', 'Potravinová fólie', 'Domácnost', 'ks'),
  ('pecici-papir', 'Pečicí papír', 'Domácnost', 'ks'),
  ('papir-tasky', 'Papírové kapesníky', 'Drogerie', 'ks'),
  ('vlhcene-ubrousky-detske', 'Dětské vlhčené ubrousky', 'Děti', 'ks'),
  ('detsky-sampon', 'Dětský šampon', 'Děti', 'l'),
  ('detsky-sprchovy-gel', 'Dětský sprchový gel', 'Děti', 'l'),
  ('detske-mydlo', 'Dětské mýdlo', 'Děti', 'ks'),
  ('detska-kosmetika', 'Dětská kosmetika', 'Děti', 'ks'),
  ('detske-prikrmy', 'Dětské příkrmy', 'Děti', 'ks'),
  ('detske-kapsicky', 'Dětské kapsičky', 'Děti', 'ks'),
  ('detske-napoje', 'Dětské nápoje', 'Děti', 'l')
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "category" = EXCLUDED."category",
  "unit" = EXCLUDED."unit";

UPDATE "products" p
SET
  "product_type_id" = CASE
    WHEN lower(p."name") LIKE '%aviváž%' THEN (SELECT id FROM "product_types" WHERE key = 'avivaz')
    WHEN lower(p."name") LIKE '%prací gel%' OR lower(p."name") LIKE '%gel na praní%' THEN (SELECT id FROM "product_types" WHERE key = 'praci-gel')
    WHEN lower(p."name") LIKE '%prací prášek%' OR lower(p."name") LIKE '%prášek na praní%' THEN (SELECT id FROM "product_types" WHERE key = 'praci-prasek')
    ELSE NULL
  END,
  "product_type_source" = CASE
    WHEN lower(p."name") LIKE '%aviváž%'
      OR lower(p."name") LIKE '%prací gel%'
      OR lower(p."name") LIKE '%gel na praní%'
      OR lower(p."name") LIKE '%prací prášek%'
      OR lower(p."name") LIKE '%prášek na praní%'
    THEN 'rule'
    ELSE NULL
  END
WHERE p."product_type_id" = (SELECT id FROM "product_types" WHERE key = 'praci-prostredek');

DELETE FROM "product_types" WHERE "key" = 'praci-prostredek';
