import { describe, expect, it } from 'vitest'
import { isValidGtin, openFoodFactsProductName } from './barcode'

describe('isValidGtin', () => {
  it.each(['4006381333931', '96385074', '012345000058', '10012345000017'])('accepts a valid GTIN: %s', (code) => {
    expect(isValidGtin(code)).toBe(true)
  })

  it.each(['4006381333932', '96385075', '1234567', '12345678901', '123456789012345', '１２３４５６７８'])(
    'rejects an invalid GTIN: %s',
    (code) => {
      expect(isValidGtin(code)).toBe(false)
    },
  )
})

describe('openFoodFactsProductName', () => {
  it('prefers the Czech name and falls back to the general name', () => {
    expect(
      openFoodFactsProductName(
        { code: '4006381333931', status: 1, product: { product_name_cs: '  Český název  ', product_name: 'Name' } },
        '4006381333931',
      ),
    ).toBe('Český název')
    expect(openFoodFactsProductName({ code: '4006381333931', status: 1, product: { product_name: 'Name' } }, '4006381333931')).toBe(
      'Name',
    )
  })

  it.each([
    null,
    {},
    { code: 'different', status: 1, product: { product_name: 'Name' } },
    { code: '4006381333931', status: 0, product: { product_name: 'Name' } },
    { code: '4006381333931', status: 1, product: {} },
    { code: '4006381333931', status: 1, product: { product_name: '  ' } },
    { code: '4006381333931', status: 1, product: { product_name: 'a'.repeat(301) } },
    { code: '4006381333931', status: 1, product: { product_name: 'Unsafe\u0000name' } },
  ])('rejects an unusable upstream response', (response) => {
    expect(openFoodFactsProductName(response, '4006381333931')).toBeNull()
  })
})
