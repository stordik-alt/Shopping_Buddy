import { money, shortDate } from '@/lib/format'
import { priceSteps, priceTrendSummary } from '@/lib/price-trend'
import type { PricePoint } from '@/lib/prices'

// A small step line of one store's recorded regular prices for a product, so the household can see
// at a glance whether today's price is high or low for that store. Single series: it takes the
// surrounding text colour (no legend needed), 2px line, ≥8px markers at each price change with a
// native hover tooltip, and a text summary that carries the same information for screen readers.
// Shown only when the price actually changed at least once.

const WIDTH = 140
const HEIGHT = 32
const PAD = 5

function dayNumber(isoDate: string): number {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  return Date.UTC(year, month - 1, day) / 86_400_000
}

export function PriceSparkline({ point, today }: { point: PricePoint; today: string }) {
  const steps = priceSteps(point)
  const summary = priceTrendSummary(steps)
  if (!summary) return null

  const start = dayNumber(steps[0].date)
  const end = Math.max(dayNumber(today), dayNumber(steps[steps.length - 1].date))
  const x = (date: string) => PAD + ((dayNumber(date) - start) / Math.max(1, end - start)) * (WIDTH - 2 * PAD)
  const y = (price: number) =>
    summary.max === summary.min ? HEIGHT / 2 : PAD + ((summary.max - price) / (summary.max - summary.min)) * (HEIGHT - 2 * PAD)

  // Step-after: a price holds until the next change, and the last one until today.
  let d = `M ${x(steps[0].date)} ${y(steps[0].price)}`
  for (const step of steps.slice(1)) d += ` H ${x(step.date)} V ${y(step.price)}`
  d += ` H ${WIDTH - PAD}`

  const label = `Vývoj ceny: nejnižší ${money(summary.min)}, nejvyšší ${money(summary.max)}, teď ${money(summary.current)}`

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="price-trend">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} role="img" aria-label={label} className="max-w-full shrink-0 overflow-visible">
        <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.7} />
        {steps.map((step) => (
          <g key={step.date}>
            <circle cx={x(step.date)} cy={y(step.price)} r={4} fill="currentColor" stroke="var(--background)" strokeWidth={2} />
            {/* A larger invisible target than the dot, so the tooltip is easy to hit on a phone. */}
            <circle cx={x(step.date)} cy={y(step.price)} r={10} fill="transparent">
              <title>{`${shortDate(step.date)}: ${money(step.price)}`}</title>
            </circle>
          </g>
        ))}
      </svg>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {summary.atLowest ? 'Nejnižší zaznamenaná cena' : `Nejníže ${money(summary.min)}`} · od {shortDate(steps[0].date)}
      </p>
    </div>
  )
}
