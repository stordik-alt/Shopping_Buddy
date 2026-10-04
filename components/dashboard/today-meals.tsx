import { CheckCircle2, ChevronRight, CookingPot } from 'lucide-react'
import { Card, CardButton } from '@/components/ui/card'
import type { MealType, Recipe } from '@/lib/meal-plans'

type TodayMeal = { day: string; mealType: MealType; recipe: Recipe; cooked: boolean }

/** "Dnes vaříme": today's meals from the saved weekly plan (`todaysMeals`). Each meal opens straight
 *  into its detail in the meal plan (servings, "Jiný návrh", "Uvařeno"); the heading opens the plan.
 *  Without a plan for today it is a single quiet line inviting the household to plan the week. */
export function TodayMeals({ meals, onOpen, onOpenMeal }: { meals: TodayMeal[]; onOpen: () => void; onOpenMeal: (day: string, mealType: MealType) => void }) {
  if (meals.length === 0) {
    return (
      <CardButton tone="muted" onClick={onOpen} className="flex items-center gap-3 py-3 sm:py-3">
        <CookingPot className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">Jídelníček</span>
          <span className="text-fg-secondary"> · na dnešek nic naplánováno</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-fg-muted" aria-hidden="true" />
      </CardButton>
    )
  }

  return (
    <Card className="p-2 sm:p-3">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-2 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <CookingPot className="size-4 text-accent-text" aria-hidden="true" /> Dnes vaříme
        </span>
        <span className="flex items-center gap-1 text-sm text-fg-muted">
          Jídelníček <ChevronRight className="size-5" aria-hidden="true" />
        </span>
      </button>
      <ul className="mt-1 space-y-1">
        {meals.map(({ day, mealType, recipe, cooked }) => (
          <li key={mealType}>
            <button
              type="button"
              onClick={() => onOpenMeal(day, mealType)}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="w-16 shrink-0 text-fg-muted">{mealType}</span>
              <span className={`min-w-0 flex-1 break-words ${cooked ? 'text-fg-muted line-through' : 'font-medium'}`}>{recipe.name}</span>
              {cooked ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="uvařeno" /> : <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
