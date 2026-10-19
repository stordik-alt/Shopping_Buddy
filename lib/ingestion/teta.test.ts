import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dryRunTeta, mapTetaCategory, normalizeTetaProduct, parseTetaFixture, type TetaRawProduct } from '@/lib/ingestion/teta'
import { toTetaRawProduct, validateTetaSnapshotIdentity, type TetaProductSnapshot } from '@/lib/ingestion/teta-source-model'

const TODAY = '2026-10-19'
const base: TetaRawProduct = { id: 'X1', name: 'Gel', price: 60, currency: 'CZK', categoryPath: ['Péče o tělo'] }
const fixture = () => parseTetaFixture(readFileSync(join(__dirname, 'fixtures/teta-catalog.sample.json'), 'utf8'))

describe('normalizeTetaProduct', () => {
  it('normalizes price per 100 ml to Kč/l and prefixes the brand', () => {
    const p = normalizeTetaProduct({ ...base, brand: 'B', package: { amount: '250', unit: 'ml' }, unitPrice: { price: 24, per: 100, unit: 'ml' } }, TODAY)
    expect(p).toMatchObject({ externalId: 'X1', name: 'B Gel', unit: 'l', unitPrice: 240, regularPrice: 60, category: 'Drogerie' })
  })
  it('falls back to 1 ks without unit price', () => {
    expect(normalizeTetaProduct(base, TODAY)).toMatchObject({ unit: 'ks', unitPrice: 60 })
  })
  it('maps the current public catalog category labels', () => {
    expect(mapTetaCategory({ ...base, categoryPath: ['Tělo'] })).toBe('Drogerie')
    expect(mapTetaCategory({ ...base, categoryPath: ['Pleť'] })).toBe('Drogerie')
    expect(mapTetaCategory({ ...base, categoryPath: ['Potraviny'] })).toBe('Potraviny')
    expect(mapTetaCategory({ ...base, categoryPath: ['Mazlíčci'] })).toBe('Ostatní')
  })
  it('rejects invalid records', () => {
    expect(normalizeTetaProduct({ ...base, id: ' ' }, TODAY)).toBeNull()
    expect(normalizeTetaProduct({ ...base, price: 0 }, TODAY)).toBeNull()
    expect(normalizeTetaProduct({ ...base, currency: 'EUR' }, TODAY)).toBeNull()
    expect(normalizeTetaProduct({ ...base, categoryPath: ['Jiné'] }, TODAY)).toBeNull()
    expect(mapTetaCategory({ ...base, categoryPath: undefined })).toBeNull()
  })
  it('rejects a unit price contradicting the package', () => {
    expect(normalizeTetaProduct({ ...base, package: { amount: '250', unit: 'ml' }, unitPrice: { price: 99, per: 100, unit: 'ml' } }, TODAY)).toBeNull()
  })
  it('stores a deal only with a stated future end date', () => {
    const promo = { ...base, originalPrice: 90 }
    expect(normalizeTetaProduct({ ...promo, promotionValidUntil: '2026-12-01' }, TODAY)?.deal).toMatchObject({ dealPrice: 60, validUntil: '2026-12-01' })
    const noEnd = normalizeTetaProduct(promo, TODAY)
    expect(noEnd?.deal).toBeUndefined()
    expect(noEnd).toMatchObject({ promotionWithoutValidity: true, regularPrice: 90 })
    expect(normalizeTetaProduct({ ...promo, promotionValidUntil: '2026-01-01' }, TODAY)?.deal).toBeUndefined()
  })
  it('rejects malformed unit price, null records and impossible dates', () => {
    expect(normalizeTetaProduct({ ...base, unitPrice: { price: 10, per: 0, unit: 'ml' } }, TODAY)).toBeNull()
    expect(normalizeTetaProduct({ ...base, unitPrice: { price: -1, per: 100, unit: 'ml' } }, TODAY)).toBeNull()
    expect(normalizeTetaProduct(null as unknown as TetaRawProduct, TODAY)).toBeNull()
    expect(normalizeTetaProduct({ ...base, originalPrice: 90, promotionValidUntil: '2026-13-45' }, TODAY)?.deal).toBeUndefined()
  })
  it('normalizes known mass units and rejects an explicitly stated unsupported unit', () => {
    expect(normalizeTetaProduct({ ...base, price: 30, package: { amount: '500', unit: 'g' }, unitPrice: { price: 6, per: 100, unit: 'g' } }, TODAY)).toMatchObject({ unit: 'kg', unitPrice: 60 })
    expect(normalizeTetaProduct({ ...base, unitPrice: { price: 2, per: 1, unit: 'PD' } }, TODAY)).toBeNull()
    expect(normalizeTetaProduct(base, TODAY)).toMatchObject({ unit: 'ks', unitPrice: 60 })
  })
  it('scales the unit price of a promotion with the price ratio', () => {
    const p = normalizeTetaProduct({ ...base, price: 50, originalPrice: 100, unitPrice: { price: 20, per: 100, unit: 'ml' }, package: { amount: '250', unit: 'ml' }, promotionValidUntil: '2026-12-01' }, TODAY)
    expect(p).toMatchObject({ regularPrice: 100, unitPrice: 400 })
    expect(p?.deal).toMatchObject({ dealPrice: 50, unitPrice: 200 })
  })
  it('ignores club price', () => {
    expect(normalizeTetaProduct({ ...base, clubPrice: 10 }, TODAY)?.regularPrice).toBe(60)
  })
})

