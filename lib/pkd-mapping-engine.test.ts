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
      mappingVersion: '2026-10-v2',
    })
  })

  it('does not infer Product Types from broad keyword rules', () => {
    const mappings = generatePkdProductTypeMappings([
      { id: 'e2', canonicalName: 'Ariel prací gel Color', language: 'cs', category: 'Drogerie' },
      { id: 'e3', canonicalName: 'PIVOTAL RAZOR HEAD', language: 'en' },
      { id: 'e4', canonicalName: 'PIVOT HINGE', language: 'en' },
      { id: 'e5', canonicalName: 'Dezinfekční a deratizační služby', language: 'cs' },
      { id: 'e6', canonicalName: 'Kontaktní čočky; brýlové čočky z jakéhokoliv materiálu', language: 'cs' },
    ], targets)

    expect(mappings).toEqual([])
  })

  it('does not guess when a name is not an exact Product Type name or synonym', () => {
    const mappings = generatePkdProductTypeMappings([
      { id: 'e7', canonicalName: 'Mléko', language: 'cs', category: 'Potraviny' },
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

  it('does not map an exact name when multiple Product Types share that name', () => {
    const mappings = generatePkdProductTypeMappings([
      { id: 'e8', canonicalName: 'Mléko', language: 'cs' },
    ], [
      { id: 'a', key: 'a', name: 'Mléko', category: 'Potraviny' },
      { id: 'b', key: 'b', name: 'Mléko', category: 'Drogerie' },
    ])

    expect(mappings).toEqual([])
  })
})
