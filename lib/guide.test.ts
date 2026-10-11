import { describe, expect, it } from 'vitest'
import { GUIDE_STEPS, clampStep, getGuideSteps, shouldAutoStartGuide } from '@/lib/guide'
import { tabHref } from '@/lib/tab-url'

describe('guide steps', () => {
  it('has unique ids and every step names something to read', () => {
    for (const steps of [getGuideSteps(false), getGuideSteps(true)]) {
      expect(new Set(steps.map((step) => step.id)).size).toBe(steps.length)
      for (const step of steps) {
        expect(step.title.length).toBeGreaterThan(0)
        expect(step.text.length).toBeGreaterThan(0)
      }
    }
  })

  it('only points at sections that have an address in the app', () => {
    for (const step of getGuideSteps(true)) expect(tabHref(step.tab)).toBeTruthy()
  })

  it('explains why the profile matters, without sending people there for the budget', () => {
    const profile = GUIDE_STEPS.find((step) => step.id === 'profile')
    expect(profile?.tab).toBe('Profil')
    expect(profile?.why?.length).toBeGreaterThan(0)
    // The budget is set in Rozpočet → Plánování, not in the profile.
    expect(JSON.stringify(profile)).not.toMatch(/rozpočet/i)
    expect(GUIDE_STEPS.find((step) => step.id === 'budget')?.where).toContain('Plánování')
  })

  it('tells people how to reach sections that are not in the phone bottom bar', () => {
    for (const step of GUIDE_STEPS.filter((s) => ['Akce', 'Obchody', 'Recepty', 'Profil'].includes(s.tab))) {
      expect(step.where).toContain('Více')
    }
  })

  it('ends with Anitka herself and a way back to the profile', () => {
    for (const aiEnabled of [false, true]) {
      const steps = getGuideSteps(aiEnabled)
      const last = steps[steps.length - 1]
      expect(last.id).toBe('anitka')
      expect(last.cta).toBeTruthy()
      expect(last.secondaryCta?.tab).toBe('Profil')
    }
  })

  it('points at the assistant only when it is switched on, and promises nothing before', () => {
    const on = getGuideSteps(true).at(-1)!
    const off = getGuideSteps(false).at(-1)!
    expect(on.tab).toBe('AI')
    expect(on.cta?.tab).toBe('AI')
    expect(off.tab).not.toBe('AI')
    expect(off.cta?.tab).toBeUndefined()
    expect(off.target).toBeUndefined()
    expect(off.text).toContain('Ještě se učím')
  })
})

describe('guide pointers', () => {
  it('only asks to click first when there is something to point at afterwards', () => {
    for (const step of GUIDE_STEPS.filter((s) => s.prepare)) expect(step.target?.length).toBeGreaterThan(0)
  })

  it('labels every highlighted place, and each target names a selector', () => {
    for (const step of getGuideSteps(true).filter((s) => s.target)) {
      expect(step.targetLabel).toBeTruthy()
      for (const target of step.target ?? []) expect(target.selector.length).toBeGreaterThan(0)
    }
  })
})

describe('guide navigation', () => {
  it('stays inside the first and last card', () => {
    expect(clampStep(0, -1)).toBe(0)
    expect(clampStep(GUIDE_STEPS.length - 1, 1)).toBe(GUIDE_STEPS.length - 1)
    expect(clampStep(2, 1)).toBe(3)
    expect(clampStep(2, -1)).toBe(1)
  })

  it('opens by itself until it was finished or skipped on this device', () => {
    expect(shouldAutoStartGuide(null)).toBe(true)
    expect(shouldAutoStartGuide(undefined)).toBe(true)
    expect(shouldAutoStartGuide('done')).toBe(false)
  })
})