describe('dryRunTeta with the fixture', () => {
  it('reports accepted, rejected, duplicates and deals without side effects', () => {
    const r = dryRunTeta(fixture(), TODAY)
    expect(r.total).toBe(6)
    expect(r.accepted.map((p) => p.externalId)).toEqual(['TEST-1', 'TEST-2', 'TEST-3'])
    expect(r.rejected.map((x) => x.id)).toEqual(['TEST-4', 'TEST-5'])
    expect(r.duplicates).toEqual(['TEST-1'])
    expect(r.deals).toBe(1)
    expect(r.promotionsWithoutValidity).toBe(1)
  })
  it('is repeatable and dedupes trimmed ids, tolerating null records', () => {
    const records = [...fixture(), { ...base, id: ' TEST-1 ' }, null as unknown as TetaRawProduct]
    const a = dryRunTeta(records, TODAY)
    expect(a.duplicates).toEqual(['TEST-1', 'TEST-1'])
    expect(a.rejected.at(-1)).toMatchObject({ reason: 'not an object' })
    expect(dryRunTeta(records, TODAY)).toEqual(a)
  })
  it('rejects a malformed fixture', () => {
    expect(() => parseTetaFixture('{}')).toThrow()
  })
})


describe('Teta source snapshot model', () => {
  const snapshot: TetaProductSnapshot = {
    catalog: {
      sourceId: '292414',
      productUrl: 'https://www.tetadrogerie.cz/eshop/katalog/sample',
      name: 'Mléčná výživa',
      brand: 'Happy Mimi',
      categoryPath: ['Péče o dítě', 'Výživa'],
      package: { amount: '400', unit: 'g' },
      displayedPrice: { amount: 149.9, currency: 'CZK' },
      regularPrice: { amount: 169.9, currency: 'CZK' },
      unitPrice: { amount: 374.75, per: 1, unit: 'kg' },
      onlineAvailability: 'unavailable',
    },
    detail: {
      sourceId: '292414',
      productUrl: 'https://www.tetadrogerie.cz/eshop/katalog/sample',
      ean: '8590273645524',
      attributes: { age: '0m+' },
      discontinued: true,
    },
    offers: [
      { kind: 'club', price: { amount: 139.9, currency: 'CZK' } },
      { kind: 'multi_buy', price: { amount: 129.9, currency: 'CZK' }, minimumQuantity: 2, terms: 'při nákupu 2 ks' },
      { kind: 'promotion', price: { amount: 149.9, currency: 'CZK' }, validUntil: '2026-12-31' },
    ],
    availability: [{ scope: 'online', status: 'unavailable', checkedAt: '2026-10-19T12:00:00Z' }],
  }

  it('merges catalog and detail without flattening club or multi-buy prices', () => {
    expect(toTetaRawProduct(snapshot)).toMatchObject({
      id: '292414',
      name: 'Mléčná výživa',
      brand: 'Happy Mimi',
      price: 149.9,
      originalPrice: 169.9,
      currency: 'CZK',
      ean: '8590273645524',
      package: { amount: '400', unit: 'g' },
      promotionValidUntil: '2026-12-31',
      clubPrice: undefined,
    })
  })

  it('flags cross-page identity mismatches and invalid EANs', () => {
    expect(validateTetaSnapshotIdentity(snapshot)).toEqual([])
    expect(validateTetaSnapshotIdentity({
      ...snapshot,
      detail: { ...snapshot.detail!, sourceId: 'different-id', ean: 'not-an-ean' },
    })).toEqual(['catalog/detail source id mismatch', 'invalid EAN format'])
  })

  it('requires store id for branch availability and quantity for multi-buy offers', () => {
    expect(validateTetaSnapshotIdentity({
      ...snapshot,
      availability: [{ scope: 'store', status: 'available', checkedAt: '2026-10-19T12:00:00Z' }],
      offers: [{ kind: 'multi_buy', price: { amount: 10, currency: 'CZK' } }],
    })).toEqual(['store availability missing store id', 'multi-buy offer requires minimum quantity of at least 2'])
  })

  it('does not treat a conditional promotion as a normal promotion', () => {
    const conditional: TetaProductSnapshot = {
      ...snapshot,
      offers: [{ kind: 'promotion', price: { amount: 149.9, currency: 'CZK' }, validUntil: '2026-12-31', minimumQuantity: 2 }],
    }
    expect(toTetaRawProduct(conditional).promotionValidUntil).toBeUndefined()
  })
})
