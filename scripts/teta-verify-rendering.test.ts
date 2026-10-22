// Tests for the comparison of a collected record with the rendered product page
// (scripts/teta-verify-rendering.ts).
//
// The comparison is what says "what the collector read is what the shopper sees". A price check
// that is too loose would pass a page that shows a different price, and one that is too strict
// would fail on the ways a retailer writes the same number.

import { describe, expect, it } from 'vitest'
import { normalizeText, priceAppearsIn } from './teta-verify-rendering'

describe('normalizeText', () => {
  it('does not let case, diacritics or punctuation decide', () => {
    // The apostrophe is a separator on both sides of the comparison, so "L’Oréal" and "L'Oreal"
    // are the same word — which is what the page and the record have to agree on.
    expect(normalizeText('L’Oréal, Paris — Age Specialist 55+')).toBe('l oreal paris age specialist 55')
  })

  it('reads an empty text as empty', () => {
    expect(normalizeText('')).toBe('')
  })
})

describe('priceAppearsIn', () => {
  it('finds the price the retailer writes', () => {
    expect(priceAppearsIn('Zewa Deluxe Delicate Care 59,90 Kč', 59.9)).toBe(true)
  })

  it('finds a price written with a thousands group', () => {
    expect(priceAppearsIn('Oral-B Pro Junior 1 999,90 Kč', 1999.9)).toBe(true)
    expect(priceAppearsIn('Oral-B Pro Junior 1 999,90 Kč', 1999.9)).toBe(true)
  })

  it('finds a price written with a dot instead of a comma', () => {
    expect(priceAppearsIn('CeraVe 236.00 Kč', 236)).toBe(true)
  })

  it('does not accept a different price', () => {
    expect(priceAppearsIn('Zewa Deluxe Delicate Care 69,90 Kč', 59.9)).toBe(false)
  })

  it('does not accept a price that is not a price', () => {
    expect(priceAppearsIn('Zewa Deluxe Delicate Care 59,90 Kč sleva', 59.9)).toBe(true)
    expect(priceAppearsIn('Balení obsahuje 8 kusů', 8)).toBe(false)
  })
})
