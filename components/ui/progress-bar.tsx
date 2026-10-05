import { cn } from '@/lib/utils'

const FILL = { accent: 'bg-accent-solid', success: 'bg-success', warning: 'bg-warning', danger: 'bg-destructive' } as const

/** Display-only progress track. The value is clamped so an overspent budget does not draw outside its
 *  track; the real numbers (and any warning) belong in the caller's text, not in this bar. */
function ProgressBar({ value, max = 100, label, tone = 'accent', className }: { value: number; max?: number; label: string; tone?: keyof typeof FILL; className?: string }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0
  return (
    // Spans, so the bar is valid inside a CardButton (a button allows phrasing content only).
    <span role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className={cn('block h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <span className={cn('block h-full rounded-full transition-[width]', FILL[tone])} style={{ width: `${percent}%` }} />
    </span>
  )
}

export { ProgressBar }
