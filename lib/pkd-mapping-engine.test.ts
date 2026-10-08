import { describe, expect, it } from 'vitest'
import { generatePkdProductTypeMappings } from '@/lib/pkd-mapping-engine'

const targets = [
  { id: 'pt-mleko', key: 'mleko-polotucne', name: 'Mléko polotučné', category: 'Potraviny' as const },
  { id: 'pt-gel', key: 'praci-gel', name: 'Prací gel', category: 'Drogerie' as const },
  { id: 'pt-plnotucne', key: 'mleko-plnotucne', name: 'Mléko plnotučné', category: 'Potraviny' as const },
]

describe('generatePkdProductTypeMappings', () => {
  it('maps an exact normalized Product Type name with high confidence', () => {
    const [mapping] = generatePkdProductTypeMappings([
      { id: 'e1', canonicalName: '  MLÉKO polotučné ', language: 'cs', category: 'Potraviny' },
    ], targets)

    expect(mapping).toMatchObject({
      pkdEntryId: 'e1',
      productTypeId: 'pt-mleko',
      productTypeKey: 'mleko-polotucne',
      method: 'exact_name',
      confidence: 0.99,
    })
  })

  it('uses a unique deterministic Product Type rule when the name is not exact', () => {
    const [mapping] = generatePkdProductTypeMappings([
      { id: 'e2', canonicalName: 'Ariel prací gel Color', language: 'cs', category: 'Drogerie' },
    ], targets)

    expect(mapping).toMatchObject({
      pkdEntryId: 'e2',
      productTypeId: 'pt-gel',
      productTypeKey: 'praci-gel',
      method: 'rule_match',
      confidence: 0.90,
    })
  })

  it('does not guess when the rule engine cannot distinguish the Product Type', () => {
    const mappings = generatePkdProductTypeMappings([
      { id: 'e3', canonicalName: 'Mléko', language: 'cs', category: 'Potraviny' },
    ], targets)

    expect(mappings).toEqual([])
  })

  it('does not remap an already mapped, rejected, or inactive PKD entry', () => {
    const mappings = generatePkdProductTypeMappings([
      { id: 'mapped', canonicalName: 'Mléko polotučné', language: 'cs', productTypeId: 'already-set' },
      { id: 'rejected', canonicalName: 'Mléko polotučné', language: 'cs', status: 'rejected' },
      { id: 'inactive', canonicalName: 'Mléko polotučné', language: 'cs', status: 'inactive' },
    ], targets)

    expect(mappings).toEqual([])
  })
})
