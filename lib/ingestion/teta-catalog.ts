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

/**
 * A package size, in the unit the app stores it (kilogrammes, litres, pieces).
 *
 * Teta states small packages in grams and millilitres ("4,8 g", "2 x 4,5 g"), and the app stores
 * them in kilogrammes and litres. Two decimals are not enough: 4,8 g is 0,0048 kg, and rounding
 * that to two decimals gives 0 kg — a package size of zero, which the database refuses and which
 * would silently lose the retailer's statement. Six decimals keep a stated size positive and
 * exact to the milligram.
 */
const PACKAGE_SIZE_PRECISION = 1_000_000

const roundPackageSize = (value: number): number => Math.round(value * PACKAGE_SIZE_PRECISION) / PACKAGE_SIZE_PRECISION

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
   *  does). When the price is a conditional (club) price, the stated unit price belongs to that
   *  other price and is not the unit price of the price the shopper pays. */
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

/**
 * The record's price and its stated unit price describe a different size than the package
 * statement does — the record contradicts itself.
 *
 * A record that says two different things states no size that can be trusted, so the identity
 * matcher never links such a product automatically.
 */
export const TETA_WARNING_UNIT_PRICE_DISAGREES = 'unit-price-disagrees-with-package'

/**
 * The record's discount is a conditional (club) price, not a promotion.
 *
 * Teta states a club price next to the everyday price: the shopper pays the everyday price, and the
 * discount applies only under a condition ("if the conditions are met"). The unit price the retailer
 * publishes then belongs to that conditional price and not to the price the shopper pays — such a
 * record does not contradict itself, its unit price simply describes another price. The unit price
 * of the price the shopper pays is the price of the package divided by the package.
 */
export const TETA_WARNING_CONDITIONAL_PRICE = 'conditional-price'

/**
 * Whether the record's discount is a conditional (club) price rather than a promotion.
 *
 * The everyday price above the current price is a promotion the shopper pays. A discount without
 * that everyday price is a discount on another price — the club price — so the published unit price
 * belongs to that other price.
 */
export function hasConditionalTetaPrice(record: {
  price: number
  regularPrice?: number
  discountPercent?: number
}): boolean {
  if (record.discountPercent === undefined) return false
  return !(record.regularPrice !== undefined && record.regularPrice > record.price)
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
    warning = warning ?? TETA_WARNING_UNIT_PRICE_DISAGREES
  }
  return { unit: known.unit, unitPrice: unitPriceKc, ...(warning ? { warning } : {}) }
}

/**
 * The unit price of the price the shopper pays, when the retailer's published unit price belongs to
 * a conditional (club) price.
 *
 * The package size gives it exactly: the price of the package divided by the package. Without a
 * package size the retailer's own unit price is corrected by the stated discount — the conditional
 * price is the price the shopper pays less the discount, so the unit price of the price the shopper
 * pays is the published one divided by what is left of the price.
 */
