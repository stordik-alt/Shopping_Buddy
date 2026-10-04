import { ChevronLeft, ChevronRight } from 'lucide-react'

// The "‹ page/total ›" control shared by every paged list (the Akce tab's deals, the Zásoby
// location's items, the store directory's branches) — one copy per CLAUDE.md section 6.
export function Pager({ page, totalPages, busy = false, onChange, label }: { page: number; totalPages: number; busy?: boolean; onChange: (page: number) => void; label: string }) {
  return (
    <nav aria-label={label} className="flex items-center justify-center gap-4">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1 || busy}
        aria-label="Předchozí stránka"
        type="button"
        className="flex size-11 items-center justify-center rounded-full border border-border bg-card hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
      </button>
      <span className="min-w-14 text-center text-sm font-medium tabular-nums" aria-live="polite">
        {page}/{totalPages}
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages || busy}
        aria-label="Další stránka"
        type="button"
        className="flex size-11 items-center justify-center rounded-full border border-border bg-card hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
      >
        <ChevronRight className="size-5" aria-hidden="true" />
      </button>
    </nav>
  )
}
