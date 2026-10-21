// Normalizes Teta's public catalog into the app's product model.
//
// The collector (lib/ingestion/teta-collector.ts) writes what the payload parsers
// (lib/ingestion/teta-payload.ts) read into NDJSON; this module turns one such record into the
// deterministic, validated shape the importer stores. It is pure: no network, no database.
//
// Three rules shape everything here (CLAUDE.md sections 15, 17, 33):
//
//  * Teta's money in the payload is in haléře; the payload layer already divided by 100, so the
//    prices here are CZK.
//  * A unit price is only stored in a unit the app can compare (kg, l, ks). A unit the app
//    cannot express (Teta quotes metres for kitchen rolls) is not a reason to drop the product —
//    the package price is still a fact — but it is flagged.
//  * A package size is only stored when the retailer states it (the product's own "Obsah balení"
//    attribute). A size that only appears in the product name is derived by the shared
//    name-package logic at import time, so there is one implementation of it, not two.

import type { ItemCategory, ItemUnit } from '@/lib/types'
import type { NormalizedPackage } from '@/lib/ingestion/types'
import { mapTetaCategoryCode, mapTetaCategoryName } from '@/lib/ingestion/teta'
import {
  attributeValue,
  type TetaDetailAttribute,
  type TetaDetailPayload,
  type TetaListingItem,
  type TetaListingPayload,
} from '@/lib/ingestion/teta-payload'
import { parseProductQuantities } from '@/lib/product-identity-normalization'

/** Teta's own attribute codes that carry the facts the app stores. */
export const TETA_ATTRIBUTE_PACKAGE_CONTENT = 'OBSAH_BALENI'
export const TETA_ATTRIBUTE_UNIT_COUNT = 'POCET_JEDNOTEK_V_BALENI'
export const TETA_ATTRIBUTE_PACKAGE_TYPE = 'DRUH_BALENI'

const round2 = (value: number): number => Math.round(value * 100) / 100

export type TetaCatalogProduct = {
  /** Teta's own product code (15 digits) — the idempotency key of this record. */
  externalId: string
  /** The short article number shown to shoppers ("Kód: 196442"). */
  articleNumber?: string
  name: string
  slug: string
  url: string
  brand?: string
  /** The retailer's own category path, top level first. */
  categoryPath: string[]
  /** The taxon codes of the same path. */
  categoryCodes: string[]
  /** The app's category, or null when the retailer uses a category the app does not model. */
  category: ItemCategory | null
  /** The price the shopper pays now, in CZK (the action price while an action runs). */
  price: number
  /** The everyday price in CZK, when the product is discounted (the retailer's own base price). */
  regularPrice?: number
  /** The discount the retailer states, in percent. */
  discountPercent?: number
  /** The normalized unit the unit price is expressed in. */
  unit: ItemUnit
  /** The unit price of the current price, in CZK per `unit`. */
  unitPrice: number
  /** The unit price of the everyday price, in CZK per `unit`. */
  regularUnitPrice: number
  /** The unit price exactly as the retailer states it — kept so the unit price can be recomputed
   *  when the package size becomes known (the listing does not know the package, the product page
   *  does). */
  statedUnitPrice?: { amount: number; unit: string }
  /** The package size the retailer states, when it states one. */
  package?: NormalizedPackage
  /** The package size as printed. */
  packageText?: string
  description?: string
  available: boolean
  images: string[]
  updatedAt?: string
  /** The retailer's marketing labels ("V akci", "Exkluzivně online"). */
  tags: string[]
  /** Data problems that need a human look; the record is still imported. */
  warnings: string[]
}

/**
 * Teta's unit-price unit → the app's normalized unit, and the factors that turn a price per one
 * unit of Teta's unit into a price per the app's unit.
 *
 * Verified against five category listings (2026-10-22): Teta quotes per piece ("KS"), per kilogram
 * ("KG"), per litre ("LIT"), per metre ("M") and per dose ("PD") — always per a single unit of that
 * measure. A 75 ml toothpaste at 99,90 Kč quotes 1 332 Kč/litre, a 1,5 kg salt at 49,90 Kč quotes
 * 33,27 Kč/kg, a 100-pack of tissues at 17,90 Kč quotes 0,179 Kč/piece. "G" and "ML" are not
 * published today; they are kept with their two possible bases (per gram and per 100 g), and the
 * package size decides which one the retailer used.
 */
