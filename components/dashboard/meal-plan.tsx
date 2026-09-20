import { useState } from 'react'

const MEALS = [
  { day: 'Pátek', meal: 'Kuřecí stir-fry', detail: 'kuřecí prsa · rýže · paprika' },
  { day: 'Sobota', meal: 'Těstoviny s rajčaty', detail: 'těstoviny · rajčata · parmazán' },
  { day: 'Neděle', meal: 'Zeleninová polévka', detail: 'mrkev · brambory · celer' },
]

const MEAL_INGREDIENTS = ['Rýže', 'Paprika', 'Těstoviny', 'Rajčata', 'Parmazán', 'Mrkev', 'Brambory', 'Celer']

export function MealPlan({ onAddIngredients }: { onAddIngredients: (ingredients: string[]) => void }) {
  const [added, setAdded] = useState(false)

  function addAll() {
    onAddIngredients(MEAL_INGREDIENTS)
    setAdded(true)
  }

  return (
    <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Plán jídel na víkend</p>
          <p className="mt-1 text-sm text-muted-foreground">Jednoduchý plán podle vašeho seznamu a rozpočtu.</p>
        </div>
        <button onClick={addAll} className="shrink-0 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
          {added ? 'Přidáno do nákupu' : 'Přidat suroviny'}
        </button>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {MEALS.map((meal) => (
          <div key={meal.day} className="rounded-2xl bg-muted p-4">
            <p className="text-xs font-medium text-primary">{meal.day}</p>
            <p className="mt-2 text-sm font-semibold">{meal.meal}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{meal.detail}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
