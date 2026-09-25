// Shown while the home page's server render (session, household, prices) is still running, instead
// of a blank screen. It mirrors the real layout — header, the quick-add bar and a few cards — so the
// page does not jump when the content arrives. Purely presentational: no data, no client code.
export default function Loading() {
  return (
    <div className="min-h-screen bg-background" aria-busy="true" aria-live="polite">
      <span className="sr-only">Načítám…</span>
      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-6 sm:px-8" aria-hidden="true">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-3 w-24 animate-pulse rounded-full bg-muted" />
            <div className="h-6 w-44 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="size-10 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="surface h-14 animate-pulse" />
        <div className="surface h-32 animate-pulse" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="surface h-28 animate-pulse" />
          <div className="surface h-28 animate-pulse" />
        </div>
        <div className="surface h-40 animate-pulse" />
      </div>
    </div>
  )
}
