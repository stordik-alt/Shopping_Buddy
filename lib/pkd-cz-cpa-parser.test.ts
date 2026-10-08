import { describe, expect, it } from 'vitest'
import { parseCzCpaDocument } from './pkd-cz-cpa-parser'

describe('parseCzCpaDocument', () => {
  it('builds six-level hierarchy from CSV', () => {
    const csv = [
      'code,name,level',
      'A,Produkty zemědělství,1',
      '01,Produkty zemědělství,2',
      '011,Plodiny,3',
      '0111,Obiloviny,4',
      '01111,Pšenice,5',
      '011111,Pšenice tvrdá,6',
    ].join('\n')

    expect(parseCzCpaDocument(csv, 'csv')).toEqual([
      { code: 'A', name: 'Produkty zemědělství', level: 1, parentCode: null, path: ['A'] },
      { code: '01', name: 'Produkty zemědělství', level: 2, parentCode: 'A', path: ['A', '01'] },
      { code: '011', name: 'Plodiny', level: 3, parentCode: '01', path: ['A', '01', '011'] },
      { code: '0111', name: 'Obiloviny', level: 4, parentCode: '011', path: ['A', '01', '011', '0111'] },
      { code: '01111', name: 'Pšenice', level: 5, parentCode: '0111', path: ['A', '01', '011', '0111', '01111'] },
      { code: '011111', name: 'Pšenice tvrdá', level: 6, parentCode: '01111', path: ['A', '01', '011', '0111', '01111', '011111'] },
    ])
  })

  it('accepts JSON arrays and explicit levels', () => {
    expect(parseCzCpaDocument(JSON.stringify([
      { code: 'C', name: 'Výrobky zpracovatelského průmyslu', level: 1 },
      { code: '10', name: 'Potravinářské výrobky', level: 2 },
      { code: '101', name: 'Maso', level: 3 },
    ]))).toHaveLength(3)
  })
})
