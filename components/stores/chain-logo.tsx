import { chainFamily } from '@/lib/stores/chain-family'

// Logos live in public/logos (see the README there for source and licence of each file). Only chains
// with a file listed here get an <img>; the others get a coloured badge, so there is never a broken
// image request. To add a logo, put `<name>.svg` in public/logos and list it here.
const LOGO_FILES: Record<string, string> = {
  Lidl: '/logos/lidl.svg',
  Kaufland: '/logos/kaufland.svg',
  Billa: '/logos/billa.svg',
  Penny: '/logos/penny.svg',
}

// Chain names that are too long for a tile, as shown on it. The full name stays wherever there is room.
const SHORT_NAME: Record<string, string> = {
  'Albert Hypermarket': 'Albert Hyper',
  'Dr Max LÉKÁRNA': 'Dr Max',
}

/** The chain's name as written on a tile. */
export function chainShortName(chain: string): string {
  return SHORT_NAME[chain] ?? chain
}

// Background of the badge shown for a chain without a logo file.
const CHAIN_COLOR: Record<string, string> = {
  Lidl: 'bg-[#d7f36b]',
  Albert: 'bg-[#f4b183]',
  Kaufland: 'bg-[#b9d8f5]',
  Billa: 'bg-[#f3c0d3]',
  Penny: 'bg-[#f6d38b]',
  JIP: 'bg-[#c9b8ef]',
}

/** The chain's logo, or — without a logo file — a coloured badge with its first letters. Purely
 *  decorative: the chain's name is always written next to it, so it has no alt text of its own.
 *  Albert's hypermarkets use Albert's logo (same retailer). */
export function ChainLogo({ chain, className = 'size-11' }: { chain: string; className?: string }) {
  const family = chainFamily(chain)
  const src = LOGO_FILES[family]
  if (src) {
    return (
      // A plain <img>: the files are small static SVGs, which next/image would not optimise.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" aria-hidden="true" className={`${className} shrink-0 rounded-xl bg-white object-contain p-1`} />
    )
  }
  return (
    <span className={`${className} flex shrink-0 items-center justify-center rounded-xl text-xs font-bold ${CHAIN_COLOR[family] ? `${CHAIN_COLOR[family]} text-neutral-900` : 'bg-muted text-foreground'}`} aria-hidden="true">
      {chain.slice(0, 3)}
    </span>
  )
}
