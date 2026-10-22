import { eq, inArray } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { normalizeDmGtin, normalizeDmProduct, type DmRawProduct } from '@/lib/ingestion/dm'
import { gtinCheckDigit, isValidGtin } from '@/lib/ingestion/gtin'
import { persistTradeItemBarcodes } from '@/lib/db/queries'

// The barcode DM states for its own SKU, and what the app does with it: it is written on the
// product's trade item, and a barcode that already belongs to another trade item is left alone.
//
// The database part writes real rows into the test branch and cleans them up afterwards.

const db = getDb()
const tag = crypto.randomUUID()
const productIds: string[] = []

// A real DM tile (Colgate children's toothbrush, 2026-10-22).
const tile = (overrides: Partial<DmRawProduct> = {}): DmRawProduct => ({
  dan: 1492228,
  gtin: 8718951614024,
  brand: { name: 'Colgate' },
  title: { tileHeadline: 'dětský zubní kartáček Kids Bluey 3-5 let' },
  price: {
    price: { current: { value: '69,50 Kč' } },
    tileInfos: ['1 ks (69,50 Kč za 1 ks)'],
  },
  trackingData: { price: 69.5, currency: 'CZK' },
  topCategory: 'péče o zdraví',
  ...overrides,
})

async function createProduct(name: string): Promise<string> {
  const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Drogerie') })
  const [product] = await db
    .insert(schema.products)
    .values({ name, categoryId: category!.id, defaultUnit: 'ks' })
    .returning()
  productIds.push(product.id)
  return product.id
}

describe('GTIN format', () => {
  it('accepts a barcode whose check digit is right', () => {
    expect(isValidGtin('8718951614024')).toBe(true)
  })

  it('rejects a barcode with a wrong check digit', () => {
    expect(isValidGtin('8718951614025')).toBe(false)
  })

  it('rejects a code that is not a GTIN length', () => {
    expect(isValidGtin('1234567')).toBe(false)
    expect(isValidGtin('87189516140241')).toBe(false)
  })

  it('computes the check digit of the whole family', () => {
    // EAN-8 96385074, GTIN-12 123456789012, EAN-13 4006381333931, GTIN-14 12345678901231
    expect(gtinCheckDigit('9638507')).toBe(4)
    expect(gtinCheckDigit('12345678901')).toBe(2)
    expect(gtinCheckDigit('400638133393')).toBe(1)
    expect(gtinCheckDigit('1234567890123')).toBe(1)
  })
})

describe('DM barcode', () => {
  it('passes the barcode DM states on the product', () => {
    const product = normalizeDmProduct(tile(), '2026-10-22')
    expect(product?.ean).toBe('8718951614024')
  })

  it('keeps the product when the barcode is malformed', () => {
    // A wrong check digit costs the barcode, not the product: the price and the name are still good.
    const product = normalizeDmProduct(tile({ gtin: 8718951614025 }), '2026-10-22')
    expect(product).not.toBeNull()
    expect(product?.ean).toBeUndefined()
  })

  it('reads no barcode from a product that states none', () => {
    expect(normalizeDmGtin(undefined)).toBeNull()
    expect(normalizeDmProduct(tile({ gtin: undefined }), '2026-10-22')?.ean).toBeUndefined()
  })
})

describe('storing a barcode on a trade item', () => {
  afterAll(async () => {
    // The identifiers point at the trade items, which point at the products — deleting the
    // products takes the rest with it.
    if (productIds.length > 0) {
      await db.delete(schema.products).where(inArray(schema.products.id, productIds))
    }
  })

  it('writes the barcode on the product’s trade item and keeps it on a second run', async () => {
    const productId = await createProduct(`__Test DM ${tag} kartáček`)
    const evidence = [{ productId, externalId: '1492228', source: 'dm', ean: '8718951614024', observedAt: '2026-10-22' }]

    const first = await persistTradeItemBarcodes(evidence)
    expect(first.identifiers).toBe(1)
    expect(first.conflicts).toBe(0)

    const rows = await db.query.tradeItemIdentifiers.findMany({ where: eq(schema.tradeItemIdentifiers.value, '8718951614024') })
    expect(rows).toHaveLength(1)
    expect(rows[0].scheme).toBe('GTIN')
    expect(rows[0].market).toBe('CZ')
    expect(rows[0].verificationStatus).toBe('source_confirmed')
    expect(rows[0].verificationSource).toBe('dm')

    // The identifier sits on the trade item of that SKU.
    const tradeItem = await db.query.tradeItems.findFirst({ where: eq(schema.tradeItems.id, rows[0].tradeItemId) })
    expect(tradeItem?.productId).toBe(productId)
    expect(tradeItem?.packageSignature).toBe('dm:1492228')

    // The same run again changes nothing.
    const second = await persistTradeItemBarcodes(evidence)
    expect(second.identifiers).toBe(1)
    expect(await db.query.tradeItemIdentifiers.findMany({ where: eq(schema.tradeItemIdentifiers.value, '8718951614024') })).toHaveLength(1)
  })

  it('does not move a barcode that already belongs to another trade item', async () => {
    const firstProductId = await createProduct(`__Test DM ${tag} první`)
    const secondProductId = await createProduct(`__Test DM ${tag} druhý`)

    await persistTradeItemBarcodes([{ productId: firstProductId, externalId: '1000001', source: 'dm', ean: '4006381333931', observedAt: '2026-10-22' }])
    const again = await persistTradeItemBarcodes([{ productId: secondProductId, externalId: '1000002', source: 'dm', ean: '4006381333931', observedAt: '2026-10-22' }])

    expect(again.identifiers).toBe(0)
    expect(again.conflicts).toBe(1)

    // The barcode still belongs to the first product.
    const rows = await db.query.tradeItemIdentifiers.findMany({ where: eq(schema.tradeItemIdentifiers.value, '4006381333931') })
    expect(rows).toHaveLength(1)
    const tradeItem = await db.query.tradeItems.findFirst({ where: eq(schema.tradeItems.id, rows[0].tradeItemId) })
    expect(tradeItem?.productId).toBe(firstProductId)
  })

  it('writes nothing for an empty batch', async () => {
    expect(await persistTradeItemBarcodes([])).toEqual({ tradeItems: 0, identifiers: 0, conflicts: 0 })
  })
})
