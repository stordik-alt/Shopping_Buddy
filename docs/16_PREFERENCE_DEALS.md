# 16 — Deals from the household's shopping preferences

Status: implemented 2026-10-05 (feature C of the post-redesign plan). The owner: "Zkontrolovat, jak aplikace pracuje s
Nákupními preferencemi domácnosti. Mohly by být nabízeny akce přímo, pokud se položka z preferencí objeví v akci."

## Before (verified in code, 2026-10-05)
Profil ▸ Nákupní preference stores preferred brands, preferred stores, preferred products and excluded products
(`preferences` table). Only the preferred stores were used (meal-plan store recommendation); brands, products and
exclusions were stored and never read.

## Rules
1. **Preferred terms** = the household's preferred products and preferred brands (trimmed, without duplicates, case
   ignored; at most 20, each at most `MAX_DEALS_QUERY_LENGTH`). A deal matches a term the same way the Akce search box
   matches — every word of the term by stem in the product name, or in its category / subcategory name. Brands are
   matched through the product name (retailers print the brand in it); there is no brand column.
2. **Excluded products** are hidden from every Akce view (a deal matching any excluded term is left out). Deals on the
   household's own shopping list (Domů ▸ "Akce k vašim položkám") are not filtered — the household put them there.
3. **"Pro mě"** in Akce shows only deals matching at least one preferred term (and no excluded one), largest discount
   first by default. Domů shows the first three of them in "Akce na vaše oblíbené" with a link to the full view; the
   card is not shown when the household has no preferred terms or nothing matches.
4. The server reads the preferences of the caller's household itself; the client only says "Pro mě" on/off
   (CLAUDE.md section 9).
5. No new data, no AI: the same deal query and the same deal assessment as Akce ("is this really the best price?").

## Code
- `lib/preference-deals.ts`: `preferenceDealTerms(preferences)` → `{ preferred, excluded }` (pure, tested).
- `lib/db/deals.ts` `getDealsPage({ …, preferred, excluded })`: `preferred` (null = no filter, [] = nothing) and
  `excluded` add SQL filters built by the existing search matcher.
- `app/actions/deals.ts` `dealsPageAction({ …, forMe })` loads the household's terms server-side.
- UI: `components/deals/deals-tab.tsx` ("Pro mě" switch, shown when the household has preferred terms),
  `components/dashboard/preferred-deals.tsx` (Domů card).

## Not in scope
- Notifications for a preferred item on promotion (a new notification kind; could follow with docs/14).
- Using the preferred stores for deals (the store filter in Obchody already covers "nearby").
