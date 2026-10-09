import { describe, expect, it } from 'vitest'
import {
  PRODUCT_SUBTYPE_EVIDENCE_RESOLVER_VERSION,
  resolveProductSubtypeEvidence,
  type ProductSubtypeResolverInput,
} from '@/lib/product-subtype-evidence-resolver'

const resolve = (overrides: Partial<ProductSubtypeResolverInput> = {}) =>
  resolveProductSubtypeEvidence({
    productId: 'product-1',
    productName: 'Testovací produkt',
    productTypeKey: 'pivo',
    ...overrides,
  })

describe('resolveProductSubtypeEvidence', () => {
  it.each([
    ['pivo', 'Stella Artois světlý ležák', 'pivo-svetle'],
    ['testoviny', 'Barilla Spaghetti n. 5', 'testoviny-dlouhe'],
    ['ryze', 'Rýže basmati 1 kg', 'ryze-basmati'],
    ['tvaroh', 'Tatra Tvaroh odtučněný', 'tvaroh-odtucneny'],
    ['taveny-syr', 'Tavený sýr plátkový', 'taveny-syr-platkovy'],
    ['tunak-konzerva', 'Tuňák ve vlastní šťávě', 'tunak-konzerva-ve-vlastni-stave'],
  ])('matches explicit evidence for %s: %s', (productTypeKey, productName, subtypeKey) => {
    const result = resolve({ productTypeKey, productName })
    expect(result.decision).toBe('match')
    expect(result.proposedSubtypeKey).toBe(subtypeKey)
    expect(result.reason).toBeNull()
    expect(result.evidence.some((item) => item.polarity === 'supports')).toBe(true)
  })

  it('returns no_match with insufficient_evidence when no explicit subtype evidence exists', () => {
    const result = resolve({ productName: 'Bakalář Rakovnický ležák za studena chmelený 0,5 l' })
    expect(result.decision).toBe('no_match')
    expect(result.proposedSubtypeKey).toBeNull()
    expect(result.reason).toBe('insufficient_evidence')
    expect(result.candidates).toEqual([])
  })

  it('requires explicit beer colour and reviews conflicting colour evidence', () => {
    expect(resolve({ productName: 'Bakalář ležák' }).decision).toBe('no_match')
    const result = resolve({ productName: 'Pivo světlé a tmavé' })
    expect(result.decision).toBe('review')
    expect(result.reason).toBe('conflicting_evidence')
    expect(result.proposedSubtypeKey).toBeNull()
    expect(result.evidence.some((item) => item.polarity === 'contradicts')).toBe(true)
  })

  it('applies pasta priority only after evidence is present', () => {
    const result = resolve({ productTypeKey: 'testoviny', productName: 'Ravioli plněné těstoviny krátké tvarované' })
    expect(result.decision).toBe('match')
    expect(result.proposedSubtypeKey).toBe('testoviny-plnene')
    expect(resolve({ productTypeKey: 'testoviny', productName: 'Lasagne hotové jídlo' }).decision).toBe('no_match')
    expect(resolve({ productTypeKey: 'testoviny', productName: 'Penne polévkové' }).proposedSubtypeKey).toBe('testoviny-polevkove')
  })

  it('uses rice priorities and reviews equal-priority variety/shape conflicts', () => {
    expect(resolve({ productTypeKey: 'ryze', productName: 'Basmati natural parboiled rýže' }).proposedSubtypeKey).toBe('ryze-basmati')
    expect(resolve({ productTypeKey: 'ryze', productName: 'Basmati jasmínová rýže' }).reason).toBe('conflicting_evidence')
    expect(resolve({ productTypeKey: 'ryze', productName: 'Dlouhozrnná kulatozrnná rýže' }).reason).toBe('conflicting_evidence')
    expect(resolve({ productTypeKey: 'ryze', productName: 'Rýže 22 % tuku' }).decision).toBe('no_match')
  })

  it('never infers quark fat class from percentages alone', () => {
    expect(resolve({ productTypeKey: 'tvaroh', productName: 'Tvaroh 22 % tuku' }).decision).toBe('no_match')
    expect(resolve({ productTypeKey: 'tvaroh', productName: 'Tučný polotučný tvaroh' }).reason).toBe('conflicting_evidence')
    expect(resolve({ productTypeKey: 'tvaroh', productName: 'Tvaroh', verifiedAttributes: { manufacturer_spec: 'odtučněný' } }).proposedSubtypeKey).toBe('tvaroh-odtucneny')
  })

  it('uses processed-cheese form priority, not pack count', () => {
    expect(resolve({ productTypeKey: 'taveny-syr', productName: 'Tavený sýr 8 ks' }).decision).toBe('no_match')
    expect(resolve({ productTypeKey: 'taveny-syr', productName: 'Porcovaný plátkový tavený sýr' }).proposedSubtypeKey).toBe('taveny-syr-porcovany')
    expect(resolve({ productTypeKey: 'taveny-syr', productName: 'Roztíratelný tavený sýr' }).proposedSubtypeKey).toBe('taveny-syr-roztiratelny')
  })

  it('distinguishes own juice from generic water and reviews conflicting preservation media', () => {
    expect(resolve({ productTypeKey: 'tunak-konzerva', productName: 'Tuňák ve vlastní šťávě a ve vodním nálevu' }).proposedSubtypeKey).toBe('tunak-konzerva-ve-vlastni-stave')
    expect(resolve({ productTypeKey: 'tunak-konzerva', productName: 'Tuňák v oleji a ve vlastní šťávě' }).reason).toBe('conflicting_evidence')
    expect(resolve({ productTypeKey: 'tunak-konzerva', productName: 'Tuňák ve vodě' }).proposedSubtypeKey).toBe('tunak-konzerva-ve-vodnim-nalevu')
  })

  it('returns review for unsupported Product Types and protects existing assignments', () => {
    const unsupported = resolve({ productTypeKey: 'maslo', productName: 'Máslo' })
    expect(unsupported.decision).toBe('review')
    expect(unsupported.reason).toBe('unsupported_category')
    expect(unsupported.proposedSubtypeKey).toBeNull()

    const existing = resolve({
      productTypeKey: 'pivo',
      productName: 'Pivo světlé',
      existingSubtypeKey: 'pivo-tmave',
    })
    expect(existing.decision).toBe('review')
    expect(existing.reason).toBe('existing_assignment')
    expect(existing.existingSubtypeKey).toBe('pivo-tmave')
    expect(existing.proposedSubtypeKey).toBeNull()
  })

  it('preserves evidence source, field, value, rule and polarity', () => {
    const result = resolve({
      productTypeKey: 'pivo',
      productName: 'Pivo',
      productDescription: 'Světlý ležák',
      verifiedAttributes: { manufacturer_spec: 'barva světlá' },
    })
    expect(result.evidence.some((item) => item.source === 'product_description' && item.field === 'description')).toBe(true)
    expect(result.evidence.some((item) => item.source === 'manufacturer_spec' && item.field === 'manufacturer_spec')).toBe(true)
    expect(result.evidence.every((item) => item.value.length > 0 && item.matchedRule.length > 0)).toBe(true)
  })

  it('is deterministic and returns the resolver version', () => {
    const input = {
      productId: 'same-id',
      productName: 'Tuňák v oleji',
      productTypeKey: 'tunak-konzerva',
      verifiedAttributes: { z: 'v oleji', a: 'v oleji' },
    }
    expect(resolveProductSubtypeEvidence(input)).toEqual(resolveProductSubtypeEvidence(input))
    expect(resolveProductSubtypeEvidence(input).resolverVersion).toBe(PRODUCT_SUBTYPE_EVIDENCE_RESOLVER_VERSION)
  })
})
