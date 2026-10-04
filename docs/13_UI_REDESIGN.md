# 13 — UI/UX Redesign (ANITKA design system)

Status: **Phase 1 (audit) done; plan step 1 (tokens) implemented on the local branch `ui-redesign`.** All redesign work stays on a local
branch and is deployed once, as a whole, after it is complete and tested (owner brief, section 16). The Picsart images
are inspiration, not a layout specification; the current application is the source of truth for functionality.

Scope rule: UI/UX only. No change to the database model, API contracts, business logic, OCR/import logic, budget
calculations, categorisation or pantry operations. Problems found there are only documented (see "Out of scope").

## 1. Audit — current state (verified in code, 2026-10-04)

### 1.1 Information architecture
- One page (`app/page.tsx`) renders `components/app-shell.tsx` (757 lines), which owns all state and switches between
  nine tabs (`lib/types.ts` `Tab`): Domů, Nákup, Zásoby, Rozpočet, Akce, Obchody, Recepty, AI (feature-flagged), Profil.
- Navigation: desktop `AppSidebar`; phone `MobileNav` with 4 slots (Domů, Nákup, Zásoby, Rozpočet) + "Více" sheet
  (Akce, Obchody, Recepty, Profil, AI). Icons come from `components/shared/nav-item.tsx` (documented in
  `docs/08_ICON_SYSTEM.md`, lucide-react).
- Sub-views are local pill toggles inside a tab, not routes: Nákup = Nákupní seznam / Moje nákupy / Účtenky;
  Rozpočet = Aktuální stav / Výdaje. Cross-tab links exist as callbacks (e.g. Zásoby → Nákup/Účtenky,
  Obchody → Akce filtered by chain, attention strip → tab + sub-view).
- Consequence for the redesign: deep links to a *specific item* (a receipt, a recipe, a day of the meal plan, a pantry
  place) do not exist today; only tab (+ Nákup sub-view) can be targeted. Dashboard "tap to the exact thing" needs a
  small, UI-only navigation target mechanism (see plan step 6) — no routing/back-end change.

### 1.2 Dashboard (Domů) today
Order: `TodayAttention` (receipts needing action, deals ending) → `DashboardOverview` (`BudgetHero` compact, `QuickActions`,
shopping-list card) → `QuickOutOfStock` → `PriceWatch` (deals) → `SpendingBreakdown` + `SavingsInsight`.
Already good: tapping budget/list/deals/spending leads to a tab; attention items are deterministic (`lib/attention.ts`).
Gaps vs. the brief ("řídicí centrum domácnosti"):
- no pantry summary other than "ran out" quick buttons (no low-stock / expiring overview);
- no meal plan or recipe on Domů (it exists in `meal-plan.tsx`, `recipes.tsx`);
- no last/pending receipt summary except the attention line;
- items open a tab but not the concrete item; few inline actions (only "add deal to list", "ran out").

### 1.3 Design system today
- `app/globals.css`: shadcn tokens (`background, card, primary, secondary, muted, accent, destructive, success, warning,
  border, input, ring, chart-1..10, sidebar-*`), `--radius: 0.875rem`, one shadow `--shadow-card`, `@utility surface`,
  `.icon-button`. Light + `.dark` (class toggle, `useTheme`). Font: Inter. Reduced-motion handled.
- Brand is already partly applied: `--primary` = Navy `#0a1a3f` (light) / Turquoise `#03bcdb` (dark), `--ring` turquoise,
  `--accent` pale turquoise tint. App icon assets in `public/brand/` are untouched and must stay so.
- Missing tokens versus the brief: `surface-elevated`, `text-muted` (third text level), `accent-hover/-pressed`, `info`.
  `success`/`warning`/`destructive` exist but have no `-subtle` (background) variants, so components improvise with
  opacity (`bg-destructive/10`, `bg-primary/15` …; 60 `primary/NN` usages).
