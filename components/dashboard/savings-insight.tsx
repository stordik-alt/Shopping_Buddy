import { ArrowUpRight, Sparkles } from 'lucide-react'

export function SavingsInsight({ remaining, onAi }: { remaining: number; onAi: () => void }) {
  const weekly = Math.round(remaining / 2.3)
  return (
    <section className="surface p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
            <Sparkles />
          </div>
          <div>
            <p className="text-sm font-semibold">Doporučení pro tento týden</p>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Podle vašeho rozpočtu můžete na další nákup utratit přibližně{' '}
              <span className="font-semibold text-foreground">{weekly.toLocaleString('cs-CZ')} Kč</span> a stále si ponechat rezervu.
            </p>
          </div>
        </div>
        <button onClick={onAi} className="flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-border px-3 py-2 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Naplánovat s AI <ArrowUpRight className="ml-1 inline h-4 w-4" />
        </button>
      </div>
    </section>
  )
}
