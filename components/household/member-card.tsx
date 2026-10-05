import { Utensils, X } from 'lucide-react'
import { dietLabels, NO_DIET } from '@/lib/diet'
import type { HouseholdMember } from '@/lib/types'

export function MemberCard({ member, onRemove, onEditDiet }: { member: HouseholdMember; onRemove: () => void; onEditDiet?: () => void }) {
  const diet = dietLabels(member.diet ?? NO_DIET)
  return (
    <div className="rounded-2xl bg-muted p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold">
            {member.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="break-words text-sm font-medium">{member.name}</p>
            <p className="break-words text-xs text-muted-foreground">{member.role} · {member.age} let</p>
          </div>
        </div>
        <button
          aria-label={`Odebrat ${member.name}`}
          onClick={onRemove}
          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {(member.favoriteFoods.length > 0 || member.dislikedFoods.length > 0 || member.allergies.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {member.favoriteFoods.map((food) => (
            <span key={food} className="max-w-full rounded-full bg-accent-subtle px-2 py-1 text-xs font-medium text-accent-text break-words">
              Oblíbené: {food}
            </span>
          ))}
          {member.dislikedFoods.map((food) => (
            <span key={food} className="max-w-full rounded-full bg-background px-2 py-1 text-xs font-medium text-muted-foreground break-words">
              Nechce: {food}
            </span>
          ))}
          {member.allergies.map((allergy) => (
            <span key={allergy} className="max-w-full rounded-full bg-destructive-subtle px-2 py-1 text-xs font-medium text-destructive break-words">
              Alergie: {allergy}
            </span>
          ))}
        </div>
      )}
      {onEditDiet && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {diet.map((label) => (
            <span key={label} className="max-w-full break-words rounded-full bg-background px-2 py-1 text-xs font-medium">
              {label}
            </span>
          ))}
          <button
            type="button"
            onClick={onEditDiet}
            className="flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-xs font-medium text-accent-text hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Utensils className="size-3.5" aria-hidden="true" /> {diet.length > 0 ? 'Upravit stravování' : 'Vyplnit stravování'}
          </button>
        </div>
      )}
    </div>
  )
}
