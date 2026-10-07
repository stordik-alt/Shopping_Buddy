import { describe, expect, it, vi } from 'vitest'
import {
  AUTO_ACCEPT_THRESHOLD,
  CONFIDENCE_BY_METHOD,
  classifySubcategory,
  detectChildOriented,
  detectNonInventory,
  guessItemCategory,
  matchProduct,
  type ProductAliasEntry,
} from '@/lib/categorization'
import type { ProductCatalogEntry } from '@/lib/products'

function product(overrides: Partial<ProductCatalogEntry> & { id: string; name: string }): ProductCatalogEntry {
  return { category: 'Potraviny', defaultUnit: 'ks', defaultLocation: null, subcategory: null, isChildOriented: false, isNonInventory: false, ...overrides }
}

const alias = (overrides: Partial<ProductAliasEntry> & { productId: string; normalizedAlias: string }): ProductAliasEntry => ({
  storeId: null,
  confidence: 1,
  ...overrides,
})

describe('matchProduct — priority tiers (spec section 7)', () => {
  const jupik = product({ id: 'jupik', name: 'Jupík 330 ml' })
  const mattoni = product({ id: 'mattoni', name: 'Mattoni' })
  const catalog = [jupik, mattoni]

  it('tier 1: exact catalog product name (case/diacritic/OCR-insensitive)', () => {
    const match = matchProduct('JUPIK 330 ML', catalog, [], null)
    expect(match).toMatchObject({ productId: 'jupik', method: 'exact_product' })
    expect(match!.confidence).toBe(CONFIDENCE_BY_METHOD.exact_product)
  })

  it('tier 2/3: store-specific alias outranks a global one for the same abbreviation', () => {
    const aliases = [
      alias({ productId: 'mattoni', normalizedAlias: 'mat 15', storeId: null }), // global
      alias({ productId: 'jupik', normalizedAlias: 'mat 15', storeId: 'lidl' }), // store-specific, different product entirely for this test
    ]
    const atLidl = matchProduct('MAT 15', catalog, aliases, 'lidl')
    expect(atLidl).toMatchObject({ productId: 'jupik', method: 'store_alias' })
    const elsewhere = matchProduct('MAT 15', catalog, aliases, 'albert')
    expect(elsewhere).toMatchObject({ productId: 'mattoni', method: 'exact_alias' })
  })

  it('tier 5: fuzzy match on an OCR-garbled name, above the threshold', () => {
    // "MATTON1" is a one-character edit-distance-1 typo of "Mattoni" (spec section 8) — close enough
    // to fuzzy-match, unlike an abbreviation ("MAT 15"), which is what the alias tiers are for instead.
    const match = matchProduct('MATTON1', catalog, [], null)
    expect(match).toMatchObject({ productId: 'mattoni', method: 'fuzzy_match' })
  })

  it('returns null rather than a low-confidence guess for something unrelated', () => {
    expect(matchProduct('zcela jiny produkt xyz', catalog, [], null)).toBeNull()
  })

  it('never returns a match below the auto-accept threshold silently mislabeled as confident', () => {
    // A distant-but-not-nonsense fuzzy candidate should either be null or below the auto-accept bar —
    // callers must gate on AUTO_ACCEPT_THRESHOLD themselves, this only guarantees the number is honest.
    const match = matchProduct('Jupi napoj ruzne ovoce', catalog, [], null)
    if (match) expect(match.confidence).toBeLessThanOrEqual(CONFIDENCE_BY_METHOD.fuzzy_match)
    expect(AUTO_ACCEPT_THRESHOLD).toBeGreaterThan(0.5)
  })
})

describe('classifySubcategory', () => {
  it('prefers a matched catalog product\'s own remembered subcategory over keywords', () => {
    const match = classifySubcategory('Potraviny', 'Nějaký nápoj', 'Sladkosti')
    expect(match).toMatchObject({ subcategory: 'Sladkosti', method: 'exact_product' })
  })

  it('falls back to the keyword rules when the product has none yet', () => {
    const match = classifySubcategory('Potraviny', 'Šunka', null)
    expect(match).toMatchObject({ subcategory: 'Maso a uzeniny', method: 'keyword' })
  })

  it('returns null when neither is confident — never a guess', () => {
    expect(classifySubcategory('Potraviny', 'xyz neznámá položka', null)).toBeNull()
  })
})

describe('guessItemCategory — a name the catalog does not know', () => {
  it('takes the brand, else the one category whose keyword rules place the name', () => {
    expect(guessItemCategory('Kubík jahoda')).toBe('Děti')
    expect(guessItemCategory('Kuřecí maso')).toBe('Potraviny')
    expect(guessItemCategory('Prášek na praní')).toBe('Drogerie')
  })

  it('says nothing when no rule or more than one category fits', () => {
    expect(guessItemCategory('Dárek pro babičku')).toBeNull()
  })
})

describe('detectNonInventory / detectChildOriented', () => {
  it('flags a shopping bag as non-inventory', () => {
    expect(detectNonInventory('Taška igelitová')).toBe(true)
    expect(detectNonInventory('Kuřecí prsa')).toBe(false)
  })

  it('flags a known children\'s drink without asserting anything about its category', () => {
    expect(detectChildOriented('Kubík jahoda 200ml')).toBe(true)
  })
})

// aiCategorizeFallback calls the Vercel AI SDK's generateText — mocked here so this test never
// makes a real network/model call (and needs no credentials), per CLAUDE.md section 25's testability
// mandate. What is under test is this module's OWN validation: an id outside the allowed list must
// be rejected even if the (mocked) model "returns" one.
vi.mock('ai', () => ({ generateText: vi.fn() }))

describe('aiCategorizeFallback — structured output validation (spec section 11)', () => {
  it('accepts a subcategory name that is in the allowed list', async () => {
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockResolvedValueOnce({ output: { subcategoryId: 'Nápoje', confidence: 0.7, reason: 'drink brand' } } as never)
    const { aiCategorizeFallback } = await import('@/lib/categorization')
    const result = await aiCategorizeFallback('Nějaký nápoj', 'Potraviny')
    expect(result).toMatchObject({ subcategory: 'Nápoje' })
  })

  it('rejects a hallucinated subcategory outside the fixed list, never passing it through', async () => {
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockResolvedValueOnce({ output: { subcategoryId: 'Neexistující kategorie', confidence: 0.9, reason: 'made up' } } as never)
    const { aiCategorizeFallback } = await import('@/lib/categorization')
    expect(await aiCategorizeFallback('Nějaký produkt', 'Potraviny')).toBeNull()
  })

  it('treats a null answer as "no answer", never a guess', async () => {
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockResolvedValueOnce({ output: { subcategoryId: null, confidence: 0, reason: 'unsure' } } as never)
    const { aiCategorizeFallback } = await import('@/lib/categorization')
    expect(await aiCategorizeFallback('Nějaký produkt', 'Potraviny')).toBeNull()
  })
})
