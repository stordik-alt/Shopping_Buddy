import { describe, expect, it } from 'vitest'
import {
  compareModelNumbers,
  compareTetaPackages,
  decideTetaIdentity,
  isVariantGroupProduct,
  modelNumbers,
  resolveTetaIdentityClaims,
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

  it('reads a size stated in another unit as the same size', () => {
    // One retailer states "75 ml" where the other states "0,075 l". The size is the same; only the
    // unit the source wrote it in is different.
    expect(compareTetaPackages(
      { package: { quantity: 0.075, unit: 'l' }, name: 'Colgate zubní pasta 75 ml' },
      { packages: [{ quantity: 75, unit: 'ml' }], productName: 'Colgate zubní pasta 75 ml' },
    )).toBe(true)
    expect(compareTetaPackages(
      { package: { quantity: 0.1, unit: 'kg' }, name: 'Sůl 100 g' },
      { packages: [{ quantity: 100, unit: 'g' }], productName: 'Sůl 100 g' },
    )).toBe(true)
  })

  it('tells a size in another unit apart', () => {
    expect(compareTetaPackages(
      { package: { quantity: 0.075, unit: 'l' }, name: 'Colgate zubní pasta 75 ml' },
      { packages: [{ quantity: 80, unit: 'ml' }], productName: 'Colgate zubní pasta 80 ml' },
    )).toBe(false)
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

  it('conflicts when the shades of one line are different', () => {
    // The shared "24" is the hours of the hold, not the shade. The shade is the number that
    // differs, so the two names are two products even though they share a number.
    expect(compareModelNumbers(['24', '110'], ['24', '120'])).toBe('conflict')
  })

  it('agrees when one name states a number the other does not', () => {
    // A number only one side states is extra information, not a contradiction.
    expect(compareModelNumbers(['5460'], ['5460', '3960'])).toBe('agree')
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
    expect(decision.reason).toContain("the catalog name says 'denni'")
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

  it('does not count a product that this very Teta product already owns', () => {
    // The product the SKU is already linked to is the import's own earlier conclusion, not
    // evidence — and it may be the very product the import created for this SKU. Counting it
    // would make the decision depend on how many times the import has run.
    const decision = decideTetaIdentity(tetaProduct, [candidate()], {
      linkedProductIds: new Map([['product-1', '000000000196442']]),
    })
    expect(decision.status).toBe('none')
    expect(decision.candidates).toEqual([])
    // The link itself is still reported, with the score the comparison gave it.
    expect(decision.ownProduct?.productId).toBe('product-1')
    expect(decision.ownProduct?.score).toBeGreaterThan(0)
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

  it('needs every descriptive word of the Teta name', () => {
    // "hydratační" is the word that tells two products of the line apart, and the catalog name does
    // not say it: the two names may be two products, so the link is not made.
    const decision = decideTetaIdentity(
      { ...tetaProduct, name: 'Nivea Creme hydratační 200 ml' },
      [candidate()],
    )
    expect(decision.status).toBe('review')
    expect(decision.reason).toContain("does not say 'hydratacni'")
  })

  it('does not need the word that names the type of the product', () => {
    // "vložky" and "hygienické" name the type of the product, not the variant of it, so a retailer
    // may leave them out.
    const decision = decideTetaIdentity(
      {
        externalId: '000000000196444',
        name: 'Always Ultra Secure Night Extra 20 ks',
        brand: 'Always',
        package: { quantity: 20, unit: 'ks' },
      },
      [candidate({
        productName: 'Always Ultra Secure Night Extra hygienické vložky 20 ks',
        packages: [{ quantity: 20, unit: 'ks' }],
      })],
    )
    expect(decision.status).toBe('auto')
  })

  it('does not link two products of a different kind', () => {
    const decision = decideTetaIdentity(
      {
        externalId: '000000000196445',
        name: 'Always Ultra vložky 20 ks',
        brand: 'Always',
        package: { quantity: 20, unit: 'ks' },
      },
      [candidate({
        productName: 'Always Ultra ubrousky 20 ks',
        packages: [{ quantity: 20, unit: 'ks' }],
      })],
    )
    expect(decision.status).toBe('review')
    expect(decision.reason).toContain('different kinds of product')
  })

  it('does not link a product that contradicts itself', () => {
    // The price and the stated unit price describe a different size than the package statement
    // does, so the record states no size that can be trusted and nothing may be linked to it.
    const decision = decideTetaIdentity(
      {
        externalId: '000000000196448',
        name: "L'Oréal Paris Elseve Color-Vive balzám na vlasy 200 ml",
        brand: "L'Oréal Paris",
        package: { quantity: 0.3, unit: 'l' },
        contradictory: true,
      },
      [candidate({
        productName: "L'ORÉAL PARiS ELSEVE balzám na vlasy Color Vive, 300 ml",
        packages: [{ quantity: 0.3, unit: 'l' }],
      })],
    )
    expect(decision.status).toBe('review')
    expect(decision.reason).toContain('the package size is contradictory')
    expect(decision.productId).toBeUndefined()
  })

  it('links a product that says the same formula', () => {
    // "3 v 1" is a word that tells the product apart: the catalog name has to say it too.
    const decision = decideTetaIdentity(
      {
        externalId: '000000000196449',
        name: 'Nivea Men Active Clean 3 v 1 sprchový gel 500 ml',
        brand: 'Nivea Men',
        package: { quantity: 0.5, unit: 'l' },
      },
      [candidate({
        productName: 'NIVEA MEN sprchový gel 3 v 1 Active Clean, 500 ml',
        packages: [{ quantity: 0.5, unit: 'l' }],
      })],
    )
    expect(decision.status).toBe('auto')
  })

  it('does not link a product whose name does not say the formula', () => {
    const decision = decideTetaIdentity(
      {
        externalId: '000000000196450',
        name: 'Syoss Volume 3v1 lak na vlasy pro objem vlasů 300 ml',
        brand: 'Syoss',
        package: { quantity: 0.3, unit: 'l' },
      },
      [candidate({
        productName: 'SYOSS Volume lak na vlasy pro objem vlasů, 300 ml',
        packages: [{ quantity: 0.3, unit: 'l' }],
      })],
    )
    expect(decision.status).toBe('review')
    expect(decision.reason).toContain("does not say '3in1'")
  })

  it('does not link a product of a different size number', () => {
    const decision = decideTetaIdentity(
      {
        externalId: '000000000196446',
        name: 'Always Platinum hygienické vložky, vel. 3, 22 ks',
        brand: 'Always',
        package: { quantity: 22, unit: 'ks' },
      },
      [candidate({
        productName: 'Always Platinum hygienické vložky, vel. 4, 22 ks',
        packages: [{ quantity: 22, unit: 'ks' }],
      })],
    )
    expect(decision.status).toBe('review')
    expect(decision.reason).toContain('the sizes differ')
  })

  it('does not link a shade whose number is different', () => {
    const decision = decideTetaIdentity(
      {
        externalId: '000000000196447',
        name: "L'Oréal Paris Infaillible 24H Fresh Wear make-up 110 30 ml",
        brand: "L'Oréal Paris",
        package: { quantity: 0.03, unit: 'l' },
      },
      [candidate({
        productName: "L'Oréal Paris Infaillible 24H Fresh Wear make-up 120 30 ml",
        packages: [{ quantity: 0.03, unit: 'l' }],
      })],
    )
    expect(decision.status).toBe('review')
    expect(decision.reason).toContain('the model numbers differ')
  })

  it('links a name that writes "make-up" as "makeup" says it', () => {
    const decision = decideTetaIdentity(
      {
        externalId: '000000000196448',
        name: "L'Oréal Infaillible make-up 30 ml",
        brand: "L'Oréal",
        package: { quantity: 0.03, unit: 'l' },
      },
      [candidate({
        productName: "L'Oréal Infaillible makeup 30 ml",
        packages: [{ quantity: 0.03, unit: 'l' }],
      })],
    )
    expect(decision.status).toBe('auto')
  })

  it('does not link a catalog product that stands for a group of variants', () => {
    const decision = decideTetaIdentity(tetaProduct, [
      candidate({ productName: 'Nivea Creme 200 ml (vybrané druhy)' }),
    ])
    expect(decision.status).toBe('review')
    expect(decision.reason).toContain('group of variants')
  })

  it('knows a catalog product that stands for a group of variants', () => {
    expect(isVariantGroupProduct('Nivea Creme 200 ml (vybrané druhy)')).toBe(true)
    expect(isVariantGroupProduct('Nivea Creme 200 ml (vybrané varianty)')).toBe(true)
    expect(isVariantGroupProduct('Nivea Creme 200 ml')).toBe(false)
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

describe('Teta identity claims', () => {
  it('gives a catalog product to the Teta product that fits it best', () => {
    // Two Teta products of one line can both look like the same catalog product. Only one of them
    // is that product, and the other one is reported for review.
    const decisions = [
      decideTetaIdentity(
        { externalId: 'sku-1', name: 'Nivea Creme 200 ml', brand: 'Nivea', package: { quantity: 0.2, unit: 'l' } },
        [candidate()],
      ),
      decideTetaIdentity(
        { externalId: 'sku-2', name: 'Nivea Creme 200 ml', brand: 'Nivea', package: { quantity: 0.2, unit: 'l' } },
        [candidate()],
      ),
    ]
    resolveTetaIdentityClaims(decisions)
    expect(decisions[0].status).toBe('auto')
    expect(decisions[1].status).toBe('review')
    expect(decisions[1].reason).toContain('another Teta product matches this catalog product better')
    expect(decisions[1].productId).toBeUndefined()
  })

  it('keeps a product that is claimed by one Teta product', () => {
    const decisions = [
      decideTetaIdentity(
        { externalId: 'sku-1', name: 'Nivea Creme 200 ml', brand: 'Nivea', package: { quantity: 0.2, unit: 'l' } },
        [candidate()],
      ),
    ]
    resolveTetaIdentityClaims(decisions)
    expect(decisions[0].status).toBe('auto')
    expect(decisions[0].productId).toBe('product-1')
  })

  it('gives a product to one Teta product when the decisions come as an iterator', () => {
    // The import hands the decisions over as a map's values, which is an iterator: a function that
    // reads it twice would find nothing the second time and leave both claims standing.
    const decisions = new Map([
      ['sku-1', decideTetaIdentity(
        { externalId: 'sku-1', name: 'Nivea Creme 200 ml', brand: 'Nivea', package: { quantity: 0.2, unit: 'l' } },
        [candidate()],
      )],
      ['sku-2', decideTetaIdentity(
        { externalId: 'sku-2', name: 'Nivea Creme 200 ml', brand: 'Nivea', package: { quantity: 0.2, unit: 'l' } },
        [candidate()],
      )],
    ])
    resolveTetaIdentityClaims(decisions.values())
    const claimed = [...decisions.values()].filter((decision) => decision.status === 'auto')
    expect(claimed).toHaveLength(1)
    expect(claimed[0].productId).toBe('product-1')
  })
})
