import { describe, expect, it } from 'vitest'
import { IDEA_DETAILS_MAX, IDEA_TITLE_MAX, validateIdeaInput } from '@/lib/ideas'

describe('validateIdeaInput', () => {
  it('trims the title, collapses its whitespace and stores an empty description as absent', () => {
    expect(validateIdeaInput({ title: '  Sdílet   seznam ', details: '   ' })).toEqual({ ok: true, title: 'Sdílet seznam', details: null })
  })

  it('keeps a description as written (only trimmed)', () => {
    expect(validateIdeaInput({ title: 'Nápad', details: ' řádek 1\nřádek 2 ' })).toEqual({ ok: true, title: 'Nápad', details: 'řádek 1\nřádek 2' })
  })

  it('rejects an empty title and reports why', () => {
    const result = validateIdeaInput({ title: '   ', details: 'x' })
    expect(result.ok).toBe(false)
  })

  it('accepts the limits and rejects one character over them', () => {
    expect(validateIdeaInput({ title: 'a'.repeat(IDEA_TITLE_MAX), details: 'b'.repeat(IDEA_DETAILS_MAX) }).ok).toBe(true)
    expect(validateIdeaInput({ title: 'a'.repeat(IDEA_TITLE_MAX + 1), details: '' }).ok).toBe(false)
    expect(validateIdeaInput({ title: 'a', details: 'b'.repeat(IDEA_DETAILS_MAX + 1) }).ok).toBe(false)
  })

  it('rejects input that is not text', () => {
    expect(validateIdeaInput({ title: 5 as unknown as string, details: '' }).ok).toBe(false)
  })
})
