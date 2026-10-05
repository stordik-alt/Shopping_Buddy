# 15 — Budget by period: next period's budget, savings goal, past periods

Status: implemented 2026-10-05 (feature B of the post-redesign plan; concept owner-approved the same day). The owner's words: "Nikde nevidím, kde
se zadává rozpočet na další měsíc, kolik chci ušetřit a kolik už bylo ušetřeno. Dále v rozpočtu chci zkontrolovat i
předešlá období, ne jen aktuální." "Ušetřeno" was chosen as **budget minus spending** of a period (not deal savings).

## Before (verified in code, 2026-10-05)
- One budget for every period: `households.monthly_budget` (set in Profil). The `budgets` table (household, month,
  amount) exists from the baseline but nothing reads or writes it; production has no rows (checked 2026-10-05).
- Since #214 the page loads only the **current period's** expenses (`getHouseholdData`, `historySince`). So Výdaje
  cannot show an older month although it has a month switcher, and "Utrácíte méně/více než minulý měsíc"
  (`periodOverPeriodChange`) has no previous period to compare and is never shown.
- No savings goal anywhere.

## Rules
1. **Budget of a period** = that period's own amount if the household set one (`budgets`, keyed by the period's start
   date), else the default from Profil (`households.monthly_budget`). One function decides it (`budgetForPeriod`,
   `lib/budget.ts`) and everything uses it — the budget card, the 80 % / 100 % notifications, the category snapshot.
2. The household can set the budget of the **current** and the **next** period (Rozpočet ▸ Upravit). Setting it back to
   the default removes the period's own amount.
3. **Savings goal**: one monthly amount for the household (`households.savings_goal`, 0 = none).
4. **Saved in a period** = its budget − its spending (negative = overspent). Shown for every finished period, and as
   "zatím zbývá" for the current one; the total of finished periods is "ušetřeno celkem". Only periods with a budget
   (> 0) count. A finished period without its own budget is measured against today's default — changing the default
   in Profil also changes what such periods saved; a period's own budget keeps it fixed.
5. **Past periods** are loaded only when looked at (Neon compute): Rozpočet loads the household's spending per day once
   (one small aggregate query — enough for the list of periods, their totals and savings), and a period's expenses
   when it is opened. The current period stays in the page load as today.

## Data
Migration `0067_budget_periods.sql`, additive: `households.savings_goal numeric(10,2) NOT NULL DEFAULT 0` (≥ 0), and a
unique index on `budgets (household_id, month)` (the table is empty in production), `budgets.amount ≥ 0`.

## Code
- `lib/budget.ts`: `budgetForPeriod`, `spendingByPeriod` (daily totals → per period), `periodSavings`, `savingsHistory`
  (finished periods with a budget, oldest first, and their total).
- Actions (`app/actions/budget.ts`): `getBudgetHistoryAction()` (daily totals), `getPeriodExpensesAction(period)`,
  `setPeriodBudgetAction(period, amount | null)` (current or next period only), `setSavingsGoalAction(amount)`.
- `getHouseholdData` returns the period budgets (`household.periodBudgets`) and the savings goal; the budget-threshold
  notifications use the period's budget (`periodSpending` returns the period, `notifyBudgetThresholds` reads its row).
- Client state: `components/shell/use-budget-periods.ts` — loads the per-day totals while Rozpočet is open and a past
  period's expenses when Výdaje shows it; an expense added, corrected or removed in a past period drops that period's
  copy and the totals, so they load again.
- UI, Rozpočet ▸ Aktuální stav: the budget card shows the current period's budget; under it the card **Plán a úspory**
  (`components/budget/budget-plan.tsx`): this and the next period's budget, the savings goal, what is left in this
  period and how much is missing to the goal, and the finished periods (newest first, six then "Zobrazit všechna")
  with budget, spending and saved / overspent, plus "Ušetřeno celkem". A finished period opens in Výdaje. "Upravit"
  (and "Nastavit rozpočet" on the budget card) opens the sheet **Upravit rozpočet** for this and the next period and
  the goal. Výdaje's period switcher lists every period with spending and loads an older one when shown.
  (The concept's first draft put a period switcher on Aktuální stav itself; the list in the card plus Výdaje gives
  the same look back without a second switcher.)

## Not in scope
- Per-category goals, savings accounts, deal savings ("ušetřeno na akcích" — may come later as its own figure).
