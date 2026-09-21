export function MemberRow({ initials, name, detail, action }: { initials: string; name: string; detail: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-muted p-3">
      <div className="flex size-9 items-center justify-center rounded-full bg-background text-xs font-semibold">{initials}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      {action}
    </div>
  )
}
