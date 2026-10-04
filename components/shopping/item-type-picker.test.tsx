import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ItemTypePicker } from '@/components/shopping/item-type-picker'

// The product-type choice of a list item (docs/12_PRODUCT_TYPES.md, phase 3), rendered on the server.
const render = (name: string, productTypes: string[] | null) => renderToStaticMarkup(<ItemTypePicker name={name} productTypes={productTypes} onChange={() => {}} />)

describe('ItemTypePicker', () => {
  it('shows a group\'s types as checkboxes, all ticked when nothing was chosen', () => {
    const html = render('Kuřecí maso', null)
    expect(html).toContain('Podle názvu: Kuřecí maso')
    for (const name of ['Kuřecí prsa a prsní řízky', 'Kuřecí stehna a čtvrtky', 'Kuřecí křídla', 'Kuře celé a půlky', 'Kuřecí mleté maso']) expect(html).toContain(name)
    expect(html.match(/type="checkbox"/g)).toHaveLength(5)
    expect(html.match(/checked=""/g)).toHaveLength(5)
  })

  it('ticks only the chosen part of a group and keeps the last one from being unticked', () => {
    const html = render('Kuřecí maso', ['kureci-prsa'])
    expect(html.match(/checked=""/g)).toHaveLength(1)
    expect(html).toContain('disabled=""')
  })

  it('says an item without a type is searched by its name', () => {
    const html = render('Něco na večeři', null)
    expect(html).toContain('Hledá se podle názvu')
    expect(html).not.toContain('type="checkbox"')
  })
})