const TETA_UNIT_PRICE_UNITS: Record<string, { unit: ItemUnit; factors: number[]; defaultFactor: number }> = {
  KS: { unit: 'ks', factors: [1], defaultFactor: 1 },
  KG: { unit: 'kg', factors: [1], defaultFactor: 1 },
  LIT: { unit: 'l', factors: [1], defaultFactor: 1 },
  L: { unit: 'l', factors: [1], defaultFactor: 1 },
  PD: { unit: 'dávka', factors: [1], defaultFactor: 1 },
  G: { unit: 'kg', factors: [1000, 10], defaultFactor: 1000 },
  ML: { unit: 'l', factors: [1000, 10], defaultFactor: 1000 },
}

export type TetaUnitPriceResolution = {
  unit: ItemUnit
  unitPrice: number
  /** Set when the stated unit price could not be used as stated. */
  warning?: string
}

/** The unit price the stated package size implies, or null when there is nothing to compare with. */
function expectedTetaUnitPrice(
  priceKc: number,
  packageSize: NormalizedPackage | null | undefined,
  unit: ItemUnit,
): number | null {
  if (!packageSize || !(packageSize.quantity > 0)) return null
  if (packageSize.unit !== unit) return null
  return priceKc / packageSize.quantity
}

/**
 * The unit price the app falls back to when the retailer states none, or states one in a unit the
 * app cannot compare.
 *
 * The package price is never dropped: it is the price of one package, and the app's documented
 * fallback is "one package = one piece". When the package size is known, the price per piece (or
 * per kilogram, per litre) is the comparable number, so that is what is used.
 */
function fallbackTetaUnitPrice(
  priceKc: number,
  packageSize: NormalizedPackage | null | undefined,
): TetaUnitPriceResolution {
  if (packageSize && packageSize.quantity > 0) {
    if (packageSize.unit === 'ks') {
      const count = Math.round(packageSize.quantity)
      if (count > 0) return { unit: 'ks', unitPrice: round2(priceKc / count) }
    } else {
      return { unit: packageSize.unit, unitPrice: round2(priceKc / packageSize.quantity) }
    }
  }
  return { unit: 'ks', unitPrice: round2(priceKc) }
}

/**
 * The unit price the app stores for one product.
 *
 * Without a stated unit price the price is per package (or per piece, when the package size is
 * known) and the unit is "ks" — the price itself is never dropped. With one, the unit is translated
 * into the app's normalized unit. A contradiction between the stated unit price and the stated
 * package size is flagged, never resolved by preferring one number over the other (CLAUDE.md
 * section 33: suspicious data is flagged, not silently rewritten).
 */
export function resolveTetaUnitPrice(
  priceKc: number,
  unitPrice: { amount: number; unit?: string } | undefined,
  packageSize: NormalizedPackage | null | undefined,
): TetaUnitPriceResolution {
  const fallback = fallbackTetaUnitPrice(priceKc, packageSize)
  if (!unitPrice || !Number.isFinite(unitPrice.amount) || unitPrice.amount <= 0) {
    return fallback
  }
  const code = (unitPrice.unit ?? '').trim().toUpperCase()
  const known = TETA_UNIT_PRICE_UNITS[code]
  if (!known) {
    // A unit the app cannot compare (metres, for example) costs the product its unit price, not
    // the product itself: the package price is still a fact, and the package (when it is known)
    // still gives a price per piece.
    return { ...fallback, warning: `unsupported-unit-price:${code || 'none'}` }
  }

  let factor = known.defaultFactor
  let warning: string | undefined
  const expected = expectedTetaUnitPrice(priceKc, packageSize, known.unit)
  if (known.factors.length > 1) {
    // "Per 100 g" and "per gram" differ by a factor of 100; the stated package size decides which
    // one the retailer used.
    if (expected === null) {
      warning = 'unit-price-base-assumed'
    } else {
      const matching = known.factors.find((candidate) =>
        Math.abs(unitPrice.amount * candidate - expected) <= Math.max(0.01, expected * 0.03))
      if (matching === undefined) warning = 'unit-price-base-unclear'
      else factor = matching
    }
  }

  const unitPriceKc = round2(unitPrice.amount * factor)
  if (expected !== null && Math.abs(unitPriceKc - expected) > Math.max(0.01, expected * 0.03)) {
    warning = warning ?? 'unit-price-disagrees-with-package'
  }
  return { unit: known.unit, unitPrice: unitPriceKc, ...(warning ? { warning } : {}) }
}

