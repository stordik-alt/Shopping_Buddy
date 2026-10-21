import { describe, expect, it } from 'vitest'
import {
  compareModelNumbers,
  compareTetaPackages,
  decideTetaIdentity,
  modelNumbers,
  TETA_IDENTITY_MIN_NAME_COVERAGE,
  type TetaIdentityCandidate,
} from '@/lib/product-identity-teta'

const candidate = (overrides: Partial<TetaIdentityCandidate> = {}): TetaIdentityCandidate => ({
  productId: 'product-1',
  productName: 'Nivea Creme 200 ml',
  packages: [{ quantity: 0.2, unit: 'l' }],
  ...overrides,
})

describe('Teta package comparison', () => {
  it('reads the same size in different units as the same size', () => {
    expect(compareTetaPackages(
      { package: { quantity: 0.2, unit: 'l' }, name: 'Nivea Creme 200 ml' },
      { packages: [{ quantity: 0.2, unit: 'l' }], productName: 'Nivea Creme 200 ml' },
    )).toBe(true)
  })

  it('reads a size that is only in the name', () => {
    expect(compareTetaPackages(
      { package: null, name: 'Tip Line kapesníky 100 ks' },
      { packages: [], productName: 'Tip Line kapesníky 100 ks' },
    )).toBe(true)
  })

  it('reads a multipack name as its total size', () => {
    // "8 x 100 g" is 800 g, which is 0,8 kg — the same package the retailer states.
    expect(compareTetaPackages(
      { package: { quantity: 0.8, unit: 'kg' }, name: 'Sůl 8 x 100 g' },
      { packages: [], productName: 'Sůl 800 g' },
    )).toBe(true)
  })

  it('tells a different size apart', () => {
    expect(compareTetaPackages(
      { package: { quantity: 0.2, unit: 'l' }, name: 'Nivea Creme 200 ml' },
      { packages: [{ quantity: 0.1, unit: 'l' }], productName: 'Nivea Creme 100 ml' },
    )).toBe(false)
  })

  it('says nothing when one side does not state a size', () => {
    expect(compareTetaPackages(
      { package: { quantity: 0.2, unit: 'l' }, name: 'Nivea Creme 200 ml' },
      { packages: [], productName: 'Nivea Creme' },
    )).toBeNull()
  })
})

describe('Teta model numbers', () => {
  it('reads the digits that tell two variants apart', () => {
    expect(modelNumbers('CURAPROX CS 5460 zubní kartáček Ultra soft')).toEqual(['5460'])
  })

  it('does not read a package size as a model number', () => {
    expect(modelNumbers('Nivea Creme 200 ml')).toEqual([])
    expect(modelNumbers('Tip Line kapesníky 100 ks')).toEqual([])
    expect(modelNumbers('Sůl 8 x 100 g')).toEqual([])
    expect(modelNumbers('Šampon 1 000 ml')).toEqual([])
  })

  it('does not read a percentage or a one-digit number as a model number', () => {
    expect(modelNumbers('Krém s 40 % obsahem')).toEqual([])
    expect(modelNumbers('Odol 3D White')).toEqual([])
  })

  it('says nothing when only one side states a model number', () => {
    expect(compareModelNumbers(['5460'], [])).toBeNull()
    expect(compareModelNumbers([], ['5460'])).toBeNull()
  })

  it('agrees when the same model number is on both sides', () => {
    expect(compareModelNumbers(['5460'], ['5460'])).toBe('agree')
  })

  it('conflicts when the model numbers are different', () => {
    expect(compareModelNumbers(['5460'], ['3960'])).toBe('conflict')
  })
})

