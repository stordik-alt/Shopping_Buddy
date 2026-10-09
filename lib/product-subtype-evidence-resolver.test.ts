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
    ['pivo', 'Pivo alkoholické', 'pivo-alkoholicke'],
    ['testoviny', 'Barilla Spaghetti n. 5', 'testoviny-dlouhe'],
    ['ryze', 'Rýže basmati 1 kg', 'ryze-basmati'],
    ['tvaroh', 'Tatra Tvaroh odtučněný', 'tvaroh'],
    ['taveny-syr', 'Tavený sýr plátkový', 'taveny-syr-platkovy'],
    ['tunak-konzerva', 'Tuňák ve vlastní šťávě', 'tunak-konzerva-ve-vlastni-stave'],
  ])('matches explicit evidence for %s: %s', (productTypeKey, productName, subtypeKey) => {
    const result = resolve({ productTypeKey, productName })
    expect(result.decision).toBe('match')
    expect(result.proposedSubtypeKey).toBe(subtypeKey)
    expect(result.reason).toBeNull()
    expect(result.evidence.some((item) => item.polarity === 'supports')).toBe(true)
  })

  it('defaults beer to alcoholic unless non-alcoholic wording or zero alcohol is explicit', () => {
    for (const productName of [
      'Bakalář Rakovnický ležák za studena chmelený 0,5 l',
      'Pivo světlé',
      'Pivo tmavé 12°',
      'Pilsner Urquell 0,5 l',
      'Pivo alkoholické',
    ]) {
      expect(resolve({ productName }).proposedSubtypeKey).toBe('pivo-alkoholicke')
    }

    for (const productName of [
      'Pivo nealkoholické',
      'Nealko pivo',
      'Pivo bez alkoholu',
      'Pivo 0%',
      'Pivo 0 % alkoholu',
      'Pivo 0,0%',
      'Pivo 0.0 %',
      'Nealkoholické pivo 0,5 l',
    ]) {
      expect(resolve({ productName }).proposedSubtypeKey).toBe('pivo-nealkoholicke')
    }
  })

  it('gives non-alcoholic evidence precedence and does not classify beer by colour', () => {
    expect(resolve({ productName: 'Světlé pivo 0%' }).proposedSubtypeKey).toBe('pivo-nealkoholicke')
    expect(resolve({ productName: 'Tmavé nealkoholické pivo' }).proposedSubtypeKey).toBe('pivo-nealkoholicke')
    expect(resolve({ productName: 'Pivo světlé' }).proposedSubtypeKey).toBe('pivo-alkoholicke')
  })

  it('applies pasta priority only after evidence is present', () => {
    const result = resolve({ productTypeKey: 'testoviny', productName: 'Ravioli plněné těstoviny krátké tvarované' })
    expect(result.decision).toBe('match')
    expect(result.proposedSubtypeKey).toBe('testoviny-plnene')
    expect(resolve({ productTypeKey: 'testoviny', productName: 'Lasagne hotové jídlo' }).decision).toBe('no_match')
    expect(resolve({ productTypeKey: 'testoviny', productName: 'Penne polévkové' }).proposedSubtypeKey).toBe('testoviny-polevkove')
    expect(resolve({ productTypeKey: 'testoviny', productName: 'Fleky bezvaječné' }).proposedSubtypeKey).toBe('testoviny-kratke-tvarovane')
    expect(resolve({ productTypeKey: 'testoviny', productName: 'Tagliatelle hnízda' }).proposedSubtypeKey).toBe('testoviny-dlouhe')
    expect(resolve({ productTypeKey: 'testoviny', productName: 'Orzo 500 g' }).proposedSubtypeKey).toBe('testoviny-kratke-tvarovane')
    expect(resolve({ productTypeKey: 'testoviny', productName: 'Těstoviny' }).proposedSubtypeKey).toBe('testoviny-ostatni')
    expect(resolve({ productTypeKey: 'testoviny', productName: 'Směs na těstovinový salát' }).decision).toBe('no_match')
  })

  it('uses rice priorities and reviews equal-priority variety/shape conflicts', () => {
    expect(resolve({ productTypeKey: 'ryze', productName: 'Basmati natural parboiled rýže' }).proposedSubtypeKey).toBe('ryze-basmati')
    expect(resolve({ productTypeKey: 'ryze', productName: 'Basmati jasmínová rýže' }).reason).toBe('conflicting_evidence')
    expect(resolve({ productTypeKey: 'ryze', productName: 'Dlouhozrnná kulatozrnná rýže' }).reason).toBe('conflicting_evidence')
    expect(resolve({ productTypeKey: 'ryze', productName: 'Rýže 22 % tuku' }).proposedSubtypeKey).toBe('ryze-ostatni')
    expect(resolve({ productTypeKey: 'ryze', productName: 'Lagris Sushi rýže 500g' }).proposedSubtypeKey).toBe('ryze-sushi')
    expect(resolve({ productTypeKey: 'ryze', productName: 'Rýže loupaná' }).proposedSubtypeKey).toBe('ryze-ostatni')
    expect(resolve({ productTypeKey: 'ryze', productName: 'Ryzec smrkový – čerstvý' }).decision).toBe('no_match')
  })

  it('classifies genuine quark as one subtype regardless of fat, texture or flavour and excludes quark yoghurt', () => {
    for (const productName of ['Tvaroh 22 % tuku', 'Tučný tvaroh polotučný', 'Jemný měkký tvaroh', 'Tvaroh s příchutí vanilky']) {
      expect(resolve({ productTypeKey: 'tvaroh', productName }).proposedSubtypeKey).toBe('tvaroh')
    }
    expect(resolve({ productTypeKey: 'tvaroh', productName: 'Mlsni.si tvaroh Pikao' }).decision).toBe('no_match')
    expect(resolve({ productTypeKey: 'tvaroh', productName: 'Tvarohový jogurt borůvka' }).decision).toBe('no_match')
    expect(resolve({ productTypeKey: 'tvaroh', productName: 'Tvarohová pomazánka' }).decision).toBe('no_match')
  })

  it('uses processed-cheese form priority, not pack count or generic slice wording', () => {
    expect(resolve({ productTypeKey: 'taveny-syr', productName: 'Tavený sýr 8 ks' }).proposedSubtypeKey).toBe('taveny-syr-ostatni')
    expect(resolve({ productTypeKey: 'taveny-syr', productName: 'Apetito Gouda plátky 90g' }).proposedSubtypeKey).toBe('taveny-syr-ostatni')
    expect(resolve({ productTypeKey: 'taveny-syr', productName: 'clever Toast tavený sýrový výrobek plátky 200g' }).proposedSubtypeKey).toBe('taveny-syr-platkovy')
    expect(resolve({ productTypeKey: 'taveny-syr', productName: 'Porcovaný plátkový tavený sýr' }).proposedSubtypeKey).toBe('taveny-syr-porcovany')
    expect(resolve({ productTypeKey: 'taveny-syr', productName: 'Roztíratelný tavený sýr' }).proposedSubtypeKey).toBe('taveny-syr-roztiratelny')
    expect(resolve({ productTypeKey: 'taveny-syr', productName: 'Tavený sýr v porcích, 8 ks' }).proposedSubtypeKey).toBe('taveny-syr-ostatni')
    expect(resolve({ productTypeKey: 'taveny-syr', productName: 'Apetito Smetanové 3 ks 150g' }).proposedSubtypeKey).toBe('taveny-syr-ostatni')
  })

  it.each([
    'Rio Mare Tuňák v ol.oleji',
    'Rio Mare Tuňák v ol. oleji',
  ])('recognizes explicit abbreviated oil wording without guessing: %s', (productName) => {
    const result = resolve({ productTypeKey: 'tunak-konzerva', productName })
    expect(result.decision).toBe('match')
    expect(result.proposedSubtypeKey).toBe('tunak-konzerva-v-oleji')
    expect(result.evidence.some((item) => item.matchedRule.includes('v ol oleji'))).toBe(true)
  })

  it('does not broaden abbreviated oil matching into unrelated or ambiguous wording', () => {
    const ownJuice = resolve({ productTypeKey: 'tunak-konzerva', productName: 'Rio Mare Tuňák ve vlastní šťávě' })
    expect(ownJuice.proposedSubtypeKey).toBe('tunak-konzerva-ve-vlastni-stave')

    for (const productName of [
      'Tuňák v ol. balení',
      'Tuňák s olivovým olejem',
    ]) {
      const result = resolve({ productTypeKey: 'tunak-konzerva', productName })
      expect(result.decision).toBe('no_match')
      expect(result.proposedSubtypeKey).toBeNull()
    }

    const wrongType = resolve({ productTypeKey: 'testoviny', productName: 'Tuňák v ol.oleji' })
    expect(wrongType.proposedSubtypeKey).toBeNull()
    expect(wrongType.decision).toBe('no_match')
  })

  it('distinguishes own juice from generic water and reviews conflicting preservation media', () => {
    expect(resolve({ productTypeKey: 'tunak-konzerva', productName: 'Tuňák ve vlastní šťávě a ve vodním nálevu' }).proposedSubtypeKey).toBe('tunak-konzerva-ve-vlastni-stave')
    expect(resolve({ productTypeKey: 'tunak-konzerva', productName: 'Tuňák v oleji a ve vlastní šťávě' }).reason).toBe('conflicting_evidence')
    expect(resolve({ productTypeKey: 'tunak-konzerva', productName: 'Tuňák ve vodě' }).proposedSubtypeKey).toBe('tunak-konzerva-ve-vodnim-nalevu')
    expect(resolve({ productTypeKey: 'tunak-konzerva', productName: 'Rio Mare Tuňák v olivovém oleji 160g' }).proposedSubtypeKey).toBe('tunak-konzerva-v-oleji')
    expect(resolve({ productTypeKey: 'tunak-konzerva', productName: 'Calvo Tuňák ve slunečnicovém oleji 3x65g' }).proposedSubtypeKey).toBe('tunak-konzerva-v-oleji')
    expect(resolve({ productTypeKey: 'tunak-konzerva', productName: 'Tuňáková pomazánka s olivovým olejem' }).decision).toBe('no_match')
    expect(resolve({ productTypeKey: 'tunak-konzerva', productName: 'Tuňákový salát ve vlastní šťávě' }).decision).toBe('no_match')
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
      productDescription: 'Nealkoholické pivo',
      verifiedAttributes: { manufacturer_spec: 'Nealkoholické pivo' },
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
