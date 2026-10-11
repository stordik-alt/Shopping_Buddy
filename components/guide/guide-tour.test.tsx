import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GuideTour } from '@/components/guide/guide-tour'
import { GUIDE_STEPS } from '@/lib/guide'

describe('GuideTour', () => {
  it('starts on the welcome card with the mascot, a skip option and no back button', () => {
    const html = renderToStaticMarkup(<GuideTour onNavigate={() => {}} onClose={() => {}} />)
    expect(html).toContain(GUIDE_STEPS[0].title)
    expect(html).toContain(`Krok 1 z ${GUIDE_STEPS.length}`)
    expect(html).toContain('anitka-mascot-full.webp')
    expect(html).toContain('Přeskočit')
    expect(html).not.toContain('Zpět')
  })
})
