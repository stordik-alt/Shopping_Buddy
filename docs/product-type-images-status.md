# Product-type image rollout status

**Snapshot: 2026-10-23**

## How product images work

Each stable product type can have one representative photo. Its R2 key is stored in
`product_types.image_ref`; photos are shared by every product assigned to that type, rather than
stored per SKU. `lib/product-images.ts` normalizes an image to WebP, resizes it to at most 1600 px,
and stores it under `product-type-images/{typeKey}/{sha256}.webp`. The authenticated
`/api/product-types/images/[key]` route serves the R2 object.

When a type has no photo, the pantry uses its local SVG illustration. The type-to-visual map covers
the whole product-type taxonomy, so a missing photo does not leave a product without a picture.

## Delivered

- [PR #569](https://github.com/stordik-alt/Shopping_Buddy/pull/569) added the product-type image
  reference and image storage foundation.
- [PR #570](https://github.com/stordik-alt/Shopping_Buddy/pull/570) connected product-type photos
  to the pantry and served them through the private image route.
- [PR #571](https://github.com/stordik-alt/Shopping_Buddy/pull/571) documented the photo-first,
  illustration-fallback behavior.
- [PR #572](https://github.com/stordik-alt/Shopping_Buddy/pull/572) improved fallback matching;
  [PR #573](https://github.com/stordik-alt/Shopping_Buddy/pull/573) and follow-on illustration PRs
  through [#589](https://github.com/stordik-alt/Shopping_Buddy/pull/589) expanded the SVG library
  across food, drinks, household products, personal care, baby products, pets and clothing. The
  library grew from 54 shapes after #571 to 179 shapes after #589: 125 additional drawings.
- All 462 product types currently in the database have a type-specific entry in
  `lib/product-visuals.ts`; none are missing a visual mapping.
- `scripts/populate-product-images.ts` can search for candidates, defaults to dry-run, and only
  writes R2 objects and database references with `--apply`.

## Coverage snapshot

| Measure | Current | Remaining |
| --- | ---: | ---: |
| Product types in the configured Neon database | 462 | — |
| Types with an SVG visual mapping | 462 / 462 (100%) | 0 unmapped |
| SVG illustration shapes in the library | 179 | No fixed target; review for mismatches |
| Product types with an R2 image reference | 7 / 462 (1.5%) | 455 without a reference (98.5%) |

The R2 count is a read-only count of `product_types.image_ref` values in the configured Neon
database on the snapshot date. It checks for references under `product-type-images/`; it does not
read the bucket or confirm that each referenced object is reachable. “455 remaining” therefore
means 455 product types have no R2 reference recorded. It is the remaining count if the goal is a
photo for every product type; local illustrations already cover all 462 types.

## Remaining work

### Product photos in R2

1. Decide whether every type needs a photo or whether to prioritize common types and leave the
   illustration fallback for less useful or hard-to-source cases. The current maximum is 455 more
   references, not a commitment to 455 imports.
2. Review candidate matches and usage rights before importing. The population script can find
   Open Food Facts candidates, but those images are generally CC BY-SA and the app does not yet
   store or show attribution, so it does not import them. Wikimedia Commons files are imported
   only when license metadata is present and says attribution is not required; other files are
   skipped.
3. Populate approved images in reviewable batches, then verify each reference resolves through the
   image route and the photo represents the product type. The current coverage number does not
   include this object-by-object verification.

### Illustration quality

The remaining illustration work is a visual review, not one new drawing per product type. Several
types intentionally share a shape when they have the same recognizable form or packaging. The most
reused shapes are:

| Shape | Product types using it |
| --- | ---: |
| `packet` | 36 |
| `bottle` | 31 |
| `tub` | 21 |
| `jar` | 17 |
| `cluster` | 14 |
| `wedge` | 13 |
| `bowl` | 11 |
| `cup` / `can` | 10 each |
| `glass` | 9 |

These counts are review candidates, not a list of incorrect illustrations. Packaging shapes such as
cartons, cans and jars are often the clearest fallback. Add a dedicated shape when the shared
silhouette makes a product family meaningfully harder to recognize.