function resolveConditionalTetaUnitPrice(
  priceKc: number,
  stated: { amount: number; unit?: string } | undefined,
  discountPercent: number,
  packageSize: NormalizedPackage | null | undefined,
): TetaUnitPriceResolution {
  if (packageSize && packageSize.quantity > 0) return fallbackTetaUnitPrice(priceKc, packageSize)
  const remaining = 1 - discountPercent / 100
  if (!stated || !(remaining > 0) || stated.amount <= 0) {
    return fallbackTetaUnitPrice(priceKc, packageSize)
  }
  return resolveTetaUnitPrice(
    priceKc,
    { amount: stated.amount / remaining, ...(stated.unit ? { unit: stated.unit } : {}) },
    null,
  )
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
    const pieces = Math.round(quantity.value * quantity.multipackCount)
    // A fraction of a piece is not a pack ("0,4 ks"): there is nothing to store, and the caller
    // reports the statement as unreadable instead of storing a package of zero pieces.
    if (pieces < 1) return null
    return {
      quantity: pieces,
      unit: 'ks',
      packageCount: quantity.multipackCount > 1 ? quantity.multipackCount : pieces,
      packageUnitQuantity: 1,
      packageUnit: 'ks',
    }
  }
  if (quantity.unit === 'g' || quantity.unit === 'kg') {
    // "8 x 100 g" is 800 g in total; the inner size is kept in the package-count fields.
    const totalKg = roundPackageSize((quantity.baseValue * quantity.multipackCount) / 1000)
    if (totalKg <= 0) return null
    const innerKg = roundPackageSize(quantity.baseValue / 1000)
    return {
      quantity: totalKg,
      unit: 'kg',
      ...(quantity.multipackCount > 1 && innerKg > 0
        ? {
            packageCount: quantity.multipackCount,
            packageUnitQuantity: innerKg,
            packageUnit: 'kg' as const,
          }
        : {}),
    }
  }
  // ml / l
  const totalL = roundPackageSize((quantity.baseValue * quantity.multipackCount) / 1000)
  if (totalL <= 0) return null
  const innerL = roundPackageSize(quantity.baseValue / 1000)
  return {
    quantity: totalL,
    unit: 'l',
    ...(quantity.multipackCount > 1 && innerL > 0
      ? {
          packageCount: quantity.multipackCount,
          packageUnitQuantity: innerL,
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
  const total = `${roundPackageSize(packageSize.quantity)}${packageSize.unit}`
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
  // A discount the everyday price does not show is a conditional (club) price: the published unit
  // price belongs to that other price, so the unit price of the price the shopper pays is derived.
  const conditional =
    input.discountPercent !== undefined &&
    hasConditionalTetaPrice({
      price: input.price,
      ...(input.regularPrice !== undefined ? { regularPrice: input.regularPrice } : {}),
      discountPercent: input.discountPercent,
    })
  const resolved =
    conditional && input.discountPercent !== undefined
      ? resolveConditionalTetaUnitPrice(input.price, input.unitPrice, input.discountPercent, packageSize)
      : resolveTetaUnitPrice(input.price, input.unitPrice, packageSize)
  if (conditional) warnings.push(TETA_WARNING_CONDITIONAL_PRICE)
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
 * The package size of a collected record, derived again from the retailer's own statement.
 *
 * A collected record carries both the statement the product page makes ("75 ml") and the size parsed
 * from it. The statement is the evidence; the parsed size is only a reading of it. When the two
 * disagree — a catalog collected before a parser was corrected reads its sizes with the old
 * rounding — the statement wins and the size is derived again with the current code, so a collected
 * catalog is read the way the code reads it today.
 */
export function tetaPackageFromStatement(record: {
  package?: NormalizedPackage
  packageText?: string
  name?: string
}): NormalizedPackage | undefined {
  const statement = record.packageText
  if (!statement) return record.package
  const parsed = parseTetaPackageText(statement)
  // A statement that cannot be read leaves the parsed size as it is: the size was read from the
  // same statement once, and an unreadable statement says nothing new.
  if (!parsed) return record.package
  return tetaPackageWithNameSize(parsed, record.name)
}

/**
 * The package size, with the structure the product's own name states.
 *
 * Teta states the content of one unit ("50 ml") and, in another attribute, how many units the
 * package holds ("2"). The two together are a multipack — but only when the name says so as well
 * ("2 x 50 ml"). The piece count is also how many pieces a display box holds, and a display box is
 * not part of the product the shopper buys: "Garnier Sorbet pleťový krém 85 ml" is one jar,
 * however many jars the box holds. So a name that states no multiplier says the product is one
 * unit, and a name that states the multiplier makes the package that many units of the stated
 * size — which is the size the shopper compares prices by.
 */
function tetaPackageWithNameSize(
  packageSize: NormalizedPackage,
  name: string | undefined,
): NormalizedPackage {
  // The statement says the whole structure ("2 x 75 ml", "3 ks"): it is the retailer's own
  // statement of the package, and nothing has to be added to it.
  if (packageSize.packageCount !== undefined) return packageSize

  const multipack = parseProductQuantities(name).find((quantity) => quantity.multipackCount > 1)
  if (!multipack) return packageSize

  // The name's unit has to be the one the package is measured in, and the inner size has to be
  // the size the package states — otherwise the name states a different product.
  const nameBaseUnit = packageSize.unit === 'kg' ? 'g' : packageSize.unit === 'l' ? 'ml' : null
  if (!nameBaseUnit || multipack.baseUnit !== nameBaseUnit) return packageSize
  const statedBase = packageSize.quantity * 1000
  if (Math.abs(multipack.baseValue - statedBase) > Math.max(0.05, statedBase * 0.001)) {
    return packageSize
  }

  return {
    quantity: roundPackageSize((multipack.baseValue * multipack.multipackCount) / 1000),
    unit: packageSize.unit,
    packageCount: multipack.multipackCount,
    packageUnitQuantity: packageSize.quantity,
    packageUnit: packageSize.unit,
  }
}

/**
 * The collected record with the package size derived again from the retailer's own statement, and
 * the unit price derived again from that size.
 *
 * The unit price and the size are two readings of the same facts, so they are read together: a
 * record whose size is derived again gets the unit price that belongs to it, and the warning about
 * the two disagreeing is stated again as well.
 */
export function tetaRecordWithDerivedPackage(record: TetaCatalogProduct): TetaCatalogProduct {
  const packageSize = tetaPackageFromStatement(record)
  const conditional = hasConditionalTetaPrice(record)
  const resolved =
    conditional && record.discountPercent !== undefined
      ? resolveConditionalTetaUnitPrice(
          record.price,
          record.statedUnitPrice,
          record.discountPercent,
          packageSize,
        )
      : resolveTetaUnitPrice(record.price, record.statedUnitPrice, packageSize ?? null)
  const warnings = new Set(record.warnings.filter((warning) => !warning.startsWith('unit-price-')))
  if (conditional) warnings.add(TETA_WARNING_CONDITIONAL_PRICE)
  if (resolved.warning) warnings.add(resolved.warning)
  return {
    ...record,
    ...(packageSize ? { package: packageSize } : {}),
    unit: resolved.unit,
    unitPrice: round2(resolved.unitPrice),
    regularUnitPrice: record.regularPrice
      ? round2((resolved.unitPrice * record.regularPrice) / record.price)
      : round2(resolved.unitPrice),
    warnings: [...warnings],
  }
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
  const conditional = hasConditionalTetaPrice(merged)
  const resolved =
    conditional && merged.discountPercent !== undefined
      ? resolveConditionalTetaUnitPrice(
          merged.price,
          stated ? { amount: stated.amount, unit: stated.unit } : undefined,
          merged.discountPercent,
          merged.package ?? null,
        )
      : resolveTetaUnitPrice(
          merged.price,
          stated ? { amount: stated.amount, unit: stated.unit } : undefined,
          merged.package ?? null,
        )
  merged.unit = resolved.unit
  merged.unitPrice = round2(resolved.unitPrice)
  merged.regularUnitPrice = merged.regularPrice
    ? round2((resolved.unitPrice * merged.regularPrice) / merged.price)
    : round2(resolved.unitPrice)
  const warnings = new Set(merged.warnings)
  if (conditional) warnings.add(TETA_WARNING_CONDITIONAL_PRICE)
  if (resolved.warning) warnings.add(resolved.warning)
  merged.warnings = [...warnings]
  return merged
}
