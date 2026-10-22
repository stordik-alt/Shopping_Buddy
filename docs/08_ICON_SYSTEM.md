# ANITKA Icon System

## Source of truth

The visual reference is the Figma file ANITKA — Icon System. The implementation uses `lucide-react` and keeps one
meaning per icon across the application. The navigation icons are defined once, in `tabIcons`
(`components/shared/nav-item.tsx`). The app icon (`public/brand/`) is not part of this system and does not change.

## Primary navigation

| Area | Icon |
| --- | --- |
| Domů | House |
| Akce | Tag |
| Nákup | ShoppingCart |
| Zásoby | Package |
| Obchody | Store |
| Recepty | CookingPot |
| Rozpočet | WalletCards |
| AI | Bot |
| Profil | Users |

## Zásoby

Fixed locations: Spíž — Wheat, Lednice — Refrigerator, Mrazák — Snowflake, Domácnost — House, Lékárnička —
BriefcaseMedical, Drogérka — SprayCan. A household's own place uses one icon per area (`AREA_ICON` in
`components/shopping/pantry.tsx`).

## Product visuals

A product in a cell is not named by an icon from the set above. Product pictures are a separate, reusable
system: `lib/product-visuals.ts` (the mapping) and `components/ui/product-visual.tsx` (the drawing).

- **One central map.** `productVisualFor({ productTypeKey, subcategory, category })` returns a
  `ProductVisual` — a shape and a tint, never a brand. Every product type key in `lib/product-types.ts`
  has its own entry (462 of them), so two products of the same family (milk and kefir, chicken and pork)
  are not the same picture. Types are not mapped to pictures by brand, and there is no hand-written map
  of individual SKUs.
- **Fallback chain.** A photograph of the specific product wins; there is none today — the database
  stores no product images (`products` has no image column), so the schema was deliberately not extended
  for a visual change and `ProductVisual` keeps `imageUrl` as an optional input for when a source exists.
  Then: the product type, then the subcategory, then the category, then a neutral fallback. An unknown
  key always ends up somewhere — it never throws.
- **Shapes and tints.** 51 shapes (round, oval, bottle, can, jar, carton, loaf, drumstick, fish, …) in
  19 tints. The shape says what the product is, the tint says which family it belongs to. Drawings are
  flat, two or three colours, no outlines, no emoji, no icon font.
- **Decorative.** The product's name is always written next to the picture, so the picture carries no
  accessible name of its own (`aria-hidden`) and is never the only way something is communicated.

## Sizes

- 16 px (`size-4`): inline and status icons, icons in badges (`size-3.5`).
- 20 px (`size-5`): buttons, compact controls and navigation.
- 24 px: main feature icons.
- 32 px (`size-8`): empty states (`EmptyState`).

Stroke is lucide's default (about 2 px at 24 px).

## Colour and state (UI redesign, docs/13_UI_REDESIGN.md)

- Icons in text are `text-fg-muted` or `text-fg-secondary`; an icon that marks a section or the active area is
  `text-accent-text` (turquoise-family text that passes contrast in light and dark mode).
- Active navigation is a tinted row (`bg-accent-subtle`), a bold label and a turquoise bar on the left in the sidebar,
  and a tinted pill behind the icon in the phone's bottom bar — never colour alone.
- State icons follow the state tokens: `text-success` (done, "Uvařeno", saving), `text-warning` (probably ran out,
  favourites), `text-destructive` (errors). The status of a receipt is always also said in words (`Badge`).
- Decorative icons are `aria-hidden`; an icon that carries meaning on its own has an `aria-label`.

## Meaning

- Sparkles is reserved for genuine AI or automatic functionality.
- History is used for historical price context, including the 30-day low-price indicator.
- CookingPot marks recipes and the meal plan (also "Dnes vaříme" on Domů and a recipe card without a picture).
