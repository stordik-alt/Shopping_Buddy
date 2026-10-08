import { describe, expect, it } from 'vitest'
import { parseOffTaxonomy } from './pkd-off-parser'

describe('Open Food Facts taxonomy parser', () => {
  it('extracts localized names, hierarchy and synonyms', () => {
    const nodes = parseOffTaxonomy({
      'en:fruit-juices': {
        name: { en: 'Fruit juices', cs: 'Ovocné džusy' },
        parents: ['en:beverages'],
        children: ['en:apple-juice'],
        synonyms: { cs: ['Ovocné šťávy', 'džusy'] },
      },
    }, 'cs')

    expect(nodes).toEqual([{
      tagId: 'en:fruit-juices',
      canonicalName: 'Ovocné džusy',
      language: 'cs',
      parents: ['en:beverages'],
      children: ['en:apple-juice'],
      synonyms: ['Ovocné šťávy', 'džusy'],
    }])
  })

  it('falls back to an available language', () => {
    const nodes = parseOffTaxonomy({
      'en:juice': { name: { en: 'Juice' }, parents: [] },
    }, 'cs')

    expect(nodes[0]).toMatchObject({ canonicalName: 'Juice', language: 'en' })
  })
})