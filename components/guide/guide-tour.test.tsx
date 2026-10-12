import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GuideTour } from '@/components/guide/guide-tour'
import { GUIDE_STEPS } from '@/lib/guide'

describe('GuideTour', () => {
  it('starts on the welcome card with the living mascot, a skip option and no back button', () => {
    const html = renderToStaticMarkup(<GuideTour onNavigate={() => {}} onClose={() => {}} />)
    expect(html).toContain(GUIDE_STEPS[0].title)
    expect(html).toContain(`Krok 1 z ${GUIDE_STEPS.length}`)
    expect(html).toContain('anitka-guide-body.webp')
    // The greeting: the raised arm is part of the first card, hanging arm otherwise.
    expect(html).toContain('anitka-guide-wave-hand.webp')
    expect(html).toContain('anitka-guide-arm.webp')
    // The face is drawn over the picture: eyelids for blinking and a wink, a smile and moving lips.
    expect(html).toContain('anitka-lid-l')
    expect(html).toContain('anitka-lid-r')
    expect(html).toContain('anitka-smile')
    expect(html).toContain('anitka-talk')
    expect(html).toContain(`data-mood="${GUIDE_STEPS[0].mood}"`)
    expect(html).toContain('Přeskočit')
    expect(html).not.toContain('Zpět')
  })
})
