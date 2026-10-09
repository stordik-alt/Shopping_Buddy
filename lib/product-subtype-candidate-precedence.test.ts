import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildProductSubtypeMappings } from '@/lib/product-subtype-mapping'
import type { ProductSubtypeAuditRow } from '@/lib/product-subtype-audit'

type Candidate = {
  parentTypeKey: string
  name: string
  definition: string
  includes: string[]
  excludes: string[]
}

const candidateFile = resolve(process.cwd(), 'docs/examples/product-subtype-registry-expansion-candidates.json')
const candidates = (JSON.parse(readFileSync(candidateFile, 'utf8')) as { candidates: Candidate[] }).candidates

function candidate(parentTypeKey: string, name: string): Candidate {
  const result = candidates.find((item) => item.parentTypeKey === parentTypeKey && item.name === name)
  if (!result) throw new Error(`Missing candidate: ${parentTypeKey} / ${name}`)
  return result
}

/**
 * Test oracle for the documented one-subtype policy. This intentionally does not
 * classify catalog products or write assignments; it checks synthetic evidence
 * against the agreed priority groups.
 */
function resolvePriority<T extends string>(
  evidence: readonly T[],
  priorityGroups: readonly (readonly T[])[],
): T | null {
  for (const group of priorityGroups) {
    const matches = group.filter((signal) => evidence.includes(signal))
    if (matches.length === 1) return matches[0]
    if (matches.length > 1) return null
  }
  return null
}

const auditRow = (overrides: Partial<ProductSubtypeAuditRow> = {}): ProductSubtypeAuditRow => ({
  id: 'draft-subtype-product',
  name: 'Pivo světlé 500 ml',
  category: 'Potraviny',
  defaultUnit: 'ks',
  productTypeKey: 'pivo-svetle-pivo',
  productTypeName: 'Světlé pivo',
  productTypeCategory: 'Potraviny',
  productTypeUnit: 'l',
  productTypeSource: 'rule',
  productSubtypeKey: null,
  productSubtypeName: null,
  productSubtypeSource: null,
  ...overrides,
})

describe('Product Subtype candidate precedence and overlap policy', () => {
  it('keeps expansion proposals outside the production mapping registry until explicitly integrated', () => {
    const [mapping] = buildProductSubtypeMappings([auditRow()])
    expect(mapping.status).toBe('outside_registry')
    expect(mapping.reasonCode).toBe('product_type_outside_registry')
    expect(mapping.subtypeKey).toBeNull()
    expect(mapping.parentTypeKey).toBeNull()
  })
  it('keeps the 24 reviewed proposals present and uniquely identified by parent and name', () => {
    expect(candidates).toHaveLength(24)
    const keys = candidates.map((item) => `${item.parentTypeKey}:${item.name.normalize('NFKC').toLocaleLowerCase('cs-CZ')}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('resolves pasta overlaps in the agreed order: filled, lasagne, soup, long, short', () => {
    const priority = [['filled'], ['lasagne'], ['soup'], ['long'], ['short']] as const
    expect(resolvePriority(['filled', 'short'], priority)).toBe('filled')
    expect(resolvePriority(['lasagne', 'long'], priority)).toBe('lasagne')
    expect(resolvePriority(['soup', 'short'], priority)).toBe('soup')
    expect(resolvePriority(['long', 'short'], priority)).toBe('long')
    expect(resolvePriority(['short'], priority)).toBe('short')
    expect(resolvePriority([], priority)).toBeNull()
  })

  it('does not guess when equally ranked rice varieties conflict, and applies the documented rice tiers', () => {
    const priority = [
      ['basmati', 'jasmine'],
      ['arborio', 'risotto'],
      ['natural'],
      ['parboiled'],
      ['long', 'round'],
    ] as const
    expect(resolvePriority(['basmati', 'parboiled'], priority)).toBe('basmati')
    expect(resolvePriority(['jasmine', 'natural'], priority)).toBe('jasmine')
    expect(resolvePriority(['arborio', 'parboiled'], priority)).toBe('arborio')
    expect(resolvePriority(['natural', 'parboiled'], priority)).toBe('natural')
    expect(resolvePriority(['parboiled', 'round'], priority)).toBe('parboiled')
    expect(resolvePriority(['long', 'round'], priority)).toBeNull()
    expect(resolvePriority(['basmati', 'jasmine'], priority)).toBeNull()
    expect(resolvePriority(['long'], priority)).toBe('long')
    expect(resolvePriority(['round'], priority)).toBe('round')
    expect(resolvePriority([], priority)).toBeNull()
  })

  it('requires explicit evidence and preserves exclusion boundaries in the proposal data', () => {
    for (const name of ['Světlé pivo', 'Polotmavé pivo', 'Tmavé pivo']) {
      const item = candidate('pivo', name)
      expect(item.definition).toMatch(/výslovně označeno/i)
      expect(item.excludes.join(' ')).toMatch(/bez doložené barvy/i)
    }

    for (const name of ['Tučný tvaroh', 'Polotučný tvaroh', 'Odtučněný tvaroh']) {
      const item = candidate('tvaroh', name)
      expect(item.definition).toMatch(/výslovně označen/i)
      expect(item.excludes.join(' ')).toMatch(/ne|bez|nesmí/i)
    }

    const waterTuna = candidate('tunak-konzerva', 'Tuňák ve vodním nálevu')
    const ownJuiceTuna = candidate('tunak-konzerva', 'Tuňák ve vlastní šťávě')
    expect(waterTuna.definition).toMatch(/bez označení vlastní šťáva/i)
    expect(waterTuna.excludes.join(' ')).toMatch(/vlastní šťáv/i)
    expect(ownJuiceTuna.definition).toMatch(/přednost před obecným vodním nálevem/i)
    expect(ownJuiceTuna.excludes.join(' ')).toMatch(/obecné „ve vodě“ nepřekládat/i)
  })

  it('distinguishes processed-cheese product form from pack count and detects form conflicts', () => {
    const priority = [['portioned'], ['sliced'], ['spreadable']] as const
    expect(resolvePriority(['portioned', 'sliced'], priority)).toBe('portioned')
    expect(resolvePriority(['sliced', 'spreadable'], priority)).toBe('sliced')
    expect(resolvePriority(['spreadable'], priority)).toBe('spreadable')
    expect(resolvePriority([], priority)).toBeNull()

    const sliced = candidate('taveny-syr', 'Plátkový tavený sýr')
    const spreadable = candidate('taveny-syr', 'Roztíratelný tavený sýr')
    const portioned = candidate('taveny-syr', 'Porcovaný tavený sýr')
    expect(sliced.definition).toMatch(/ne počet kusů v balení/i)
    expect(spreadable.excludes.join(' ')).toMatch(/jednotlivě zabalené porce a plátky/i)
    expect(portioned.excludes.join(' ')).toMatch(/velikost nebo počet porcí v balení není subtype/i)
  })

  it('prioritizes explicit own-juice over generic water but sends conflicting media to review', () => {
    const resolveTunaMedium = (evidence: readonly ('own-juice' | 'oil' | 'water')[]) => {
      if (evidence.includes('oil') && evidence.includes('own-juice')) return null
      return resolvePriority(evidence, [['own-juice'], ['oil'], ['water']])
    }
    expect(resolveTunaMedium([])).toBeNull()
    expect(resolveTunaMedium(['water'])).toBe('water')
    expect(resolveTunaMedium(['own-juice', 'water'])).toBe('own-juice')
    expect(resolveTunaMedium(['oil'])).toBe('oil')
    expect(resolveTunaMedium(['own-juice', 'oil'])).toBeNull()
  })
})
