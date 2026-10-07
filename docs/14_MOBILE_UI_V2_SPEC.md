# Mobile UI v2 — implementation specification

## 1. Scope

This document is the implementation contract for the next mobile UI pass of Shopping Buddy.

Goals:
- optimize the existing Next.js/PWA interface for 360, 390 and 430 px mobile widths;
- preserve existing business logic, DB/API contracts, OCR/import logic and calculations;
- use the existing ANITKA design system and shared UI primitives;
- keep mobile navigation stable;
- reduce first-screen density and repeated controls;
- make important cards actionable and deep-link to the exact item where possible;
- verify the UI against the local PostgreSQL/test dataset with Playwright before deployment.

Do not introduce React Native or a second UI stack.

## 2. Global mobile contract

### Layout
- Page horizontal padding: 16 px.
- Card-to-card vertical spacing: 12–16 px.
- Card internal padding: 16 px.
- Avoid horizontal scrolling for normal content.
- Long labels wrap rather than overflow.
- Bottom navigation must respect mobile safe-area inset.
- Main content must have enough bottom padding so the fixed navigation never covers the last action.

### Touch and typography
- Interactive targets: minimum 44 × 44 px.
- Body/supporting text: minimum 12 px.
- Primary values: visually dominant, short and scannable.
- Do not introduce new 10–11 px text.
- Icon-only actions require an accessible label.
- Do not use hover-only information on mobile.

### Components
Prefer:
- Card / CardHeader / CardFooter
- Button
- Badge / StatusBadge
- SegmentedControl
- Field / Input / Select / Textarea
- Sheet for contextual edits/details
- Dialog only where confirmation is required
- EmptyState
- Skeleton
- ProgressBar
- ProductThumb

Do not create another local card, pill, modal or segmented-control implementation when an existing primitive fits.

## 3. Mobile navigation

Keep the existing five slots:

1. Domů
2. Nákup
3. Zásoby
4. Rozpočet
5. Více

The fifth slot opens the existing bottom Sheet with:
- Akce
- Obchody
- Recepty
- Profil
- AI when enabled

Do not move frequently used destinations into additional bottom-nav slots. The five-slot layout is intentional for narrow devices.

## 4. Domů — household control centre

Order on mobile:

1. TodayAttention
2. BudgetHero
3. Dnešní nákup
4. Zásoby
5. Dnes vaříme
6. Akce / úspora
7. Účtenky
8. Spending breakdown / savings insight

### TodayAttention
Show only actionable attention items.

Possible states:
- účtenka čeká na schválení;
- akce brzy končí;
- položka pravděpodobně došla;
- rozpočet je překročen / blízko limitu.

Requirements:
- no empty attention card;
- each row is tappable;
- tap opens the exact target, not only the top-level tab;
- multiple attention items use one compact card/strip, not separate large cards.

### BudgetHero
Show:
- remaining amount;
- spent amount;
- total budget;
- progress.

Optional secondary value:
- recommended daily amount remaining for the current period.

Do not duplicate the same budget numbers in another immediately adjacent card.

### Dnešní nákup
Show:
- pending item count;
- completed item count;
- compact progress;
- up to three representative pending products;
- primary action to open Nákup.

If there are no pending items, replace the list with an EmptyState/positive completion state instead of showing an empty card.

### Zásoby
Show:
- one compact summary;
- low/empty/expiring signal when relevant;
- fridge/pantry/freezer status only if there is meaningful data.

Tap opens Zásoby. If a specific warning exists, preserve the exact focus target.

### Dnes vaříme
Show today's meal-plan entries only when available.

Each entry:
- meal name;
- recipe thumbnail when available;
- meal time/category;
- tap opens the exact recipe/meal-plan item.

If no meals exist, the section should be omitted or reduced to a compact empty action, not a large empty card.

### Akce / úspora
Show only deals relevant to the current shopping context when possible.

Prefer:
- saving in Kč;
- product/package size;
- store;
- expiry/end date when useful.

Avoid a generic wall of promotions on the home screen.

### Účtenky
Show a compact receipt status summary:
- pending approval count;
- latest imported receipt when available;
- error state only when action is required.

The section must deep-link to the relevant receipt.

## 5. Nákup

Current internal views remain:
- Seznam
- Nákupy
- Účtenky

### Seznam
Top area:
- list name/context;
- pending/completed count;
- progress.

Product rows:
- checkbox/action;
- ProductThumb where useful;
- product name;
- package/unit information;
- price only when actually known;
- no unnecessary secondary metadata.

### Kde nakoupit celý seznam
This is a first-class comparison card, not a list of all store runs.

For each relevant chain/store:
- estimated total price for buying the entire current list there;
- number of matched items;
- number of missing/unmatched items if applicable;
- saving versus the best/worst comparable option when meaningful.

Do not show every historical import/run as a substitute for store comparison.

The card must make the question immediately answerable:
"Kolik zaplatím, když celý seznam koupím pouze v tomto řetězci?"