/**
 * The package size a retailer states in text, e.g. "100 ks", "250 ml", "1,5 l", "6 x 1 l".
 *
 * The result is the total consumer package ("6 x 1 l" is 6 litres, not 1), with the inner
 * structure kept in the package-count fields. A piece count is a count of pieces; a weight or a
 * volume is a size, and the two are never mixed.
 */
export function parseTetaPackageText(text: string | null | undefined): NormalizedPackage | null {
  const quantities = parseProductQuantities(text)
  if (quantities.length === 0) return null
  const quantity = quantities[0]
  if (quantity.value <= 0) return null

  if (quantity.unit === 'ks') {
    // A piece count is the package: "100 ks" is 100 pieces of 1 piece.
    return {
      quantity: quantity.value * quantity.multipackCount,
      unit: 'ks',
      packageCount: quantity.multipackCount > 1 ? quantity.multipackCount : Math.round(quantity.value),
      packageUnitQuantity: 1,
      packageUnit: 'ks',
    }
  }
  if (quantity.unit === 'g' || quantity.unit === 'kg') {
    // "8 x 100 g" is 800 g in total; the inner size is kept in the package-count fields.
    const totalKg = (quantity.baseValue * quantity.multipackCount) / 1000
    if (totalKg <= 0) return null
    return {
      quantity: round2(totalKg),
      unit: 'kg',
      ...(quantity.multipackCount > 1
        ? {
            packageCount: quantity.multipackCount,
            packageUnitQuantity: round2(quantity.baseValue / 1000),
            packageUnit: 'kg' as const,
          }
        : {}),
    }
  }
  // ml / l
  const totalL = (quantity.baseValue * quantity.multipackCount) / 1000
  if (totalL <= 0) return null
  return {
    quantity: round2(totalL),
    unit: 'l',
    ...(quantity.multipackCount > 1
      ? {
          packageCount: quantity.multipackCount,
          packageUnitQuantity: round2(quantity.baseValue / 1000),
          packageUnit: 'l' as const,
        }
      : {}),
  }
}

/** The retailer's own package facts, read from the product's attributes. */
export type TetaPackageFacts = {
  package?: NormalizedPackage
  packageText?: string
  packageType?: string
  warnings: string[]
}

/** Reads the package size the product page states, and the piece count it states next to it. */
export function resolveTetaPackage(attributes: TetaDetailAttribute[]): TetaPackageFacts {
  const warnings: string[] = []
  const packageText = attributeValue(attributes, TETA_ATTRIBUTE_PACKAGE_CONTENT)
  const packageType = attributeValue(attributes, TETA_ATTRIBUTE_PACKAGE_TYPE)
  const unitCountText = attributeValue(attributes, TETA_ATTRIBUTE_UNIT_COUNT)
  const packageSize = parseTetaPackageText(packageText)

  if (packageText && !packageSize) warnings.push('package-content-unreadable')
  if (packageSize && unitCountText) {
    const unitCount = Number(unitCountText.replace(',', '.'))
    if (!Number.isFinite(unitCount) || unitCount <= 0) {
      warnings.push('package-unit-count-unreadable')
    } else if (packageSize.unit === 'ks' && Math.round(packageSize.quantity) !== Math.round(unitCount)) {
      // The stated content and the stated piece count disagree (e.g. "100 ks" vs 60 pieces). The
      // content is the more specific statement and wins; the contradiction is flagged.
      warnings.push('package-unit-count-disagrees')
    } else if (packageSize.unit !== 'ks') {
      // "250 ml" with "2 pieces in the package": the piece count describes the inner units.
      const pieceCount = Math.round(unitCount)
      if (pieceCount > 0) {
        packageSize.packageCount = pieceCount
        packageSize.packageUnitQuantity = 1
        packageSize.packageUnit = 'ks'
      }
    }
  }

  return {
    ...(packageSize ? { package: packageSize } : {}),
    ...(packageText ? { packageText } : {}),
    ...(packageType ? { packageType } : {}),
    warnings,
  }
}

