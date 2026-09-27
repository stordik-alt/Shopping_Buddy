import { ChevronLeft, ChevronRight } from 'lucide-react'

// The "‹ page/total ›" control shared by every paged list (the Akce tab's deals, the Zásoby
// location's items) — kept in one place per CLAUDE.md section 6 ("do not duplicate business logic
// in multiple places"); the store directory's branch pager predates this and still has its own
// copy, left alone since it isn't part of this change.
export function Pager({ page, totalPages, busy = false, onChange, label }: { page: number; totalPages: number; busy?: boolean; onChange: (page: number) => void; label: string }) {
  return (
    <nav aria-label={label} className="flex items-center justify-center gap-4">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1 || busy}
        aria-label="Předchozí stránka"
        className="flex size-11 items-center justify-center rounded-full border border-border bg-card hover:bg-muted disabled:opacity-40"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <span className="min-w-14 text-center text-sm font-medium tabular-nums" aria-live="polite">
        {page}/{totalPages}
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages || busy}
        aria-label="Další stránka"
        className="flex size-11 items-center justify-center rounded-full border border-border bg-card hover:bg-muted disabled:opacity-40"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </nav>
  )
}
