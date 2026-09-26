import { gzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import {
  fetchAlbertHypermarkets,
  parseAlbertHypermarketUrls,
  parseAlbertStorePage,
  planAlbertFormats,
  type AlbertBranch,
  type AlbertHypermarket,
} from '@/lib/stores/albert-formats'
import { chainFamily } from '@/lib/stores/chain-family'

// Fixtures follow albert.cz as read on 2026-09-25: the store sitemap and a store page's
// server-rendered details (Hypermarket Brno, Centrum Vídeňská).

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?><urlset>
<url><loc>https://www.albert.cz/nase-prodejny/supermarket-brno-bohunice-dlouha</loc></url>
<url><loc>https://www.albert.cz/nase-prodejny/hypermarket-brno-centrum-videnska</loc></url>
<url><loc>https://www.albert.cz/nase-prodejny/hypermarket-benesov-cervene-vrsky</loc></url>
</urlset>`

const storePage = (type: string) =>
  `<script>{"openGraphTitle":"${type} Brno, Centrum Vídeňská | Albert","storeTypeName":"${type}","geoPoint":{"__typename":"GeoPoint","latitude":49.1765,"longitude":16.5973},"address":{"__typename":"StoreDetailsAddressData","postalCode":"63900","line1":"Vídeňská 815/89a","line2":null,"town":"Brno","houseNumberName":null}}</script>`

const VIDENSKA_URL = 'https://www.albert.cz/nase-prodejny/hypermarket-brno-centrum-videnska'
const VIDENSKA: AlbertHypermarket = { url: VIDENSKA_URL, lat: 49.1765, lng: 16.5973, street: 'Vídeňská 815/89a', town: 'Brno' }

const branch = (id: string, extra: Partial<AlbertBranch> = {}): AlbertBranch => ({
  id,
  chain: 'Albert',
  address: 'Vídeňská 815/89a, 639 00 Brno',
  city: 'Brno',
  lat: 49.1766,
  lng: 16.5974,
  ...extra,
})

describe('parseAlbertHypermarketUrls', () => {
  it('lists the hypermarket pages only', () => {
    expect(parseAlbertHypermarketUrls(SITEMAP)).toEqual([VIDENSKA_URL, 'https://www.albert.cz/nase-prodejny/hypermarket-benesov-cervene-vrsky'])
  })
})

describe('parseAlbertStorePage', () => {
  it('reads a hypermarket GPS point and address', () => {
    expect(parseAlbertStorePage(VIDENSKA_URL, storePage('Hypermarket'))).toEqual(VIDENSKA)
  })

  it('ignores a page that is not a hypermarket or lacks the details', () => {
    expect(parseAlbertStorePage(VIDENSKA_URL, storePage('Supermarket'))).toBeNull()
    expect(parseAlbertStorePage(VIDENSKA_URL, '<html>Stránka nenalezena</html>')).toBeNull()
    expect(parseAlbertStorePage(VIDENSKA_URL, storePage('Hypermarket').replace('"line1":"Vídeňská 815/89a"', '"line1":null'))).toBeNull()
  })
})

describe('fetchAlbertHypermarkets', () => {
  it('reads the gzip sitemap and each hypermarket page, counting pages it cannot read', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith('.xml.gz')) return new Response(gzipSync(SITEMAP))
      if (url === VIDENSKA_URL) return new Response(storePage('Hypermarket'))
      return new Response('', { status: 404 })
    })
    expect(await fetchAlbertHypermarkets({ fetch, pauseMs: 0 })).toEqual({ hypermarkets: [VIDENSKA], unreadable: 1 })
  })

  it('fails when the sitemap lists no hypermarkets', async () => {
    const fetch = vi.fn(async () => new Response('<urlset></urlset>'))
    await expect(fetchAlbertHypermarkets({ fetch, pauseMs: 0 })).rejects.toThrow('lists no hypermarkets')
  })
})

describe('planAlbertFormats', () => {
  it('moves the Albert branch standing at a hypermarket', () => {
    expect(planAlbertFormats([VIDENSKA], [branch('a'), branch('far', { lat: 49.2, address: 'Jinde 1' })])).toEqual({ move: ['a'], alreadyMoved: 0, blocked: [], unmatched: [] })
  })

  it('matches a branch without GPS (from a receipt) by street and town', () => {
    const plan = planAlbertFormats([VIDENSKA], [branch('receipt', { lat: null, lng: null, address: 'vídeňská 815/89a', city: 'Brno' })])
    expect(plan.move).toEqual(['receipt'])
  })

  it('does not move a branch of another retailer or one already moved', () => {
    const plan = planAlbertFormats([VIDENSKA], [branch('lidl', { chain: 'Lidl' }), branch('done', { chain: 'Albert Hypermarket' })])
    expect(plan).toEqual({ move: [], alreadyMoved: 1, blocked: [], unmatched: [] })
  })

  it('gives a hypermarket its nearest branch only', () => {
    const plan = planAlbertFormats([VIDENSKA], [branch('near'), branch('nearer', { lat: 49.1765, lng: 16.5973 })])
    expect(plan.move).toEqual(['nearer'])
  })

  it('reports a hypermarket no branch matches', () => {
    expect(planAlbertFormats([VIDENSKA], []).unmatched).toEqual([VIDENSKA])
  })

  // Regression 2026-09-26: the same shop imported twice — one copy already a hypermarket (no GPS, from
  // a receipt), the other a new "Albert" point nearer the store. Moving the second hit the unique
  // (chain, address, city) index and failed the whole import.
  it('does not move a branch onto an address the hypermarket chain already holds', () => {
    const plan = planAlbertFormats([VIDENSKA], [branch('copy'), branch('existing', { chain: 'Albert Hypermarket', lat: null, lng: null })])
    expect(plan.move).toEqual([])
    expect(plan.blocked).toEqual(['copy'])
  })
})

describe('chainFamily', () => {
  it('groups Albert hypermarkets with Albert', () => {
    expect(chainFamily('Albert Hypermarket')).toBe('Albert')
    expect(chainFamily('Albert')).toBe('Albert')
    expect(chainFamily('Lidl')).toBe('Lidl')
  })
})
