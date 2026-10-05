import { ChevronRight, ClipboardCheck, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardButton } from '@/components/ui/card'
import { countLabel } from '@/lib/format'

/** Zásoby on Domů: only how many items wait for a check and the way straight into the check — no
 *  list of items (owner, 2026-10-05). With nothing to check it is a single quiet line to Zásoby. */
export function PantryCheckCard({ toCheck, onCheck, onOpen }: { toCheck: number; onCheck: () => void; onOpen: () => void }) {
  if (toCheck === 0) {
    return (
      <CardButton tone="muted" onClick={onOpen} className="flex items-center gap-3 py-3 sm:py-3">
        <Package className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">Zásoby</span>
          <span className="text-fg-secondary"> · nic ke kontrole</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-fg-muted" aria-hidden="true" />
      </CardButton>
    )
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 py-3 sm:py-4">
      <p className="flex min-w-0 items-center gap-3 text-sm">
        <Package className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
        <span>
          <span className="font-semibold">Zásoby ke kontrole</span>
          <span className="block text-fg-secondary">{countLabel(toCheck, 'položka čeká', 'položky čekají', 'položek čeká')} na potvrzení, jestli je ještě máte</span>
        </span>
      </p>
      <Button size="lg" onClick={onCheck}>
        <ClipboardCheck aria-hidden="true" /> Zkontrolovat zásoby
      </Button>
    </Card>
  )
}
