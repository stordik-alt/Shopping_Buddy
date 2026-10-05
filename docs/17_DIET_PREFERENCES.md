# 17 — Eating preferences per member (clickable questionnaire)

Status: implemented 2026-10-05 (feature D of the post-redesign plan). The owner: "Přidal bych stravovací preference
(formou klikacího dotazníku), s těmito preferencemi by mohl pracovat návrh jídelníčku." Asked whether per household or
per member, the owner chose **per member**.

## Before (verified in code, 2026-10-05)
Each member's profile had free-text favourite foods, disliked foods and allergies (`profiles`), typed in when the member
was added. The meal plan and recipe suggestions already left out recipes whose ingredient names match an allergy or a
disliked food. There was no way to say "vegetarian" or "no gluten", and recipes carry no diet tags.

## Questionnaire
Profil ▸ Členové domácnosti ▸ "Vyplnit / Upravit stravování" on each member opens a sheet with two clickable steps:
1. **Jak se stravuje?** — one of: Jím všechno, Vegetariánská (no meat or fish), Pescetariánská (no meat), Veganská (no
   meat, fish, dairy, eggs or honey).
2. **Čemu se vyhýbá?** — any of: dairy (lactose), gluten, nuts, eggs, fish and seafood, pork.
The answers show as chips on the member's card. Any member of the household may fill it in for another member (as
with adding members); never for another household.

## Rules
1. The plan is cooked for the whole household, so a recipe is offered only when it suits **every** member's answers.
2. A recipe is judged by its ingredient names (`lib/diet.ts`): an ingredient breaks a rule when one of its words starts
   with a stem of the rule ("vepř" → "vepřová plec") or equals one of its exact words ("med", so "medvědí česnek" is
   not honey). Plant "milks" and "butters" (oat milk, peanut butter…) are not dairy. Deterministic, no AI. Where the
   name cannot tell (e.g. "hladká mouka" could be gluten-free), the recipe is left out — the safe side.
3. Unlike an allergy match today, a diet is **never relaxed** to fill a slot: when no recipe fits, the household is told
   ("…nemáme recept na oběd. Zkuste ten chod vynechat.") instead of being served meat.
4. The same rules filter recipe search and the "what to cook from the pantry" suggestions (`filterRecipeForHousehold`).
5. The meal-plan screen names whose eating it follows ("Podle stravování: Jana (vegetariánská, bez: lepek)").

## Data
Migration `0068_member_diets.sql` (additive): `member_diets (member_id PK → household_members ON DELETE CASCADE, diet,
avoids text[], updated_at)` with check constraints listing the keys of `lib/diet.ts` (a test compares them). No row =
eats everything.

## Code
- `lib/diet.ts`: `DIETS`, `DIET_AVOIDS`, `householdDietStems`, `ingredientBreaksDiet`, `recipeFitsDiet`,
  `cleanMemberDiet`, `dietLabels` (tested).
- `setMemberDietAction(memberId, answers)` in `app/actions/household.ts` (member must be in the caller's household;
  unknown keys refused).
- `getHouseholdData` returns `member.diet`; `getRecipeHouseholdData` returns `dietStems`; `lib/meal-plans.ts`
  (`generateWeeklyPlan`, `regenerateMeal`) and `lib/recipes/recommendations.ts` apply them. With a diet, the meal plan
  starts from 60 catalog candidates per meal instead of 36.
- UI: `components/household/diet-questionnaire.tsx`, `member-card.tsx`, the note in `components/dashboard/meal-plan.tsx`.

## Not in scope
- Children (they have free-text preferences, deliberately not turned into automatic exclusions).
- Calories, portions, cooking time, cuisine preferences.