- Dark mode is a single navy-grey ramp (`background .17`, `card .215`, `muted .26`); only 3 elevation levels, no distinct
  "elevated"/modal/input surfaces.

### 1.4 Measured inconsistencies (grep over `components/` and `app/`, excluding tests)
| Finding | Count | Meaning |
|---|---|---|
| `<Button>` from `components/ui/button.tsx` used | **0** | shadcn button exists but nothing uses it |
| raw `<button` | 220 | every button restyled by hand |
| raw `<input` / `<select>` / `<textarea` | 79 / 51 / 1 | no shared form-field components |
| pill/segmented toggle (`rounded-full bg-primary text-primary-foreground`) | 12 | duplicated, incl. both tab switchers in `app-shell.tsx` |
| `surface` utility used | 43 (27 files) | good base, but cards also built ad hoc: `rounded-3xl border …`, `rounded-[1.75rem]`, `rounded-2xl bg-muted` |
| radius classes | `rounded-xl` 191, `rounded-2xl` 89, `rounded-lg` 65, `rounded-3xl` 21 + arbitrary values | no radius scale in use |
| fixed overlays (`fixed inset-0`) | 8, but `role="dialog"` only 3 | modals/sheets hand-built; focus trap / a11y inconsistent |
| tiny text `text-[10–11px]` | 5 (+4 other px sizes) | brief forbids miniature text |
| `text-xs` | 286 | overused as the default secondary size |
| hardcoded colour classes | ~5 (amber) + `#hex` in intro, chain-logo, layout, global-error | acceptable; the palette is token-driven |
| `<img>` | 12 (recipes, receipts, brand, chain logos) | no product images in the UI today |
| `overflow-x-auto` | 0 | good: wrapping, no horizontal scroll (owner rule) |

Largest components (refactor/regression risk): `app-shell` 757, `recipes` 680, `shopping-list` 626, `pantry` 581,
`meal-plan` 437, `household-profile` 435, `receipt-pending` 431.

### 1.5 Contrast of the existing tokens (computed, WCAG relative luminance)
- Light: text on background 16.2:1; muted text 5.6:1 (on `muted` 5.3:1); success 5.6, warning 6.7, destructive 5.3 on card — all pass AA.
- **White on Turquoise `#03bcdb` = 2.28:1 (fails). Turquoise as text/icon on the light background = 2.14:1 (fails).**
  Navy on Turquoise = 7.5:1. So turquoise may only be used as a *fill with navy text*, a ring/progress fill, or as
  text in **dark** mode (7.7:1 on dark card). In light mode, "accent text" must use the darker `#045a68`-class shade
  (already `--accent-foreground`).
- Dark: text 17:1, muted text 7.9:1, all pass.

### 1.6 Images
No product images exist in the UI. Recipes already use external `imageUrl` (`referrerPolicy="no-referrer"`), receipts use
the authenticated private route, chain logos are small static SVGs with a coloured-badge fallback. So the "no R2 copy
for products, URL only, layout survives without an image" requirement can be met by a single `ProductThumb` that renders
nothing/compact when there is no URL — no storage change.

## 2. Design principles for this app
1. Card = quick overview + entry to detail: ≤ 5 facts, one state, one primary action.
2. Dashboard = control centre: each fact is tappable, goes to the concrete place, and where safe offers an inline action.
3. Turquoise is for active state, primary CTA, progress, savings, AI. Navy is the structural brand colour.
4. Clarity over density (owner, 2026-10-04): on opening the app the user sees only what matters now — a few facts per card, one primary action, details one tap away. Never "hundreds of facts" on one screen.
5. Tonal layers instead of heavy borders; wrapping instead of horizontal scroll; ≥ 44 px targets; text ≥ 12 px.

## 3. Proposed design tokens (to be tuned visually on the Dashboard before roll-out)
Implemented as CSS variables in `globals.css`, mapped into `@theme inline`; existing shadcn names stay (so current
components keep working) and new semantic names are added.

