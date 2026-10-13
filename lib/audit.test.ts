import { describe, expect, it } from 'vitest'
import { auditDetailText, auditLabel } from '@/lib/audit'

describe('audit wording', () => {
  it('labels known actions and falls back to the raw key', () => {
    expect(auditLabel('expense.deleted')).toBe('Smazal(a) výdaj')
    expect(auditLabel('something.new')).toBe('something.new')
  })
  it('writes the detail as a short line, skipping empty values', () => {
    expect(auditDetailText({ amount: 250, category: 'Potraviny', note: null, fields: '' })).toBe('částka 250, kategorie Potraviny')
    expect(auditDetailText({})).toBe('')
  })
})
