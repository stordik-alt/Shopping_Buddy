import type { TetaRawProduct } from '@/lib/ingestion/teta'

/**
 * ANITKA-owned snapshot contracts for data extracted from Teta's catalog and product detail.
 * These are NOT claims about Teta's actual HTML/API response schema. A future parser must map
 * verified source fields into these contracts.
 */

export type TetaAvailabilityStatus = 'available' | 'unavailable' | 'unknown'

export type TetaMoney = {
  amount: number
  currency: string
}

/** A unit price exactly as shown by the source, before conversion to ANITKA's comparison units. */
export type TetaSourceUnitPrice = {
  amount: number
  per: number
  unit: string
}

/** Data that may be extracted from a product card in the catalog listing. */
export type TetaCatalogCardSnapshot = {
  sourceId: string
  productUrl: string
  name: string
  brand?: string
  categoryPath?: string[]
  package?: { amount: string; unit: string }
  /** The price currently displayed on this catalog card, not necessarily a universal store price. */
  displayedPrice: TetaMoney
  /** A non-promotional/reference price only when the source explicitly labels it as such. */
  regularPrice?: TetaMoney
  unitPrice?: TetaSourceUnitPrice
  onlineAvailability?: TetaAvailabilityStatus
}

/** Additional facts from the product detail page. */
export type TetaProductDetailSnapshot = {
  sourceId: string
  productUrl: string
  ean?: string
  package?: { amount: string; unit: string }
  attributes?: Record<string, string | string[]>
  discontinued?: boolean
  recallNotice?: string
}

/** Offers are kept separate so a conditional offer cannot silently become the regular product price. */
export type TetaPriceOfferSnapshot = {
  kind: 'regular' | 'promotion' | 'club' | 'multi_buy'
  price: TetaMoney
  unitPrice?: TetaSourceUnitPrice
  validFrom?: string
  validUntil?: string
  minimumQuantity?: number
  terms?: string
}

/** Online and branch availability are distinct observations. */
export type TetaAvailabilitySnapshot = {
  scope: 'online' | 'store'
  storeId?: string
  status: TetaAvailabilityStatus
  checkedAt: string
}

/** One merged, source-attributed observation; raw catalog/detail/offer values remain separately available. */
export type TetaProductSnapshot = {
  catalog: TetaCatalogCardSnapshot
  detail?: TetaProductDetailSnapshot
  offers?: TetaPriceOfferSnapshot[]
  availability?: TetaAvailabilitySnapshot[]
}

/** Basic cross-page identity checks before a snapshot is passed to the existing normalizer. */
export function validateTetaSnapshotIdentity(snapshot: TetaProductSnapshot): string[] {
  const errors: string[] = []
  const id = snapshot.catalog.sourceId.trim()
  const url = snapshot.catalog.productUrl.trim()
  if (!id) errors.push('missing catalog source id')
  if (!url) errors.push('missing catalog product URL')
  if (snapshot.detail) {
    if (snapshot.detail.sourceId.trim() && snapshot.detail.sourceId.trim() !== id) {
      errors.push('catalog/detail source id mismatch')
    }
    if (snapshot.detail.productUrl.trim() && snapshot.detail.productUrl.trim() !== url) {
      errors.push('catalog/detail product URL mismatch')
    }
    if (snapshot.detail.ean && !/^(?:\\d{8}|\\d{12,14})$/.test(snapshot.detail.ean.trim())) {
      errors.push('invalid EAN format')
    }
  }
  for (const observation of snapshot.availability ?? []) {
    if (observation.scope === 'store' && !observation.storeId?.trim()) {
      errors.push('store availability missing store id')
    }
    if (!/^\\d{4}-\\d{2}-\\d{2}(?:T.*)?$/.test(observation.checkedAt)) {
      errors.push('availability observation missing ISO date/time')
    }
  }
  for (const offer of snapshot.offers ?? []) {
    if (!Number.isFinite(offer.price.amount) || offer.price.amount <= 0) errors.push('offer has invalid price')
    if (offer.kind === 'multi_buy' && (!Number.isInteger(offer.minimumQuantity) || (offer.minimumQuantity ?? 0) < 2)) {
      errors.push('multi-buy offer requires minimum quantity of at least 2')
    }
    if (offer.validFrom && offer.validUntil && offer.validUntil < offer.validFrom) {
      errors.push('offer validity ends before it starts')
    }
  }
  return errors
}

/**
 * Adapts the two-page snapshot to the existing importer input. Only unconditioned catalog price
 * fields are mapped. Club and multi-buy offers remain in snapshot.offers and are never flattened.
 * A simple promotion is attached only when it matches the displayed price and has an explicit end
 * date; the existing normalizer still validates the calendar date.
 */
export function toTetaRawProduct(snapshot: TetaProductSnapshot): TetaRawProduct {
  const { catalog, detail } = snapshot
  const simplePromotion = (snapshot.offers ?? []).filter((offer) =>
    offer.kind === 'promotion' &&
    offer.price.currency === catalog.displayedPrice.currency &&
    offer.price.amount === catalog.displayedPrice.amount &&
    !offer.minimumQuantity &&
    !offer.terms &&
    Boolean(offer.validUntil),
  )
  const promotion = simplePromotion.length === 1 ? simplePromotion[0] : undefined
  const regularPrice = catalog.regularPrice?.currency === catalog.displayedPrice.currency
    ? catalog.regularPrice.amount
    : undefined

  return {
    id: catalog.sourceId,
    name: catalog.name,
    brand: catalog.brand,
    price: catalog.displayedPrice.amount,
    currency: catalog.displayedPrice.currency,
    originalPrice: regularPrice != null && regularPrice > catalog.displayedPrice.amount ? regularPrice : undefined,
    package: detail?.package ?? catalog.package,
    unitPrice: catalog.unitPrice
      ? { price: catalog.unitPrice.amount, per: catalog.unitPrice.per, unit: catalog.unitPrice.unit }
      : undefined,
    categoryPath: catalog.categoryPath,
    ean: detail?.ean,
    promotionValidUntil: promotion?.validUntil,
    clubPrice: undefined,
  }
}
