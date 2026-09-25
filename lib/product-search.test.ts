import { describe, expect, it } from 'vitest'
import {
  SEARCH_ACCENTED,
  SEARCH_PLAIN,
  groupHitsByChain,
  hitPrice,
  hitUnitPrice,
  likePattern,
  normalizeSearchText,
  isDirectMatch,
  scoreMatch,
  searchStem,
  wordRelation,
  searchTokens,
  splitTokens,
  toComparableUnit,
  type ProductSearchHit,
} from '@/lib/product-search'

const hit = (overrides: Partial<ProductSearchHit> = {}): ProductSearchHit => ({
  productId: 'p1',
  name: 'Mléko',
  category: 'Potraviny',
  storeId: 'lidl',
  chain: 'Lidl',
  regularPrice: 20,
  dealPrice: null,
  dealValidUntil: null,
  unit: 'l',
  unitPrice: 20,
  observedAt: '2026-09-24',
  score: 4,
  direct: true,
  ...overrides,
})

describe('the accent map', () => {
  it('maps every accented character to exactly one plain character', () => {
    expect([...SEARCH_ACCENTED].length).toBe([...SEARCH_PLAIN].length)
  })

  it('covers the Czech alphabet in both cases', () => {
    const czech = 'áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ'
    expect(normalizeSearchText(czech)).toBe('acdeeinorstuuyzacdeeinorstuuyz')
  })
})

describe('normalizeSearchText', () => {
  it('lower-cases and removes diacritics', () => {
    expect(normalizeSearchText('Čerstvé MLÉKO Šťavnaté 1,5%')).toBe('cerstve mleko stavnate 1,5%')
  })

  it('leaves plain text, digits and punctuation alone', () => {
    expect(normalizeSearchText('coca-cola 0,5l')).toBe('coca-cola 0,5l')
  })
})

describe('searchTokens', () => {
  it('splits and normalizes a query', () => {
    expect(searchTokens('  Mléko   polotučné ')).toEqual(['mleko', 'polotucne'])
  })

  it('keeps a decimal amount and a percentage intact', () => {
    expect(searchTokens('mléko 1,5%')).toEqual(['mleko', '1,5%'])
  })

  it('drops one-letter noise but keeps a single digit', () => {
    expect(searchTokens('a mléko s 2')).toEqual(['mleko', '2'])
  })

  it('strips surrounding punctuation and removes duplicates', () => {
    expect(searchTokens('(mleko), mleko!')).toEqual(['mleko'])
  })

  it('uses at most six tokens and a bounded query length', () => {
    expect(searchTokens('aa bb cc dd ee ff gg hh')).toHaveLength(6)
    expect(searchTokens('x'.repeat(5000)).join('').length).toBeLessThanOrEqual(80)
  })

  it('returns nothing for an empty or symbol-only query', () => {
    expect(searchTokens('')).toEqual([])
    expect(searchTokens('  ?! ')).toEqual([])
  })
})

describe('likePattern', () => {
  it('wraps the token for a substring match', () => {
    expect(likePattern('mleko')).toBe('%mleko%')
  })

  it('escapes LIKE wildcards so user input cannot act as one', () => {
    expect(likePattern('50%')).toBe('%50\\%%')
    expect(likePattern('a_b')).toBe('%a\\_b%')
    expect(likePattern('a\\b')).toBe('%a\\\\b%')
  })
})

describe('word forms', () => {
  it('stems only words long enough to stay specific', () => {
    expect(searchStem('rohliky')).toBe('rohlik')
    expect(searchStem('vejce')).toBe('vejc')
    expect(searchStem('jablka')).toBe('jablk')
    expect(searchStem('chleb')).toBe('chleb')
    expect(searchStem('maso')).toBe('maso') // "mas" would also find "maslo"
    expect(searchStem('syr')).toBe('syr')
    expect(searchStem('1,5%')).toBe('1,5%')
  })

  it('tells an inflected form from a derived word', () => {
    expect(wordRelation('mleko', 'mleko')).toBe('exact')
    expect(wordRelation('rohlik', 'rohliky')).toBe('form')
    expect(wordRelation('jablko', 'jablka')).toBe('form')
    expect(wordRelation('vejcem', 'vejce')).toBe('form')
    expect(wordRelation('syry', 'syr')).toBe('form')
    expect(wordRelation('rajcata', 'rajce')).toBe('form')
    expect(wordRelation('bananove', 'banany')).toBe('derived')
    expect(wordRelation('kureci', 'kure')).toBe('derived')
    expect(wordRelation('syrovy', 'syr')).toBe('derived')
    expect(wordRelation('cokoladovemleko', 'mleko')).toBe('inside')
    expect(wordRelation('maslo', 'maso')).toBeNull()
  })
})

