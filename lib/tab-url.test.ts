import { describe, expect, it } from 'vitest'
import { PANTRY_CHECK_HREF, tabFromSlug, tabHref } from '@/lib/tab-url'
import type { Tab } from '@/lib/types'

const ALL_TABS: Tab[] = ['Domů', 'Nákup', 'Zásoby', 'Obchody', 'Rozpočet', 'AI', 'Profil']

describe('tab URLs', () => {
  it('round-trips every section through its address', () => {
    for (const tab of ALL_TABS) {
      const slug = new URL(tabHref(tab), 'https://app.test').searchParams.get('tab')
      expect(tabFromSlug(slug, { aiEnabled: true })).toBe(tab)
    }
  })

  it('uses the bare root for Domů and ASCII slugs for the rest', () => {
    expect(tabHref('Domů')).toBe('/')
    expect(tabHref('Rozpočet')).toBe('/?tab=rozpocet')
    expect(tabHref('Zásoby')).toBe('/?tab=zasoby')
  })

  it('opens Domů for a missing or unknown value', () => {
    expect(tabFromSlug(null, { aiEnabled: false })).toBe('Domů')
    expect(tabFromSlug('', { aiEnabled: false })).toBe('Domů')
    expect(tabFromSlug('neexistuje', { aiEnabled: false })).toBe('Domů')
  })

  it('accepts a differently cased value', () => {
    expect(tabFromSlug(' Nakup ', { aiEnabled: false })).toBe('Nákup')
  })

  it('does not open the hidden AI assistant through its address', () => {
    expect(tabFromSlug('ai', { aiEnabled: false })).toBe('Domů')
    expect(tabFromSlug('ai', { aiEnabled: true })).toBe('AI')
  })
})

describe('PANTRY_CHECK_HREF', () => {
  it('opens Zásoby with the check', () => {
    expect(PANTRY_CHECK_HREF).toBe('/?tab=zasoby&kontrola=1')
    expect(tabFromSlug(new URL(PANTRY_CHECK_HREF, 'https://x').searchParams.get('tab'), { aiEnabled: false })).toBe('Zásoby')
  })
})
