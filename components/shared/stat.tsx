export function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3 text-muted-foreground">
        <span className="min-w-0 text-xs leading-relaxed">{label}</span>
        <span className="shrink-0" aria-hidden="true">{icon}</span>
      </div>
      <p className="mt-4 text-xl font-semibold break-words">{value}</p>
    </div>
  )
}