### Item interaction
Use a Sheet for quick product/list-item details or edits when possible.

Do not navigate away for a small one-field adjustment.

## 6. Zásoby

Primary mobile structure:
- Lednice
- Spíž
- Mrazák

Use a SegmentedControl rather than three large cards.

Each stock item:
- product;
- quantity;
- unit/package;
- low/empty/expiring state;
- optional expiry;
- compact action.

Do not show long inventory metadata on the first screen.

Use Sheet for:
- quantity edit;
- location change;
- expiry;
- quick add/remove.

Use exact focus targets from dashboard warnings.

## 7. Rozpočet

Keep internal views:
- Stav
- Výdaje

### Stav
First screen:
- total budget;
- spent;
- remaining;
- progress;
- period;
- optional daily allowance.

The remaining amount should be visually dominant.

### Výdaje
Show category totals and period filter.

Prefer compact rows/stat tiles over repeated large cards.

Receipt/purchase history belongs below the summary, not above it.

## 8. Akce

Mobile first screen:
- relevant/filterable deals;
- product;
- store;
- current price;
- package size;
- saving in Kč;
- validity.

Filters should open in a Sheet when they would otherwise consume significant vertical space.

Avoid large horizontal filter strips that require sideways scrolling.

## 9. Obchody

First screen:
- selected location/context;
- store list;
- chain;
- useful price/action signal.

Selecting a store opens its relevant detail/list.

Avoid presenting all available store metadata at once.

## 10. Recepty / Jídelníček

Keep these under Více rather than adding another bottom-nav slot.

Within the section:
- clear switch between Recepty and Jídelníček;
- recipe search/filter;
- today's meals;
- meal-plan actions.

Recipe cards:
- image when available;
- name;
- short metadata;
- primary action.

Do not require portions to exist before a recipe can be selected for the meal planner.

## 11. Účtenky

Pending imports must have an explicit status:
- OK;
- Ke schválení;
- Chyba;
- Duplicita.

Each pending item should make the required next action obvious.

Receipt detail/review should use the existing accessible Sheet/Dialog patterns where appropriate.

OCR processing itself is out of scope for this UI pass.

## 12. Profil

Keep settings compact:
- household;
- preferences;
- stores/location;
- notification preferences;
- account/settings.

Use grouped sections instead of many independent large cards.

## 13. Sheets and dialogs

Use bottom Sheets on phones for contextual tasks.

Required behavior:
- role=dialog;
- focus trap;
- Escape closes;
- focus returns to opener;
- sufficient bottom safe-area padding;
- no sheet content hidden behind the mobile nav;
- primary action remains reachable without awkward scrolling.

Use a full page only when the task genuinely needs extended content.

## 14. Responsive breakpoints

### 320 px
- No horizontal overflow.
- Navigation labels remain readable.
- Cards may stack all content vertically.
- Secondary metadata may be omitted.

### 360 px
- Baseline minimum supported mobile width.
- Standard 16 px page gutter.
- Two-column stats only when each column remains comfortably readable.

### 390 px
- Primary reference width for visual QA.
- Allow compact side-by-side value/action arrangements.

### 430 px
- Do not simply enlarge cards.
- Preserve readable max widths and spacing.
- Use additional horizontal room for metadata, not oversized typography.

### 768 px+
Desktop/tablet layouts may diverge, but shared primitives and semantic structure must remain consistent.

## 15. Visual QA requirements

Before merge:
1. Run typecheck.
2. Run unit/component tests.
3. Run DB tests against isolated local PostgreSQL, never Neon.
4. Run production build.
5. Run Playwright at:
   - 320 × 844
   - 360 × 800
   - 390 × 844
   - 430 × 932
   - 768 × 1024
   - 1280 × 900
6. Test light and dark mode.
7. Assert no horizontal overflow.
8. Assert no text below 12 px in user-facing UI.
9. Test bottom-nav safe area.
10. Test Sheet focus/Escape behavior.
11. Capture screenshots of every changed primary view.
12. Review screenshots using realistic local DB data.

## 16. Functional regression boundaries

This pass must not change:
- DB schema;
- migrations;
- API contracts;
- OCR pipeline;
- receipt parsing;
- price calculations;
- budget calculations;
- categorisation;
- inventory business rules;
- shopping recommendation algorithms.

Allowed:
- pure display helpers;
- UI state/focus targets;
- component extraction;
- styling;
- responsive layout;
- accessibility improvements;
- test additions.

## 17. Implementation order

Phase A:
- audit current main against this contract;
- remove duplicated mobile-only controls;
- verify shared primitive adoption.

Phase B:
- Domů;
- Nákup;
- Zásoby.

Phase C:
- Rozpočet;
- Akce;
- Obchody.

Phase D:
- Recepty/Jídelníček;
- Účtenky;
- Profil.

Phase E:
- responsive/accessibility cleanup;
- Playwright visual regression;
- local DB verification;
- final full test suite.

Do not deploy between phases. Merge/deploy the completed UI package as one release after all local verification passes.
