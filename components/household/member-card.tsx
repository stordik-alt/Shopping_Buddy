import { X } from 'lucide-react'
import type { HouseholdMember } from '@/lib/types'

export function MemberCard({ member, onRemove }: { member: HouseholdMember; onRemove: () => void }) {
  return (
    <div className="rounded-2xl bg-muted p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold">
            {member.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium">{member.name}</p>
            <p className="text-xs text-muted-foreground">{member.role} · {member.age} let</p>
          </div>
        </div>
        <button aria-label={`Odebrat ${member.name}`} onClick={onRemove} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <X className="h-4 w-4" />
        </button>
      </div>
      {(member.favoriteFoods.length > 0 || member.dislikedFoods.length > 0 || member.allergies.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {member.favoriteFoods.map((food) => (
            <span key={food} className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
              Oblíbené: {food}
            </span>
          ))}
          {member.dislikedFoods.map((food) => (
            <span key={food} className="rounded-full bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground">
              Nechce: {food}
            </span>
          ))}
          {member.allergies.map((allergy) => (
            <span key={allergy} className="rounded-full bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive">
              Alergie: {allergy}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