describe('isDirectMatch', () => {
  it('finds the product under another form of the word', () => {
    expect(isDirectMatch('rohlik tukovy 43 g', ['rohliky'])).toBe(true)
    expect(isDirectMatch('jablka cervena', ['jablko'])).toBe(true)
    expect(isDirectMatch('rajcata cherry', ['rajce'])).toBe(true)
  })

  it('does not take a product named after the item for the item itself', () => {
    expect(isDirectMatch('bananove chipsy', ['banany'])).toBe(false)
    expect(isDirectMatch('rajcatovy protlak', ['rajcata'])).toBe(false)
    expect(isDirectMatch('kureci nugety', ['kure'])).toBe(false)
    expect(isDirectMatch('vajecne testoviny', ['vejce'])).toBe(false)
  })

  it('is the product when the words come before any linking word', () => {
    expect(isDirectMatch('vejce m 10 ks', ['vejce'])).toBe(true)
    expect(isDirectMatch('cerstva vejce z podestylky', ['vejce'])).toBe(true)
    expect(isDirectMatch('mleko na vareni', ['mleko'])).toBe(true)
    expect(isDirectMatch('tunak v oleji', ['tunak'])).toBe(true)
    expect(isDirectMatch('jogurty bile', ['jogurt'])).toBe(true)
    expect(isDirectMatch('sul a pepr', ['pepr'])).toBe(true) // "a" joins two products, it does not describe one
  })

  it('is only a mention when a word appears only after s/se/z/ze/na/v/do/pro/bez…', () => {
    expect(isDirectMatch('polevka hovezi s vejcem', ['vejce'])).toBe(false)
    expect(isDirectMatch('pizza se syrem', ['syr'])).toBe(false)
    expect(isDirectMatch('koreni na kure', ['kure'])).toBe(false)
    expect(isDirectMatch('tunak v oleji', ['olej'])).toBe(false)
    expect(isDirectMatch('omacka do testovin', ['testovin'])).toBe(false)
    expect(isDirectMatch('krmivo pro psy s kuretem', ['kure'])).toBe(false)
    expect(isDirectMatch('jogurt bez laktozy', ['laktozy'])).toBe(false)
  })

  it('needs every token in the product part of the name', () => {
    expect(isDirectMatch('mleko polotucne 1,5%', ['mleko', 'polotucne'])).toBe(true)
    expect(isDirectMatch('kase s mlekem a ovocem', ['kase', 'mleko'])).toBe(false)
  })

  it('matches a token with punctuation inside as a phrase', () => {
    expect(isDirectMatch('coca-cola 1,5 l', ['coca-cola'])).toBe(true)
    expect(isDirectMatch('rum s coca-cola', ['coca-cola'])).toBe(false)
    expect(scoreMatch('__test a_b xyz', ['a_b'])).toBeGreaterThan(0)
    expect(scoreMatch('mleko 1,5%', ['1,5%'])).toBeGreaterThan(0)
  })

  it('does not treat a leading "s" or punctuation as a linking word', () => {
    expect(isDirectMatch('s-budget vejce', ['vejce'])).toBe(true)
    expect(isDirectMatch('vejce, 10 ks (m)', ['vejce'])).toBe(true)
  })
})

describe('scoreMatch', () => {
  it('ranks every product that is the item above anything that only mentions it', () => {
    const product = scoreMatch('bio vejce z volneho chovu 6 ks', ['vejce'])
    const mention = scoreMatch('vejce', ['vejce']) // exact name: highest
    const soup = scoreMatch('polevka s vejcem', ['vejce'])
    expect(mention).toBeGreaterThan(product)
    expect(product).toBeGreaterThan(soup)
    expect(soup).toBeGreaterThan(0) // still findable by an explicit search
  })

  it('is 0 when any token is missing', () => {
    expect(scoreMatch('cerstve mleko 1,5%', ['mleko', 'chleb'])).toBe(0)
    expect(scoreMatch('cerstve mleko', [])).toBe(0)
  })

  it('finds a token anywhere in the name', () => {
    expect(scoreMatch('cerstve mleko 1,5%', ['mleko'])).toBeGreaterThan(0)
  })

  it('ranks a whole word above a prefix above the middle of a word', () => {
    const whole = scoreMatch('mleko cerstve', ['mleko'])
    const prefix = scoreMatch('mlekovar cerny', ['mleko'])
    const inner = scoreMatch('cokoladovemleko', ['mleko'])
    expect(whole).toBeGreaterThan(prefix)
    expect(prefix).toBeGreaterThan(inner)
    expect(inner).toBeGreaterThan(0)
  })

  it('prefers a name that starts with the first token, and an exact name most', () => {
    expect(scoreMatch('mleko cerstve', ['mleko'])).toBeGreaterThan(scoreMatch('cerstve mleko', ['mleko']))
    expect(scoreMatch('mleko', ['mleko'])).toBeGreaterThan(scoreMatch('mleko cerstve', ['mleko']))
  })

  it('requires all tokens and rewards each of them', () => {
    expect(scoreMatch('mleko polotucne 1l', ['mleko', 'polotucne'])).toBeGreaterThan(scoreMatch('mleko polotucne 1l', ['mleko']))
  })
})

