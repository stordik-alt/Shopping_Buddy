import { CheckCircle2, ChevronRight, CookingPot } from 'lucide-react'
import { CardButton, CardHeader } from '@/components/ui/card'
import type { MealType, Recipe } from '@/lib/meal-plans'

/** "Dnes vaříme": today's meals from the saved weekly plan (`todaysMeals`), one tap from the meal plan.
 *  Without a plan for today it is a single quiet line inviting the household to plan the week. */
export function TodayMeals({ meals, onOpen }: { meals: { mealType: MealType; recipe: Recipe; cooked: boolean }[]; onOpen: () => void }) {
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
    <CardButton onClick={onOpen} aria-label={`Dnes vaříme: ${meals.map((meal) => `${meal.mealType} ${meal.recipe.name}`).join(', ')}`}>
      <CardHeader as="span" title="Dnes vaříme" icon={<CookingPot className="size-4" />} action={<ChevronRight className="size-5" />} />
      <span className="mt-3 block space-y-2">
        {meals.map(({ mealType, recipe, cooked }) => (
          <span key={mealType} className="flex items-start gap-3 text-sm">
            <span className="w-16 shrink-0 text-fg-muted">{mealType}</span>
            <span className={`min-w-0 flex-1 break-words ${cooked ? 'text-fg-muted line-through' : 'font-medium'}`}>{recipe.name}</span>
            {cooked && <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="uvařeno" />}
          </span>
        ))}
      </span>
    </CardButton>
  )
}
