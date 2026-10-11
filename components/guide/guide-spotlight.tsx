'use client'

import { ArrowDown, ArrowUp } from 'lucide-react'
import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import type { GuideStep, GuideTarget } from '@/lib/guide'

type Box = { top: number; left: number; width: number; height: number }

function sameBox(a: Box | null, b: Box | null) {
  if (!a || !b) return a === b
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

/** The first element on screen that matches one of the candidates (the app renders both a phone and a
 *  desktop navigation, so "on screen" is what tells them apart). */
function findVisible(candidates: GuideTarget[]): HTMLElement | null {
  for (const { selector, text } of candidates) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (element.getClientRects().length === 0 || getComputedStyle(element).visibility === 'hidden') continue
      if (text !== undefined && element.textContent?.trim() !== text) continue
      return element
    }
  }
  return null
}

function boxOf(element: HTMLElement | null): Box | null {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  return { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) }
}

/** Highlights where, in the real app, the current guide card says to look: the section's entry in the
 *  navigation (dashed) and the place to act inside the section (solid, with a short label). The
 *  elements are looked up again every frame, because a section loads in a moment after it is opened
 *  and the page scrolls and resizes under the guide. */
export function GuideSpotlight({ step, cardRef }: { step: GuideStep; cardRef: RefObject<HTMLElement | null> }) {
  const [action, setAction] = useState<Box | null>(null)
  const [nav, setNav] = useState<Box | null>(null)

  useEffect(() => {
    let frame = 0
    let active = true
    let prepared = !step.prepare
    let scrollAttempts = 0
    let lastScroll = 0
    let retryTimer: number | undefined
    const started = performance.now()

    setAction(null)
    setNav(null)

    const update = () => {
      frame = 0
      if (!active) return

      // Open the right part of the section first (e.g. the "Jídelníček" switch inside Recepty).
      if (!prepared && step.prepare) {
        const trigger = findVisible([step.prepare])
        if (trigger) {
          trigger.click()
          prepared = true
        } else if (performance.now() - started > 4000) {
          prepared = true
        }
      }

      const actionElement = prepared && step.target ? findVisible(step.target) : null
      // "Více" is the way in on a phone for the sections that are not in the bottom bar.
      const navElement = step.where ? findVisible([{ selector: `[data-guide-nav="${step.tab}"]` }, { selector: '[data-guide-nav="Více"]' }]) : null
      const nextAction = boxOf(actionElement)
      const nextNav = boxOf(navElement)
      setAction((current) => (sameBox(current, nextAction) ? current : nextAction))
      setNav((current) => (sameBox(current, nextNav) ? current : nextNav))

      // Bring the target into the free part of the screen. Scroll/resize events schedule a fresh
      // measurement, so smooth scrolling does not need a permanent animation-frame loop.
      const now = performance.now()
      if (actionElement && nextAction && scrollAttempts < 5 && now - lastScroll > 700) {
        const card = cardRef.current?.getBoundingClientRect()
        const cardTop = card?.top ?? window.innerHeight
        const overlapsCardHorizontally = !card || (nextAction.left + nextAction.width > card.left && nextAction.left < card.right)
        if (nextAction.top < 72 || (overlapsCardHorizontally && nextAction.top + nextAction.height > cardTop - 16)) {
          scrollAttempts += 1
          lastScroll = now
          const wantedTop = Math.max(84, Math.min(110, cardTop - nextAction.height - 56))
          window.scrollBy({ top: nextAction.top - wantedTop, behavior: 'smooth' })
        }
      }

      // Poll briefly while a lazy-loaded section/segment is mounting. Once it appears, rely on
      // DOM, scroll and resize events instead of repeatedly scanning the entire document.
      const needsRetry = (!prepared && Boolean(step.prepare)) || (Boolean(step.target) && !actionElement)
      if (needsRetry && now - started < 4000) {
        if (retryTimer === undefined) retryTimer = window.setInterval(schedule, 250)
      } else if (retryTimer !== undefined) {
        window.clearInterval(retryTimer)
        retryTimer = undefined
      }
    }

    const schedule = () => {
      if (!active || frame) return
      frame = window.requestAnimationFrame(update)
    }

    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'data-state'],
    })
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    schedule()

    return () => {
      active = false
      observer.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) window.cancelAnimationFrame(frame)
      if (retryTimer !== undefined) window.clearInterval(retryTimer)
    }
  }, [step, cardRef])

  // The label goes below the highlight, or above it when the guide card is right underneath. (The
  // boxes only exist in the browser, after the first frame, so `window` is safe here.)
  const labelAbove = action ? action.top + action.height + 48 > (cardRef.current?.getBoundingClientRect().top ?? window.innerHeight) : false
  const labelRight = action ? action.left > window.innerWidth / 2 : false

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[34]">
      {nav && <Ring box={nav} dashed />}
      {action && (
        <Ring box={action}>
          {step.targetLabel && (
            <span
              className={`absolute flex w-max max-w-[16rem] items-center gap-1 rounded-full bg-[#03bcdb] px-2.5 py-1 text-xs font-semibold text-[#0a1a3f] shadow-md ${labelAbove ? 'bottom-full mb-2' : 'top-full mt-2'} ${labelRight ? 'right-0' : 'left-0'}`}
            >
              {labelAbove ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />}
              {step.targetLabel}
            </span>
          )}
        </Ring>
      )}
    </div>
  )
}

function Ring({ box, dashed = false, children }: { box: Box; dashed?: boolean; children?: ReactNode }) {
  return (
    <div
      className={`absolute rounded-2xl border-2 border-[#03bcdb] transition-[top,left,width,height] duration-300 ease-out motion-safe:animate-in motion-safe:fade-in ${dashed ? 'border-dashed' : 'guide-ring'}`}
      style={{ top: box.top - 5, left: box.left - 5, width: box.width + 10, height: box.height + 10 }}
    >
      {children}
    </div>
  )
}
