import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ConfirmRemoveButton } from '@/components/shared/confirm-remove-button'
import { ChildCard } from '@/components/household/child-card'

describe('ConfirmRemoveButton', () => {
  it('starts as a plain icon button and does not show the confirmation until it is tapped', () => {
    const html = renderToStaticMarkup(
      <ConfirmRemoveButton label="Babička" onConfirm={() => {}}>
        <span>x</span>
      </ConfirmRemoveButton>,
    )
    expect(html).toContain('aria-label="Odebrat Babička"')
    expect(html).not.toContain('Zrušit')
  })

  it('is used by the child card, so removing a child is a two-step action', () => {
    const html = renderToStaticMarkup(<ChildCard child={{ id: 'c1', name: 'Anežka', age: 4, preferences: '', specialNeeds: '' }} onRemove={() => {}} />)
    expect(html).toContain('aria-label="Odebrat Anežka"')
    expect(html).not.toContain('Zrušit')
  })
})
