import { describe, expect, it } from 'vitest'
import { validatePocketInput, validateTransferAmount, type PocketInput } from '@/lib/pocket-input'

const input = (over: Partial<PocketInput> = {}): PocketInput => ({
  name: 'Auto',
  icon: 'car',
  targetAmount: 150_000,
  targetDate: '2027-12-31',
  openingAmount: 0,
  plannedContribution: null,
  ...over,
})

describe('validatePocketInput', () => {
  it('accepts a Kapsa with a goal and trims the name', () => {
    expect(validatePocketInput(input({ name: '  Auto  ', openingAmount: 10.005 }))).toEqual({
      pocket: { name: 'Auto', icon: 'car', targetAmount: 150_000, targetDate: '2027-12-31', openingAmount: 10.01, plannedContribution: null, isReserve: false },
    })
  })

  it('marks the financial reserve only when asked', () => {
    expect(validatePocketInput(input({ isReserve: true }))).toHaveProperty('pocket.isReserve', true)
    expect(validatePocketInput(input({}))).toHaveProperty('pocket.isReserve', false)
  })

  it('accepts a Kapsa without a goal', () => {
    expect(validatePocketInput(input({ name: 'Rezerva', targetAmount: null, targetDate: null }))).toHaveProperty('pocket')
  })

  it('rejects a blank or too long name, an unknown icon and a bad goal', () => {
    expect(validatePocketInput(input({ name: '   ' }))).toHaveProperty('error')
    expect(validatePocketInput(input({ name: 'x'.repeat(61) }))).toHaveProperty('error')
    expect(validatePocketInput(input({ icon: 'rocket' }))).toEqual({ error: 'Neznámá ikona.' })
    expect(validatePocketInput(input({ targetAmount: 0 }))).toHaveProperty('error')
    expect(validatePocketInput(input({ targetDate: '2027-02-31' }))).toEqual({ error: 'Neplatný termín.' })
    expect(validatePocketInput(input({ targetDate: null }))).toEqual({ error: 'Cíl potřebuje částku i termín, nebo ani jedno.' })
  })

  it('rejects negative or non-finite amounts', () => {
    expect(validatePocketInput(input({ openingAmount: -1 }))).toHaveProperty('error')
    expect(validatePocketInput(input({ plannedContribution: -1 }))).toHaveProperty('error')
    expect(validatePocketInput(input({ openingAmount: Number.NaN }))).toHaveProperty('error')
  })
})

describe('validateTransferAmount', () => {
  it('rounds to haléře and rejects zero, negative and non-finite amounts', () => {
    expect(validateTransferAmount(100.456)).toEqual({ amount: 100.46 })
    expect(validateTransferAmount(0)).toHaveProperty('error')
    expect(validateTransferAmount(-5)).toHaveProperty('error')
    expect(validateTransferAmount(0.001)).toHaveProperty('error')
    expect(validateTransferAmount(Number.POSITIVE_INFINITY)).toHaveProperty('error')
  })
})
