import { describe, expect, it } from 'vitest'
import { parseGpcDocument } from './pkd-gpc-parser'

describe('GS1 GPC importer parser', () => {
  it('extracts hierarchy levels and parent paths', () => {
    const nodes = parseGpcDocument({ GPCSchema: { Segment: [{ Code: '10000000', Description: 'Food', Family: [{ Code: '10000100', Description: 'Dairy', Class: [{ Code: '10000101', Description: 'Butter', Brick: [{ Code: '10000102', Description: 'Retail Butter' }] }] }] }] } })
    expect(nodes).toHaveLength(4)
    expect(nodes[3]).toMatchObject({ code: '10000102', level: 'brick', parentCode: '10000101', path: ['10000000','10000100','10000101','10000102'] })
  })
})