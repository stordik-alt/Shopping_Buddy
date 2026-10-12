'use client'

import { ArrowLeft, ArrowRight, Check, ChevronDown, MapPin, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AnitkaMascot, talkDurationMs } from '@/components/guide/anitka-mascot'
import { GuideSpotlight } from '@/components/guide/guide-spotlight'
import { tabIcons } from '@/components/shared/nav-item'
import { GUIDE_STEPS, QUICK_GUIDE_STEPS, clampStep, indexAfterModeSwitch } from '@/lib/guide'
import type { Tab } from '@/lib/types'

/** Anitka's clickable tour: one card per step. The mascot stands inside the card and the guide
 *  highlights, in the real app behind it, where the card says to look (the section's entry in the
 *  navigation and the place to act). It is not a modal: the section it talks about is opened behind
 *  the card, which sits above the phone's bottom bar (or in the corner on a wide screen). Mount it to
 *  start; it starts at the first card each time. `onClose` is called once, however the tour ends. */
export function GuideTour({ onNavigate, onClose }: { onNavigate: (tab: Tab) => void; onClose: () => void }) {
  const [index, setIndex] = useState(0)
  // The quick tour is the default; "Podrobně" adds the deep-dive cards (lib/guide.ts `detail`).
  const [detailed, setDetailed] = useState(false)
  const steps = detailed ? GUIDE_STEPS : QUICK_GUIDE_STEPS
  // Which way the last move went, so the next card slides in from the matching side.
  const [direction, setDirection] = useState<1 | -1>(1)
  const cardRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [moreBelow, setMoreBelow] = useState(false)
  const step = steps[index]
  const last = index === steps.length - 1
  const first = index === 0
  const SectionIcon = tabIcons[step.tab]

  const updateMore = () => {
    const el = scrollRef.current
    if (el) setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
  }

  // Show the section the current card is about.
  useEffect(() => {
    onNavigate(step.tab)
    // The card is a fresh topic: start it from the top (a long card scrolls inside itself).
    scrollRef.current?.scrollTo({ top: 0 })
    updateMore()
  }, [step.tab, step.id, onNavigate])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const go = (delta: 1 | -1) => {
    setDirection(delta)
    setIndex((current) => clampStep(current, delta, steps.length))
  }
  // Switching keeps the reader on the same topic: the same card, or the section's main card.
  const switchMode = () => {
    const next = detailed ? QUICK_GUIDE_STEPS : GUIDE_STEPS
    setIndex(indexAfterModeSwitch(step.id, steps, next))
    setDetailed(!detailed)
  }
  const slide = direction === 1 ? 'motion-safe:slide-in-from-right-4' : 'motion-safe:slide-in-from-left-4'

  return (
    <>
      <GuideSpotlight step={step} cardRef={cardRef} />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-label="Průvodce aplikací"
        // Above the highlight (z-45), so a target that sits behind the card is never drawn over it, and
        // below the app's own dialogs (z-50).
        className="fixed inset-x-2 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-[46] mx-auto max-w-md lg:inset-x-auto lg:bottom-6 lg:right-6 lg:mx-0 lg:w-[27rem]"
      >
        {/* flex-row-reverse: the mascot stands on the right, so she looks (to her left, as the artwork
            has her) into the card, not out of the phone. The picture itself is not mirrored: her
            shirt carries the ANITKA lettering. */}
        <div className="flex flex-row-reverse overflow-hidden rounded-3xl border border-border bg-surface-elevated text-foreground shadow-elevated motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-300">
          {/* The mascot stands inside the card, whole, with her feet on its lower edge. Above her
              the icon of the section being explained, the same one the navigation uses. */}
          <div className="flex w-[6rem] shrink-0 flex-col items-center justify-between bg-accent-subtle pt-3 sm:w-28">
            <span key={`icon-${step.id}`} className="flex size-9 items-center justify-center rounded-full bg-surface-elevated text-accent-text shadow-sm motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300">
              <SectionIcon className="size-5" aria-hidden="true" />
            </span>
            {/* She hops in each time a new card appears (the key restarts it), breathes and sways, and her
                face and head are alive: blinking, smiling, nodding, a wink (components/guide/anitka-mascot.tsx). */}
            {/* The picture is wider than the column on purpose (its left side is where her raised hand goes
                while she greets): it overhangs the text for those few seconds, and she herself stands in the
                middle of the column. */}
            <div key={`mascot-${step.id}`} className="guide-hop pointer-events-none relative z-10 mt-3 w-[8.25rem] shrink-0 -ml-[2.25rem] self-start sm:w-36">
              <AnitkaMascot mood={step.mood} talkMs={talkDurationMs(step.text)} className="guide-idle" />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 pl-3 pr-2 pt-2.5">
              <p className="text-xs font-medium text-fg-muted">
                Krok {index + 1} z {steps.length}
              </p>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={switchMode}
                  aria-label={detailed ? `Přepnout na stručný průvodce (${QUICK_GUIDE_STEPS.length} karet)` : `Přepnout na podrobný průvodce (${GUIDE_STEPS.length} karet)`}
                  className="inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-semibold text-accent-text hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {detailed ? 'Stručně' : 'Podrobně'}
                </button>
                <button type="button" onClick={onClose} aria-label="Zavřít průvodce" className="icon-button shrink-0">
                  <X className="size-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="relative">
            <div
              ref={scrollRef}
              aria-live="polite"
              onScroll={updateMore}
              // A soft fade at the bottom shows there is more to read when a long card scrolls.
              // A card with a "Co ještě tu najdete" list is the section's summary, so it gets more room
              // before it has to scroll.
              className={`${!detailed && step.also ? 'max-h-[min(46dvh,26rem)] [@media(max-height:640px)]:max-h-[38dvh]' : 'max-h-[min(34dvh,20rem)] [@media(max-height:640px)]:max-h-[26dvh]'} overflow-y-auto overscroll-contain px-3 pb-1 ${moreBelow ?'[mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)]' : ''}`}
            >
              <div key={step.id} className={`motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 ${slide}`}>
                <h2 className="text-balance text-base font-semibold leading-snug">{step.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-fg-secondary">{step.text}</p>
                {step.where && (
                  <p className="mt-2 flex items-start gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
                    <span>{step.where}</span>
                  </p>
                )}
                {step.why && (
                  <div className="mt-3">
                    <p className="text-sm font-semibold">Proč na tom záleží</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-fg-secondary">
                      {step.why.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {/* Quick tour only: the full tour has a card of its own for each of these. */}
                {!detailed && step.also && (
                  <div className="mt-3">
                    <p className="text-sm font-semibold">Co ještě tu najdete</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-fg-secondary">
                      {step.also.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {step.todo && (
                  <div className="mt-3">
                    <p className="text-sm font-semibold">Co udělat</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-fg-secondary">
                      {step.todo.map((todo) => (
                        <li key={todo}>{todo}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            {/* Says out loud that the card goes on below (the fade alone is easy to miss); gone at the end. */}
            {moreBelow && (
              <span className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center" aria-hidden="true">
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-subtle px-2.5 py-0.5 text-xs font-semibold text-accent-text shadow-sm">
                  <ChevronDown className="size-3.5" /> Posuňte dolů
                </span>
              </span>
            )}
            </div>

            <div className="px-3 pb-3 pt-2.5">
              <div className="mb-2.5 flex justify-center gap-1.5" aria-hidden="true">
                {steps.map((item, dot) => (
                  <span key={item.id} className={`h-1.5 rounded-full transition-all duration-300 ${dot === index ? 'w-5 bg-primary' : 'w-1.5 bg-border'}`} />
                ))}
              </div>
              {last && step.secondaryCta && (
                <button
                  type="button"
                  onClick={() => {
                    onNavigate(step.secondaryCta!.tab)
                    onClose()
                  }}
                  className="mb-1.5 flex min-h-11 w-full items-center justify-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted"
                >
                  {step.secondaryCta.label}
                </button>
              )}
              <div className="flex items-center gap-1">
                {first ? (
                  <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center rounded-xl px-2.5 text-sm font-medium text-fg-secondary hover:bg-muted">
                    Přeskočit
                  </button>
                ) : (
                  <button type="button" onClick={() => go(-1)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-fg-secondary hover:bg-muted">
                    <ArrowLeft className="size-4" aria-hidden="true" /> Zpět
                  </button>
                )}
                {last && step.cta ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (step.cta!.tab) onNavigate(step.cta!.tab)
                      onClose()
                    }}
                    className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
                  >
                    <Check className="size-4" aria-hidden="true" /> {step.cta.label}
                  </button>
                ) : (
                  <button type="button" onClick={() => go(1)} className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
                    {first ? 'Začít' : 'Další'} <ArrowRight className="size-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