| Token | Light | Dark | Notes |
|---|---|---|---|
| `background` | warm off-white `oklch(.978 .005 85)` (keep) | `oklch(.17 .014 230)` deep navy-ink | page |
| `surface` (= card) | `oklch(.996 .003 85)` | `oklch(.215 .018 230)` | cards |
| `surface-elevated` | white + shadow | `oklch(.255 .02 230)` | modals, sheets, popovers, active cards |
| `surface-muted` (= muted) | `oklch(.955 .008 85)` | `oklch(.24 .016 230)` | wells, inputs |
| `text-primary` | `oklch(.22 .02 255)` | `oklch(.94 .008 85)` (not pure white) | ≥ 15:1 |
| `text-secondary` | `oklch(.40 .02 255)` | `oklch(.80 .015 230)` | ≥ 7:1 |
| `text-muted` | `oklch(.50 .02 255)` (≥ 5:1) | `oklch(.70 .02 230)` (≥ 5:1) | never below 4.5:1 |
| `border` | `oklch(.92 .006 85)` | `oklch(1 0 0 / 9%)` | |
| `accent` (turquoise fill) | `#03bcdb` w/ navy text | `#03bcdb` w/ navy text | CTA, active |
| `accent-hover` / `accent-pressed` | `#14c9e6` / `#02a2bd` | `#2bd0ea` / `#02a2bd` | |
| `accent-subtle` | `#e3f8fb` | `#113947` | selected rows, chips |
| `accent-text` | `#045a68` | `#7fe6f5` | turquoise-family text, ≥ 4.5:1 |
| `success`/`warning`/`error`/`info` + `-subtle` | current hues, plus tinted backgrounds | lighter hues | state only; `info` reuses a navy-blue tint, no new accent hue |

Scales: radius `sm 8 / md 12 / lg 16 / xl 20 / pill`; cards use `lg`/`xl` only (collapses the 6+ radius values in use).
Spacing 4-pt grid; card padding `p-4` (mobile) / `p-5` (≥ sm). Type: Inter, `display 28/32`, `title 20/28`, `body 15–16`,
`secondary 14`, `caption 12` (minimum). Shadow: `card` (existing) and `elevated`; glow only on the focus ring.
Icons: lucide, stroke 1.75, sizes 16/20/24/32 per `docs/08_ICON_SYSTEM.md`; no emoji as UI icons.

### 3.1 Implemented names (step 1, `app/globals.css`)
The shadcn names (`background, card, muted, accent, …`) are unchanged because `accent` there means the pale turquoise *tint*. New tokens (Tailwind utilities in brackets): `surface-elevated` [`bg-surface-elevated`, `shadow-elevated`], `fg-secondary` / `fg-muted` [`text-fg-secondary`], `accent-solid` + `-hover` / `-pressed` / `-foreground` (the turquoise fill with Navy text), `accent-subtle`, `accent-text`, `info`, and `success|warning|destructive|info-subtle` backgrounds. Dark mode was re-tuned to a navy-ink ramp (hue 255): page .165, card .21, muted/inputs .25, elevated/popover .26, text .94 (warm, not pure white). Verified contrast, dark: text/card 14.9, fg-muted/card 7.2, fg-muted/elevated 6.3, success 9.3, destructive 6.6, info 9.5, turquoise/card 7.8; light: fg-secondary/page 9.4, info/card 7.4, accent-text/accent-subtle 7.2. No component uses the new tokens yet; the only visible change is the dark palette. Baseline and after screenshots (8 tabs x light/dark x 390/1280 px) were compared.

Observed for step 4: in dark mode the budget hero (`bg-primary`) becomes a large saturated turquoise slab; the redesign should use a calmer surface with a turquoise progress bar instead.

