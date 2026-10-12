import { describe, expect, it } from 'vitest'
import { GUIDE_STEPS, QUICK_GUIDE_STEPS, clampStep, getGuideSteps, getQuickGuideSteps, indexAfterModeSwitch, shouldAutoStartGuide } from '@/lib/guide'
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
    // The budget is set in Rozpočet → Plánování, not in the profile: the card may say the budget is shared
    // or has notifications, but never tells people to set it here.
    expect(JSON.stringify(profile)).not.toMatch(/nastav\w*\s+(si\s+)?(měsíční\s+)?(rozpočet|limit)/i)
    expect(GUIDE_STEPS.find((step) => step.id === 'planning')?.where).toContain('Plánování')
  })

  it('tells people how to reach sections that are not in the phone bottom bar', () => {
    for (const id of ['deals', 'stores', 'recipes', 'profile']) {
      expect(GUIDE_STEPS.find((step) => step.id === id)?.where).toContain('Více')
    }
  })

  it('ends by showing exactly where to find the guide again, with a way back to the profile', () => {
    for (const aiEnabled of [false, true]) {
      const steps = getGuideSteps(aiEnabled)
      const last = steps[steps.length - 1]
      expect(last.id).toBe('findme')
      expect(last.where).toContain('Průvodce aplikací')
      // The account menu is opened, and its guide item is the highlighted place.
      expect(last.prepare?.selector).toContain('Účet a nastavení')
      expect(last.target?.[0]).toMatchObject({ selector: '[role="menuitem"]', contains: 'Průvodce aplikací' })
      expect(last.cta).toBeTruthy()
      expect(last.secondaryCta?.tab).toBe('Profil')
    }
  })

  it('has the assistant card just before the end, pointing at it only when it is switched on', () => {
    const on = getGuideSteps(true).at(-2)!
    const off = getGuideSteps(false).at(-2)!
    expect(on.id).toBe('anitka')
    expect(on.tab).toBe('AI')
    expect(off.tab).not.toBe('AI')
    expect(off.target).toBeUndefined()
    expect(off.text).toContain('Ještě se učím')
    // Only the last card ends the tour.
    for (const step of getGuideSteps(true).slice(0, -1)) expect(step.cta).toBeUndefined()
  })

  it('explains every part of the app: each section and the main features have a card', () => {
    const ids = GUIDE_STEPS.map((step) => step.id)
    for (const id of ['navigation', 'home', 'bell', 'shopping', 'shopping-detail', 'shopping-plan', 'shopping-finish', 'purchases', 'receipts', 'pantry', 'pantry-check', 'pantry-levels', 'budget', 'expenses', 'planning', 'recurring', 'pockets', 'period-close', 'deals', 'stores', 'recipes', 'mealplan', 'profile', 'profile-members', 'profile-stores', 'profile-preferences', 'profile-notifications']) {
      expect(ids).toContain(id)
    }
    for (const tab of ['Domů', 'Nákup', 'Zásoby', 'Rozpočet', 'Akce', 'Obchody', 'Recepty', 'Profil'] as const) {
      expect(GUIDE_STEPS.some((step) => step.tab === tab)).toBe(true)
    }
  })

  it('says truthfully what "Dokončit nákup" does: it only clears the ticked items (stock and budget come from receipts and manual purchases)', () => {
    const finish = GUIDE_STEPS.find((step) => step.id === 'shopping-finish')
    expect(finish).toBeDefined()
    // The shopping list creates no purchase, expense or stock (components/app-shell.tsx completePurchase).
    expect(finish?.text).toMatch(/nevzniknou/)
    expect(finish?.text).not.toMatch(/samy přidají do zásob|uloží do historie/)
    expect(finish?.text).toMatch(/účtenky/)
    const pantry = GUIDE_STEPS.find((step) => step.id === 'pantry')
    expect(pantry?.text).not.toMatch(/dokončených nákupů/)
  })

  it('gives every card a mood Anitka can act out, and every card a plain-language title and text', () => {
    const moods = ['nod', 'smile', 'wink', 'think', 'cheer', 'wave']
    for (const step of getGuideSteps(true)) {
      if (step.mood) expect(moods).toContain(step.mood)
      expect(step.text.length).toBeGreaterThan(40)
    }
    expect(new Set(getGuideSteps(true).map((step) => step.mood ?? 'nod')).size).toBeGreaterThan(3)
  })
})

describe('quick and full tour', () => {
  it('the quick tour is the full tour without its deep-dive cards, and is clearly shorter', () => {
    for (const aiEnabled of [false, true]) {
      const full = getGuideSteps(aiEnabled)
      const quick = getQuickGuideSteps(aiEnabled)
      expect(quick.every((step) => !step.detail)).toBe(true)
      expect(quick.length).toBe(full.filter((step) => !step.detail).length)
      expect(quick.length).toBeLessThan(full.length * 0.65)
      // The tour still opens with the welcome and ends with where to find it again.
      expect(quick[0].id).toBe('welcome')
      expect(quick.at(-1)?.id).toBe('findme')
    }
  })

  it('still touches every section in the quick tour', () => {
    for (const tab of ['Domů', 'Nákup', 'Zásoby', 'Rozpočet', 'Akce', 'Obchody', 'Recepty', 'Profil'] as const) {
      expect(QUICK_GUIDE_STEPS.some((step) => step.tab === tab)).toBe(true)
    }
  })

  it('loses nothing: every deep-dive card is summarized by "also" lines of a card in the quick tour', () => {
    const detailIds = GUIDE_STEPS.filter((step) => step.detail).map((step) => step.id)
    expect(detailIds.length).toBeGreaterThan(0)
    const covered = new Set(QUICK_GUIDE_STEPS.flatMap((step) => step.covers ?? []))
    for (const id of detailIds) expect(covered).toContain(id)
    // "covers" only names deep-dive cards, and only cards that really say something in the quick tour.
    for (const step of QUICK_GUIDE_STEPS.filter((s) => s.covers)) {
      for (const id of step.covers ?? []) expect(detailIds).toContain(id)
      expect(step.also?.length).toBeGreaterThanOrEqual(step.covers?.length ?? 0)
    }
    // Deep-dive cards carry no summary lines of their own.
    for (const step of GUIDE_STEPS.filter((s) => s.detail)) expect(step.also).toBeUndefined()
  })

  it('keeps the reader on the same topic when switching between the tours', () => {
    // A card both tours have stays itself.
    expect(QUICK_GUIDE_STEPS[indexAfterModeSwitch('budget', GUIDE_STEPS, QUICK_GUIDE_STEPS)].id).toBe('budget')
    expect(GUIDE_STEPS[indexAfterModeSwitch('budget', QUICK_GUIDE_STEPS, GUIDE_STEPS)].id).toBe('budget')
    // A deep-dive card becomes the section's main card in the quick tour.
    expect(QUICK_GUIDE_STEPS[indexAfterModeSwitch('recurring', GUIDE_STEPS, QUICK_GUIDE_STEPS)].id).toBe('budget')
    expect(QUICK_GUIDE_STEPS[indexAfterModeSwitch('profile-stores', GUIDE_STEPS, QUICK_GUIDE_STEPS)].id).toBe('profile')
  })
})

describe('guide pointers', () => {
  it('only asks to click first when there is something to point at afterwards', () => {
    // Switching to another part of a section (e.g. "Moje nákupy") is the point of its card; every other
    // click-first card needs a place to point at afterwards.
    for (const step of GUIDE_STEPS.filter((s) => s.prepare && s.id !== 'purchases')) expect(step.target?.length).toBeGreaterThan(0)
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