/** A short, stable description of the package structure, used as the trade item's signature. */
export function tetaPackageSignature(packageSize: NormalizedPackage | null | undefined): string | null {
  if (!packageSize || !(packageSize.quantity > 0)) return null
  const total = `${round2(packageSize.quantity)}${packageSize.unit}`
  if (packageSize.packageCount && packageSize.packageCount > 1) {
    return `${packageSize.packageCount}x${total}`
  }
  return total
}

/** The product's name as the catalog stores it: the brand in front, unless the name starts with it. */
export function tetaCatalogName(name: string, brand: string | undefined): string {
  const base = name.trim()
  const brandName = (brand ?? '').trim()
  if (!brandName) return base
  if (base.toLowerCase().startsWith(brandName.toLowerCase())) return base
  return `${brandName} ${base}`
}

function buildCatalogProduct(input: {
  externalId: string
  articleNumber?: string
  name: string
  slug: string
  brand?: string
  categoryPath: string[]
  categoryCodes: string[]
  /** The price the shopper pays now. */
  price: number
  /** The everyday price, when the product is discounted. */
  regularPrice?: number
  /** The discount the retailer states, in percent. */
  discountPercent?: number
  unitPrice?: { amount: number; unit?: string }
  priceWarnings?: string[]
  packageFacts?: TetaPackageFacts
  description?: string
  available: boolean
  images: string[]
  updatedAt?: string
  tags: string[]
}): TetaCatalogProduct | null {
  const externalId = input.externalId.trim()
  const name = input.name.trim()
  if (!externalId || !name) return null
  if (!Number.isFinite(input.price) || input.price <= 0) return null

  const warnings = [...(input.priceWarnings ?? []), ...(input.packageFacts?.warnings ?? [])]
  const packageSize = input.packageFacts?.package
  const resolved = resolveTetaUnitPrice(input.price, input.unitPrice, packageSize)
  if (resolved.warning) warnings.push(resolved.warning)

  // The everyday price and the current price: Teta's action price is what the shopper pays while
  // the action runs; the base price is the price of the product otherwise. The unit price of the
  // everyday price is the unit price of the current price scaled by the same ratio — the price
  // history keeps the everyday price, the promotion is a separate fact (the same handling as the
  // DM, Billa and Penny connectors).
  const discounted = input.regularPrice !== undefined && input.regularPrice > input.price
  const regularPrice = discounted ? (input.regularPrice as number) : input.price
  const regularUnitPrice = discounted
    ? round2((resolved.unitPrice * regularPrice) / input.price)
    : resolved.unitPrice

  // The app's category comes from the top-level category: by its taxon code first (the stable
  // key), by its display name second.
  const category =
    mapTetaCategoryCode(input.categoryCodes[0]) ?? mapTetaCategoryName(input.categoryPath[0])

  return {
    externalId,
    ...(input.articleNumber ? { articleNumber: input.articleNumber } : {}),
    name,
    slug: input.slug,
    url: `https://www.tetadrogerie.cz/eshop/katalog/${input.slug}`,
    ...(input.brand ? { brand: input.brand } : {}),
    categoryPath: input.categoryPath,
    categoryCodes: input.categoryCodes,
    category,
    price: round2(input.price),
    ...(discounted ? { regularPrice: round2(regularPrice) } : {}),
    ...(input.discountPercent !== undefined ? { discountPercent: input.discountPercent } : {}),
    unit: resolved.unit,
    unitPrice: round2(resolved.unitPrice),
    regularUnitPrice: round2(regularUnitPrice),
    ...(input.unitPrice
      ? { statedUnitPrice: { amount: input.unitPrice.amount, unit: input.unitPrice.unit ?? '' } }
      : {}),
    ...(packageSize ? { package: packageSize } : {}),
    ...(input.packageFacts?.packageText ? { packageText: input.packageFacts.packageText } : {}),
    ...(input.description ? { description: input.description } : {}),
    available: input.available,
    images: input.images,
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
    tags: input.tags,
    warnings,
  }
}

