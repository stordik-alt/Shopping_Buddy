export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary p-1 shadow-sm ring-1 ring-primary/10">
        {/* eslint-disable-next-line @next/next/no-img-element -- approved static brand asset */}
        <img src="/brand/anitka-avatar.png" alt="" width={36} height={36} className="h-full w-full rounded-xl object-cover" />
      </div>
      {!compact && (
        <div className="min-w-0">
          <span className="block text-[1.05rem] font-bold tracking-[-0.02em] text-primary">ANITKA</span>
          <span className="block text-xs font-medium uppercase tracking-[0.12em] text-fg-muted">Rodinný nákup</span>
        </div>
      )}
    </div>
  )
}