## 4. Shared components to introduce (in `components/ui/`, built on existing tokens)
`Button` (reuse the existing `button.tsx`; adopt it), `IconButton`, `Card` (+ `CardHeader/Footer`, `interactive` variant),
`SegmentedControl` (replaces the 12 pill toggles), `Badge`/`StatusBadge` (OK / Ke schválení / Chyba / Duplicita, budget
levels), `ProgressBar` (budget, shopping, stock), `Field`/`Input`/`Select`/`Textarea`, `Sheet`/`Dialog` (one accessible
implementation: focus trap, Escape, `role="dialog"`), `EmptyState`, `Skeleton`, `ProductThumb` (optional image), `StatTile`.

## 5. Card definitions (overview card → detail)
| Area | Card shows | Primary action | Detail (existing screen) |
|---|---|---|---|
| Rozpočet | remaining, spent / total, progress + level badge | open budget | `BudgetOverview`, categories, recurring, ledger |
| Nákupy | open / done count, progress, estimated total | open list | `ShoppingList`, plan, store comparison |
| Zásoby | per place (Lednice/Spíž/Mrazák/…) item count, low-stock count | open pantry | `Pantry` (+ review, moves) |
| Recepty | name, time, servings, ingredient availability, image only if present | Přidat do nákupu | recipe detail, meal plan |
| Obchody | chain, distance, open/closed, top deal count | open store | `StoreDirectory` |
| Akce | product, price, store, pack, valid-until, saving, 30-day low | Na seznam | `DealsTab`, price history |
| Účtenky | store, date, total, recognised items, status badge | review / retry | `ReceiptPending`, `PurchaseHistory` |

## 6. Dashboard proposal ("Domů")
Priority order, driven by what is actionable, not by a fixed list:
1. **Pozornost** (`TodayAttention`, extended in the UI layer from data already in memory): receipts to approve, deals
   ending, pantry likely empty, over-budget level; each row deep-links to the exact item.
2. **Rozpočet** hero (remaining, per-day allowance, level) → budget state.
3. **Dnešní nákup**: list progress + next items; tick items inline.
4. **Zásoby**: places with counts + "došlo" quick actions (existing `QuickOutOfStock`).
5. **Jídelníček**: today's planned meal (from the saved `mealPlan`) → recipe detail; "add missing to list".
6. **Akce / úspora**: best 2–3 deals relevant to the list/pantry, inline "Na seznam".
7. **Účtenky**: last import and pending count.
8. Spending breakdown / savings insight as secondary, collapsible.
Sections with nothing to say collapse or disappear (as `TodayAttention` already does); empty states say the next action.

## 7. Implementation plan (small, safe steps; each step must keep `typecheck`, `lint`, `build` and unit tests green)
0. Branch `ui-redesign` from fresh `origin/main`; stays unmerged until all steps pass. No deploys in between.
1. **Tokens only** (`globals.css`): add new variables, dark-mode ramp, subtle/state tokens; keep old names. Visual diff
   with Playwright screenshots light/dark at 360/390/768/1280 px (baseline taken first).
2. **Primitives** (`components/ui/`): Card, SegmentedControl, Badge, ProgressBar, Field set, Sheet/Dialog, EmptyState,
   Skeleton, ProductThumb, StatTile + component tests; no screen uses them yet.
   *Done (local):* `card`, `badge`, `progress-bar`, `segmented-control`, `field` (Input/Select/Textarea/Field), `empty-state`, `skeleton`,
   `product-thumb`, `sheet` (base-ui Dialog: focus trap, Escape, bottom sheet on phone) in `components/ui/`, plus `Button` variant `accent`;
   tests in `components/ui/primitives.test.tsx`. StatTile is not added: the existing `components/shared/stat.tsx` is reused.
