import type { Tab } from '@/lib/types'

// Each app section has its own address (`/?tab=nakup`), so the phone's back gesture returns to the
// previous section instead of leaving the app, a reload keeps the section, and a section can be
// linked. The slugs are ASCII so the URL stays readable when shared. Domů is the bare `/`.

const TAB_SLUGS: Record<Tab, string | null> = {
  Domů: null,
  Nákup: 'nakup',
  Zásoby: 'zasoby',
  Obchody: 'obchody',
  Rozpočet: 'rozpocet',
  AI: 'ai',
  Profil: 'profil',
}

/** The section a `tab` query value opens. Unknown or missing values open Domů. The AI assistant is
 *  only reachable when it is enabled (lib/features.ts), so an old or hand-typed link cannot open a
 *  section the app deliberately hides. */
export function tabFromSlug(slug: string | null | undefined, options: { aiEnabled: boolean }): Tab {
  if (!slug) return 'Domů'
  const normalized = slug.trim().toLowerCase()
  for (const [tab, value] of Object.entries(TAB_SLUGS) as [Tab, string | null][]) {
    if (value !== null && value === normalized) return tab === 'AI' && !options.aiEnabled ? 'Domů' : tab
  }
  return 'Domů'
}

/** The address of a section, relative to the app root. */
export function tabHref(tab: Tab): string {
  const slug = TAB_SLUGS[tab]
  return slug ? `/?tab=${slug}` : '/'
}
