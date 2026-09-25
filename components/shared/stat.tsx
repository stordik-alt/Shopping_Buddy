export function Stat({ label, value, icon, hint }: { label: string; value: string; icon: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="surface p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 text-muted-foreground">
        <span className="min-w-0 text-xs leading-relaxed">{label}</span>
        <span className="shrink-0" aria-hidden="true">{icon}</span>
      </div>
      <p className="mt-3 text-xl font-semibold tracking-tight break-words">{value}</p>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}