3. **Shell**: sidebar, mobile nav, header, "Více" sheet, notification panel on the new primitives (labels ≥ 12 px).
   *Done (local):* active nav item is a tinted row + bold label + turquoise bar (no full navy/turquoise fill, not
   colour-only); "Více" is the shared `Sheet` (focus trap, Escape, backdrop) instead of a hand-built overlay; sidebar uses
   the `sidebar` tokens; bell count and brand subtitle are 12 px; notification panel and account menu use
   `surface-elevated`/`shadow-elevated`, the panel has an empty state and an sr-only "Nepřečteno" label. Verified in
   Playwright at 360/1280 px, light/dark: no horizontal overflow, no page errors.
4. **Domů** redesign + UI-only navigation targets (tab + sub-view + item id passed as props/state; no routing changes).
   *Done (local):* order = Dnes je důležité → budget card (whole card taps to Rozpočet ▸ Aktuální stav) + shopping-list
   card (taps to Nákup ▸ Nákupní seznam) → quick actions → **Dnes vaříme** (new, `todaysMeals` in `lib/meal-plans.ts`:
   today's meals of the saved plan of the current week; without one a single quiet line) → Došlo mi… → Akce k vašim
   položkám → "Výdaje podle kategorií" (spending + weekly allowance) collapsed by default with a one-line summary.
   The budget hero uses new `hero`/`hero-foreground` tokens: Navy in light mode, an elevated navy surface in dark mode
   (no turquoise slab); progress is turquoise, amber from 80 %, red when over. Decisions taken to keep the first screen
   short: no separate Účtenky card (pending receipts are already in "Dnes je důležité", upload is a quick action);
   inline ticking of list items and item-level deep links are not added — targets are tab + sub-view, because no
   screen accepts an item id yet (revisit with the detail screens, step 6). Verified in Playwright at 320/390/1280 px,
   light/dark, with seeded local data: every dashboard entry lands on the right tab and sub-view, no overflow, no errors.
5. **Rozpočet → Nákupy → Zásoby → Recepty → Obchody → Akce → Účtenky** cards, one PR-sized chunk each, replacing
   pill toggles with `SegmentedControl` and ad hoc modals with `Sheet/Dialog`.
   *Rozpočet done (local):* both view switchers (Aktuální stav / Výdaje; Podle kategorií / Podle data) are
   `SegmentedControl`; `ExpenseModal`, `CategoryLimitsModal` and `RecurringPaymentModal` are the shared `Sheet` (focus
   trap, Escape, `role="dialog"`, start in the first field of a new entry via `initialFocus`, primary action in a footer
   that stays visible) with `Field`/`Input`/`Select`/`Button`; buttons in the overview, recurring payments and ledger use
   `Button`; the recurring-payments empty state is `EmptyState`. `PurchaseItemSplitDialog` already uses a native modal
   `<dialog>` and was left as is. Verified in Playwright (320/390/1280 px, light/dark): no overflow, no errors; a new expense
   starts in Částka, Escape closes, validation shows, saving closes the sheet and the expense appears in the ledger.
   *Nákupy done (local):* the Nákup view switcher (with the receipts count), the list switcher and the category filter are
   `SegmentedControl`; the tick is a 44 px target around a 28 px circle (turquoise when bought, `aria-pressed`, the item
   name in its label); item detail fields are 44 px; badges (druh zboží, Akce, Priorita) are `Badge`; "Dokončit nákup" is
   the turquoise `accent` CTA; the empty list is `EmptyState`. "Moje nákupy": manual purchase is the shared `Sheet` (it
   was a hand-built overlay without focus trap) and its item fields got accessible names (they had placeholders only);
   quantity, unit and price share a row on phones. Usual items and the "Došlo?" prompt use `Button` (were 36 px / 12 px).
   "Best option" highlights in plan/store/price comparison use `accent-subtle`/`accent-text`. Verified in Playwright
   (320/390/1280 px, light/dark): ticking, adding an item, the finish button, the manual-purchase sheet and Escape work;
   no overflow, no errors.
   *Zásoby done (local):* a pantry row now shows only name, state badge (Asi došlo / Máte ještě?), category ▸ subcategory
   as text, the quantity stepper (44 px −/+ and field) and "Ještě mám" / "Došlo" (44 px); category, subcategory, place
   and tracking moved behind a native `<details>` "Upravit" (still in the page, labelled `Select`s). Place tiles are compact
   rows (icon beside name and count; active = turquoise outline + tint, not a solid slab), banners use accent / warning
   tints and `Button`, the subcategory filter is `SegmentedControl`, the empty folder is `EmptyState`. `PantryAddModal` is
   the shared `Sheet` (starts in Produkt; submit button in the footer via `form=`). The bulk check: 40 px scope switch,
   "Mám" in success / "Došlo" in danger tints, `Button`s. Verified in Playwright (320/390/1280 px, light/dark) with
   seeded local pantry data: stepper changes the quantity, folders switch, the add sheet validates and closes on Escape;
   no overflow, no errors.
   *Recepty done (local):* the Recepty / Jídelníček switch is `SegmentedControl` and shares one row with Oblíbené /
   Historie (the duplicate "Recepty" heading is gone); the first screen is one search field, the quick searches, and
   a "Co uvařit z toho, co mám doma?" card with the turquoise CTA; source, sort and "Podle domácnosti" wait behind
   a native `<details>` "Další filtry". A recipe card without a picture keeps its shape with a quiet icon (no "Bez
   obrázku" box). Recipe detail: 44 px servings and favourite buttons, each ingredient row is the checkbox's label,
   `Button`s, 12 px minimum. Meal plan: each meal is one row (name, state in words — Chybí… / Vše ze zásob / Uvařeno —
   and a 44 px "Uvařeno" button); servings and "Jiný návrh" moved into the meal's detail, now the shared `Sheet`
   (it was a hand-built overlay), which reads the meal from the plan on every render so changes show at once; the
   long "Chybí" list of the shopping summary is behind "Zobrazit, co chybí (N)". Verified in Playwright (320/390/1280
   px, light/dark) with a plan seeded from the built-in catalog: servings change in the sheet, Escape closes it, the
   cooked button is 44 px, Domů shows "Dnes vaříme"; no overflow, no errors. Not verifiable locally: recipe search,
   recipe detail and generating a new plan need the recipe catalog / sources, which the local database does not
   have — to be checked in the final integrated run against data.
6. **Detail screens** after the owner approves the cards (brief, phase 4).
7. **Cleanup**: remove dead styles, document in `docs/01_CURRENT_STATE.md`, `docs/08_ICON_SYSTEM.md`, `docs/07_CHANGELOG.md`.
8. **Final verification as one integrated whole**: lint, typecheck, unit tests (pure ones; DB tests only via local
   PostgreSQL, never Neon), `pnpm build`, Playwright run through every tab and every dashboard link, light/dark, 320–1280 px,
   contrast re-check of every token pair. Only then one deployment.

## 8. Out of scope / observations (documented only)
- `app-shell.tsx` mixes state orchestration with layout; splitting it is a refactor, not part of this redesign.
- `ui/button.tsx` uses `@base-ui/react`; keep it as the base of the new `Button`.
- No business-logic problems were found while auditing.
- Observed while redesigning Nákupy (documented only, not changed): the list switcher in `ShoppingList` changes only
  the heading — `activeList` does not filter the items, so every list shows the same items. Worth reviewing as a feature question
  (whether lists should hold their own items).
- "Plán nákupu" lists every chain as a priority chip (about 25), which is long on a phone; worth condensing with the
  detail screens (step 6).

## 9. Open questions for the owner
- The Picsart references were received after the audit and used as visual inspiration only (not a layout spec).
- Confirm the Dashboard order above (especially Jídelníček and Účtenky positions) and whether a pantry "expiring" notion
  should be shown, which would need data that does not exist today (otherwise only low/likely-gone stock is shown).
