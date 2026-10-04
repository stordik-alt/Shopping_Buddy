import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardButton, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, Input } from '@/components/ui/field'
import { ProgressBar } from '@/components/ui/progress-bar'
import { SegmentedControl } from '@/components/ui/segmented-control'

describe('ProgressBar', () => {
  it('clamps an overspent value to the track and exposes it to assistive tech', () => {
    const html = renderToStaticMarkup(<ProgressBar value={250} max={100} label="Čerpání rozpočtu" />)
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="100"')
    expect(html).toContain('width:100%')
  })

  it('shows 0 % when the maximum is zero instead of dividing by zero', () => {
    expect(renderToStaticMarkup(<ProgressBar value={5} max={0} label="x" />)).toContain('aria-valuenow="0"')
  })
})

describe('SegmentedControl', () => {
  const options = [
    { value: 'a', label: 'Seznam' },
    { value: 'b', label: 'Účtenky', badge: 12 },
  ] as const

  it('marks only the active segment as pressed and caps the badge at 9+', () => {
    const html = renderToStaticMarkup(<SegmentedControl options={options} value="a" onChange={() => {}} label="Zobrazení" />)
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html).toContain('9+')
  })

  it('shows no badge for a missing or zero count', () => {
    const html = renderToStaticMarkup(<SegmentedControl options={[{ value: 'a', label: 'A', badge: 0 }]} value="a" onChange={() => {}} label="x" />)
    expect(html).not.toContain('čeká na vyřízení')
  })
})

describe('Field', () => {
  it('links label, hint and error to the control', () => {
    const html = renderToStaticMarkup(<Field label="Název" hint="Napište název" error="Povinné pole">{(p) => <Input {...p} />}</Field>)
    const id = /for="([^"]+)"/.exec(html)?.[1]
    expect(id).toBeTruthy()
    expect(html).toContain(`id="${id}"`)
    expect(html).toContain(`aria-describedby="${id}-hint ${id}-error"`)
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('role="alert"')
  })

  it('omits the error wiring when there is no error', () => {
    const html = renderToStaticMarkup(<Field label="Název">{(p) => <Input {...p} />}</Field>)
    expect(html).not.toContain('aria-invalid="')
    expect(html).not.toContain('aria-describedby="')
  })
})

describe('Card, Badge, EmptyState, Button', () => {
  it('CardButton is a real button; a plain Card is not interactive', () => {
    expect(renderToStaticMarkup(<CardButton>x</CardButton>)).toMatch(/^<button type="button"/)
    expect(renderToStaticMarkup(<Card>x</Card>)).not.toContain('cursor-pointer')
  })

  it('CardHeader hides its icon from assistive tech', () => {
    expect(renderToStaticMarkup(<CardHeader title="Rozpočet" icon={<i />} />)).toContain('aria-hidden="true"')
  })

  it('Badge carries its text label', () => {
    expect(renderToStaticMarkup(<Badge tone="danger">Chyba</Badge>)).toContain('Chyba')
  })

  it('EmptyState renders title, description and action', () => {
    const html = renderToStaticMarkup(<EmptyState title="Prázdno" description="Přidejte položku" action={<button>Přidat</button>} />)
    expect(html).toContain('Prázdno')
    expect(html).toContain('Přidejte položku')
    expect(html).toContain('Přidat')
  })

  it('Button accent variant uses the turquoise fill with navy text', () => {
    expect(renderToStaticMarkup(<Button variant="accent">Uložit</Button>)).toContain('bg-accent-solid')
  })
})
