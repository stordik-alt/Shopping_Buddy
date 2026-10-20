import { describe, expect, it } from 'vitest'
import {
  normalizeProductIdentityText,
  packageQuantitiesEquivalent,
  parseProductQuantities,
} from './product-identity-normalization'

describe('normalizeProductIdentityText', () => {
  it('normalizes case, Czech diacritics, punctuation and whitespace', () => {
    expect(normalizeProductIdentityText('  TIP LINE, kosmetické—kapesníky  100 ks '))
      .toBe('tip line kosmeticke kapesniky 100 ks')
  })

  it('preserves digits and pack counts', () => {
    expect(normalizeProductIdentityText('CS 5460 / 3 ks')).toBe('cs 5460 3 ks')
  })

  it('handles nullish values conservatively', () => {
    expect(normalizeProductIdentityText(undefined)).toBe('')
  })
})

describe('parseProductQuantities', () => {
  it('normalizes equivalent mass units to grams', () => {
    expect(parseProductQuantities('SOMAT sůl do myčky 1,5 kg')).toEqual([
      { value: 1.5, unit: 'kg', baseValue: 1500, baseUnit: 'g', multipackCount: 1 },
    ])
    expect(packageQuantitiesEquivalent('Somat 1,5 kg', 'Somat 1500 g')).toBe(true)
  })

  it('normalizes equivalent volume units to millilitres', () => {
    expect(packageQuantitiesEquivalent('gel 1 l', 'gel 1000 ml')).toBe(true)
  })

  it('detects a different quantity', () => {
    expect(packageQuantitiesEquivalent('kapesníky 100 ks', 'kapesníky 200 ks')).toBe(false)
  })

  it('does not treat missing quantity as agreement', () => {
    expect(packageQuantitiesEquivalent('Somat sůl', 'Somat 1,5 kg')).toBeNull()
  })

  it('preserves multipack composition and does not confuse it with a single pack', () => {
    expect(parseProductQuantities('44 x 85 g')).toEqual([
      { value: 85, unit: 'g', baseValue: 85, baseUnit: 'g', multipackCount: 44 },
    ])
    expect(packageQuantitiesEquivalent('2 x 500 ml', '500 ml')).toBe(false)
    expect(packageQuantitiesEquivalent('2 x 500 ml', '2 x 500 ml')).toBe(true)
    expect(packageQuantitiesEquivalent('2 x 500 ml', '1 l')).toBe(false)
  })
})
