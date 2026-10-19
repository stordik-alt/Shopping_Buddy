import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dryRunTeta, mapTetaCategory, normalizeTetaProduct, parseTetaFixture, type TetaRawProduct } from '@/lib/ingestion/teta'

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
  it('rejects a malformed fixture', () => {
    expect(() => parseTetaFixture('{}')).toThrow()
  })
})
