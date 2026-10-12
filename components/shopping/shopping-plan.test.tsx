import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ShoppingPlanPanel } from '@/components/shopping/shopping-plan'

function render(openItemCount: number) {
  return renderToStaticMarkup(
    <ShoppingPlanPanel
      chains={[{ id: 'a', chain: 'Albert' }, { id: 'l', chain: 'Lidl' }]}
      defaultMaxStores={null}
      defaultPriorityIds={[]}
      openItemCount={openItemCount}
      inputKey="k"
      build={async () => {
        throw new Error('not used')
      }}
    />,
  )
}

describe('ShoppingPlanPanel', () => {
  it('shows only the explanation, without disabled controls, when the list has nothing to plan', () => {
    const html = render(0)
    expect(html).toContain('Plán nákupu')
    expect(html).toContain('není co plánovat')
    expect(html).not.toContain('Sestavit plán')
    expect(html).not.toContain('Kolik obchodů projdu')
    expect(html).not.toContain('Prioritní obchody')
  })

  it('offers the controls once there is an open item', () => {
    const html = render(2)
    expect(html).toContain('Sestavit plán')
    expect(html).toContain('Kolik obchodů projdu')
    expect(html).not.toContain('není co plánovat')
  })
})