/** Normalizes one product of a category listing page. */
export function tetaCatalogFromListing(item: TetaListingItem): TetaCatalogProduct | null {
  return buildCatalogProduct({
    externalId: item.code,
    ...(item.articleNumber ? { articleNumber: item.articleNumber } : {}),
    name: item.name,
    slug: item.slug,
    ...(item.brand ? { brand: item.brand } : {}),
    categoryPath: item.categoryPath,
    categoryCodes: item.categoryCodes,
    price: item.price.amount,
    ...(item.price.regularAmount !== undefined ? { regularPrice: item.price.regularAmount } : {}),
    ...(item.price.discountPercent !== undefined ? { discountPercent: item.price.discountPercent } : {}),
    ...(item.price.unitAmount !== undefined
      ? { unitPrice: { amount: item.price.unitAmount, ...(item.price.unit ? { unit: item.price.unit } : {}) } }
      : {}),
    priceWarnings: item.price.warnings,
    available: item.available,
    images: item.image ? [item.image] : [],
    tags: [],
  })
}

/** Normalizes one product page, which carries the attributes the listing does not have. */
export function tetaCatalogFromDetail(detail: TetaDetailPayload): TetaCatalogProduct | null {
  const product = detail.product
  const packageFacts = resolveTetaPackage(detail.attributes)
  return buildCatalogProduct({
    externalId: product.code,
    name: product.name,
    slug: product.slug,
    ...(product.brand ? { brand: product.brand } : {}),
    categoryPath: product.categoryPath,
    categoryCodes: product.categoryCodes,
    price: product.price.amount,
    ...(product.price.regularAmount !== undefined ? { regularPrice: product.price.regularAmount } : {}),
    ...(product.price.discountPercent !== undefined ? { discountPercent: product.price.discountPercent } : {}),
    ...(product.price.unitAmount !== undefined
      ? { unitPrice: { amount: product.price.unitAmount, ...(product.price.unit ? { unit: product.price.unit } : {}) } }
      : {}),
    priceWarnings: product.price.warnings,
    packageFacts,
    ...(product.description ? { description: product.description } : {}),
    available: product.available,
    images: product.images,
    ...(product.updatedAt ? { updatedAt: product.updatedAt } : {}),
    tags: [],
  })
}

/** Every product of a category listing page, normalized. */
export function tetaCatalogFromListingPayload(payload: TetaListingPayload): TetaCatalogProduct[] {
  const products: TetaCatalogProduct[] = []
  for (const item of payload.items) {
    const product = tetaCatalogFromListing(item)
    if (product) products.push(product)
  }
  return products
}

/**
 * Combines what the listing and the product page each know.
 *
 * The listing knows the price and the stock; the product page knows the attributes (package size,
 * brand) and the description. The product page wins wherever both have a value, because it is the
 * page about that one product — but a field the product page does not carry (the listing's stock
 * flag) is kept from the listing.
 */
export function mergeTetaCatalogProducts(
  listing: TetaCatalogProduct | null,
  detail: TetaCatalogProduct | null,
): TetaCatalogProduct | null {
  if (!listing) return detail
  if (!detail) return listing
  const merged: TetaCatalogProduct = {
    ...listing,
    ...detail,
    // The app's category is the one the catalog understands; a product page that names a category
    // the app does not model does not erase the category the listing gave.
    category: detail.category ?? listing.category,
    // The listing's own stock flag is the only stock fact there is.
    available: listing.available && detail.available,
    // Warnings from both sides are kept: the listing can flag a problem the product page does not
    // know about and the other way round.
    warnings: [...new Set([...listing.warnings, ...detail.warnings])],
    // The description only the product page has.
    ...(detail.description ? { description: detail.description } : { ...(listing.description ? { description: listing.description } : {}) }),
    images: detail.images.length > 0 ? detail.images : listing.images,
  }

  // The unit price is recomputed from the merged facts: the listing knows the price but not the
  // package, the product page knows both — and a price per piece is only possible with the
  // package. The price is the same in both layers, so the recomputation is deterministic.
  const stated = merged.statedUnitPrice
  const resolved = resolveTetaUnitPrice(
    merged.price,
    stated ? { amount: stated.amount, unit: stated.unit } : undefined,
    merged.package ?? null,
  )
  merged.unit = resolved.unit
  merged.unitPrice = round2(resolved.unitPrice)
  merged.regularUnitPrice = merged.regularPrice
    ? round2((resolved.unitPrice * merged.regularPrice) / merged.price)
    : round2(resolved.unitPrice)
  if (resolved.warning) merged.warnings = [...new Set([...merged.warnings, resolved.warning])]
  return merged
}