describe('splitTokens', () => {
  it('requires words and treats tokens with a digit as optional sizes', () => {
    expect(splitTokens(['mleko', '1l'])).toEqual({ required: ['mleko'], optional: ['1l'] })
    expect(splitTokens(['maslo', '250', 'g'])).toEqual({ required: ['maslo', 'g'], optional: ['250'] })
    expect(splitTokens(['jogurt', '1,5%'])).toEqual({ required: ['jogurt'], optional: ['1,5%'] })
  })

  it('requires every token when the query has no word at all', () => {
    expect(splitTokens(['250'])).toEqual({ required: ['250'], optional: [] })
    expect(splitTokens(['1l', '2'])).toEqual({ required: ['1l', '2'], optional: [] })
  })
})

describe('scoreMatch with optional tokens', () => {
  it('does not require an optional token, but ranks a name that has it higher', () => {
    const withSize = scoreMatch('mleko polotucne 1l', ['mleko'], ['1l'])
    const withoutSize = scoreMatch('mleko polotucne', ['mleko'], ['1l'])
    expect(withoutSize).toBeGreaterThan(0)
    expect(withSize).toBeGreaterThan(withoutSize)
  })

  it('is still 0 when a required word is missing, whatever the optional tokens say', () => {
    expect(scoreMatch('chleb 1l', ['mleko'], ['1l'])).toBe(0)
  })
})

describe('toComparableUnit', () => {
  it('turns a price per gram into per kilogram and per millilitre into per litre', () => {
    expect(toComparableUnit('g', 0.1)).toEqual({ unit: 'kg', unitPrice: 100 })
    expect(toComparableUnit('ml', 0.0425)).toEqual({ unit: 'l', unitPrice: 42.5 })
  })

  it('leaves kg, l and ks alone', () => {
    expect(toComparableUnit('kg', 199.5)).toEqual({ unit: 'kg', unitPrice: 199.5 })
    expect(toComparableUnit('l', 24.9)).toEqual({ unit: 'l', unitPrice: 24.9 })
    expect(toComparableUnit('ks', 5)).toEqual({ unit: 'ks', unitPrice: 5 })
  })
})

describe('hitPrice', () => {
  it('is the promotional price when there is one, else the regular price', () => {
    expect(hitPrice(hit({ regularPrice: 30, dealPrice: 24 }))).toBe(24)
    expect(hitPrice(hit({ regularPrice: 30, dealPrice: null }))).toBe(30)
  })
})

describe('hitUnitPrice', () => {
  it('is the unit price when there is no promotion', () => {
    expect(hitUnitPrice(hit({ regularPrice: 30, dealPrice: null, unitPrice: 30 }))).toBe(30)
  })

  it('scales the unit price by the promotion, since it is the same package at a lower price', () => {
    // 1,5 l at 30 Kč = 20 Kč/l; on promotion at 24 Kč = 16 Kč/l.
    expect(hitUnitPrice(hit({ regularPrice: 30, dealPrice: 24, unitPrice: 20 }))).toBe(16)
  })

  it('rounds to whole haléře and never divides by zero', () => {
    expect(hitUnitPrice(hit({ regularPrice: 29.9, dealPrice: 19.9, unitPrice: 149.5 }))).toBe(99.5)
    expect(hitUnitPrice(hit({ regularPrice: 0, dealPrice: 10, unitPrice: 5 }))).toBe(5)
  })
})

describe('groupHitsByChain', () => {
  const hits = [
    hit({ productId: 'a', name: 'Mléko B', storeId: 'lidl', chain: 'Lidl', score: 4, unitPrice: 25 }),
    hit({ productId: 'b', name: 'Mléko A', storeId: 'lidl', chain: 'Lidl', score: 8, unitPrice: 30 }),
    hit({ productId: 'c', name: 'Mléko C', storeId: 'albert', chain: 'Albert', score: 4, unitPrice: 22 }),
    hit({ productId: 'd', name: 'Mléko D', storeId: 'lidl', chain: 'Lidl', score: 4, unitPrice: 20 }),
  ]

  it('groups per chain, chains in alphabetical order', () => {
    expect(groupHitsByChain(hits, 10).map((group) => group.chain)).toEqual(['Albert', 'Lidl'])
  })

  it('orders a chain\'s hits by score, then unit price, then name', () => {
    const lidl = groupHitsByChain(hits, 10).find((group) => group.chain === 'Lidl')!
    expect(lidl.hits.map((entry) => entry.productId)).toEqual(['b', 'd', 'a']) // score 8; then 4 by unit price 20 < 25
  })

  it('limits the hits shown per chain but still reports how many matched', () => {
    const lidl = groupHitsByChain(hits, 2).find((group) => group.chain === 'Lidl')!
    expect(lidl.hits).toHaveLength(2)
    expect(lidl.totalMatches).toBe(3)
  })

  it('returns nothing for no hits and shows nothing for a zero limit', () => {
    expect(groupHitsByChain([], 5)).toEqual([])
    expect(groupHitsByChain(hits, 0).every((group) => group.hits.length === 0)).toBe(true)
  })

  it('does not mutate its input', () => {
    const copy = hits.map((entry) => ({ ...entry }))
    groupHitsByChain(hits, 1)
    expect(hits).toEqual(copy)
  })
})
