import { IDEA_STATUS_LABEL, type IdeaStatus } from '@/lib/ideas'

const STATUS_STYLE: Record<IdeaStatus, string> = {
  new: 'bg-muted text-muted-foreground',
  planned: 'bg-primary/15 text-primary',
  done: 'bg-success/15 text-success',
  declined: 'bg-destructive/10 text-destructive',
}

export function IdeaStatusBadge({ status }: { status: IdeaStatus }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status]}`}>{IDEA_STATUS_LABEL[status]}</span>
}