describe('Teta identity decision', () => {
  const tetaProduct = {
    externalId: '000000000196442',
    name: 'Nivea Creme 200 ml',
    brand: 'Nivea',
    package: { quantity: 0.2, unit: 'l' as const },
  }

  it('links a product that agrees on brand, package and words', () => {
    const decision = decideTetaIdentity(tetaProduct, [candidate()])
    expect(decision.status).toBe('auto')
    expect(decision.productId).toBe('product-1')
  })

  it('does not link a product of a different size', () => {
    const decision = decideTetaIdentity(tetaProduct, [candidate({ packages: [{ quantity: 0.1, unit: 'l' }] })])
    expect(decision.status).toBe('review')
    expect(decision.reason).toContain('package sizes differ')
    expect(decision.productId).toBeUndefined()
  })

  it('does not link a product whose name does not say the same thing', () => {
    const decision = decideTetaIdentity(tetaProduct, [candidate({ productName: 'Nivea Denní krém 200 ml' })])
    expect(decision.status).toBe('review')
    expect(decision.reason).toContain('names describe different products')
  })

  it('does not link a product of another brand', () => {
    const decision = decideTetaIdentity(tetaProduct, [candidate({ productName: 'Garnier Creme 200 ml' })])
    expect(decision.status).toBe('review')
    expect(decision.reason).toContain('brand')
  })

  it('does not link when a second candidate is just as close', () => {
    const decision = decideTetaIdentity(tetaProduct, [
      candidate(),
      candidate({ productId: 'product-2' }),
    ])
    expect(decision.status).toBe('review')
    expect(decision.reason).toContain('second candidate')
  })

  it('does not link a product that another Teta product already owns', () => {
    const decision = decideTetaIdentity(tetaProduct, [candidate()], {
      linkedProductIds: new Map([['product-1', '000000000999999']]),
    })
    expect(decision.status).toBe('review')
    expect(decision.reason).toContain('already linked to another Teta product')
  })

  it('links a product that this very Teta product already owns', () => {
    const decision = decideTetaIdentity(tetaProduct, [candidate()], {
      linkedProductIds: new Map([['product-1', '000000000196442']]),
    })
    expect(decision.status).toBe('auto')
  })

  it('reports a product nothing in the catalog resembles', () => {
    const decision = decideTetaIdentity(tetaProduct, [])
    expect(decision.status).toBe('none')
    expect(decision.candidates).toEqual([])
  })

  it('keeps the candidates and their scores in the report', () => {
    const decision = decideTetaIdentity(tetaProduct, [candidate(), candidate({ productId: 'product-2' })])
    expect(decision.candidates).toHaveLength(2)
    expect(decision.candidates[0].productId).toBe('product-1')
    expect(decision.candidates[0].score).toBeGreaterThan(0)
  })

  it('needs most of the descriptive words of the Teta name', () => {
    // Four descriptive words, one of them found: not enough to link.
    const decision = decideTetaIdentity(
      { ...tetaProduct, name: 'Nivea Creme hydratační denní 200 ml' },
      [candidate()],
    )
    expect(decision.status).toBe('review')
    expect(TETA_IDENTITY_MIN_NAME_COVERAGE).toBeGreaterThan(0.5)
  })

  it('links the variant whose model number is the same', () => {
    const decision = decideTetaIdentity(
      {
        externalId: '000000000196443',
        name: 'CURAPROX CS 5460 Ultra soft 3 ks',
        brand: 'CURAPROX',
        package: { quantity: 3, unit: 'ks' },
      },
      [candidate({
        productName: 'CURAPROX CS 5460 Ultra soft 3 ks',
        packages: [{ quantity: 3, unit: 'ks' }],
      })],
    )
    expect(decision.status).toBe('auto')
  })

  it('does not link the variant whose model number is different', () => {
    // The shared comparison does not look at digits, so only the model number tells the two
    // Curaprox brushes apart.
    const decision = decideTetaIdentity(
      {
        externalId: '000000000196443',
        name: 'CURAPROX CS 5460 Ultra soft 3 ks',
        brand: 'CURAPROX',
        package: { quantity: 3, unit: 'ks' },
      },
      [candidate({
        productName: 'CURAPROX CS 3960 Ultra soft 3 ks',
        packages: [{ quantity: 3, unit: 'ks' }],
      })],
    )
    expect(decision.status).toBe('review')
    expect(decision.reason).toContain('model numbers differ')
  })
})
