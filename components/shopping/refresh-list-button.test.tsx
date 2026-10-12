import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RefreshListButton } from '@/components/shopping/refresh-list-button'

describe('RefreshListButton', () => {
  it('starts as a plain "Obnovit" button with no message', () => {
    const html = renderToStaticMarkup(<RefreshListButton onRefresh={async () => {}} />)
    expect(html).toContain('Obnovit')
    expect(html).not.toContain('Obnovuji')
    expect(html).not.toContain('Aktuální')
    expect(html).not.toContain('role="alert"')
    // A touch-sized control, like the other chips in the list header.
    expect(html).toContain('min-h-10')
  })
})
