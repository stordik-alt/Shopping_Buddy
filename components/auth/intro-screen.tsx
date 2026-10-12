'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { AnitkaIntroFigure } from '@/components/auth/anitka-intro-figure'
import { safeLocalStorage } from '@/lib/safe-storage'
import { readThemeChoice, resolveDark } from '@/lib/theme-preference'

// The ANITKA rebrand's own first screen (owner brief, 2026-09-27): a minimalist intro built around
// the approved logo asset (public/brand/anitka/anitka-logo.png — untouched, per the brief's "do not
// redraw the logo"; served to signed-out visitors by proxy.ts, same as the rest of public/brand). Its
// job is unchanged from before — mark the intro seen, then hand off to the existing sign-in screen —
// only the screen itself is new.
const SKIP_INTRO_KEY = 'shopping-buddy:skip-intro:v2'

// Sampled directly from the approved logo asset (not invented): the wordmark's navy and the symbol's
// turquoise wedge. Scoped to this one screen — the rest of the app keeps its own theme tokens
// (app/globals.css); this is ANITKA's own fixed brand palette, not a site-wide change.
const ANITKA_NAVY = '#0a1a3f'
const ANITKA_TURQUOISE = '#03bcdb'

// What Anitka says before sign-in: three short pages, plain words, no feature jargon.
const INTRO_PAGES = [
  { title: 'Ahoj, já jsem Anitka!', text: 'Budu vám pomáhat s nákupy, penězi i vařením. Slibuju, že to bude snadné.' },
  { title: 'Všechno máte na jednom místě', text: 'Co koupit, co je doma, kde jsou slevy, kolik jste utratili a co dnes uvařit.' },
  { title: 'A já jsem pořád u vás', text: 'Založíte si účet a já vám v aplikaci ukážu, co kde je. Krok za krokem, bez stresu.' },
] as const

export function IntroScreen() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [dark, setDark] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const page = INTRO_PAGES[pageIndex]
  const lastPage = pageIndex === INTRO_PAGES.length - 1

  useEffect(() => {
    const storage = safeLocalStorage()
    if (storage?.getItem(SKIP_INTRO_KEY) === 'true') {
      router.replace('/auth/sign-in')
      return
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    setDark(resolveDark(readThemeChoice(storage), media.matches))
    setReady(true)
  }, [router])

  // Either action dismisses the intro for good and continues to the existing sign-in flow — there is
  // no reason to show it again once someone has gone through it, whichever button they used.
  function proceed() {
    safeLocalStorage()?.setItem(SKIP_INTRO_KEY, 'true')
    router.push('/auth/sign-in')
  }

  if (!ready) return <main className="min-h-[100svh] bg-white" aria-hidden="true" />

  return (
    <main
      className={dark ? 'dark' : ''}
      style={{ '--anitka-navy': ANITKA_NAVY, '--anitka-turquoise': ANITKA_TURQUOISE } as CSSProperties}
    >
      <div className="relative flex min-h-[100svh] flex-col overflow-x-hidden bg-white dark:bg-[var(--anitka-navy)]">
        {/* A very small decorative touch, per the brief — not a shape competing with the logo. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden"
        >
          <div className="absolute left-1/2 top-[-7rem] size-64 -translate-x-1/2 rounded-full bg-[var(--anitka-turquoise)]/10 blur-3xl" />
        </div>

        <div
          className="relative mx-auto flex w-full max-w-sm flex-1 flex-col items-center px-6 pt-[max(3rem,env(safe-area-inset-top)+2rem)] [@media(max-height:680px)]:pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom)+0.5rem)] text-center"
        >
          <div className="flex flex-1 flex-col items-center justify-center gap-5">
            <div className="flex flex-col items-center gap-2">
              {/* The logo is a finished asset with an opaque white background — this plate keeps it
                  crisp against the dark background too, without recolouring the image itself. */}
              <div className="w-full max-w-[13rem] rounded-[1.5rem] bg-white p-4 [@media(max-height:680px)]:max-w-[9.5rem] [@media(max-height:680px)]:p-3 shadow-[0_16px_40px_-16px_rgba(10,26,63,0.35)] dark:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.55)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- images are unoptimized in next.config; the approved logo is a plain static asset */}
                <img src="/brand/anitka/anitka-logo.png" alt="ANITKA" width={2172} height={724} className="h-auto w-full" fetchPriority="high" />
              </div>
              <p className="text-xs font-medium uppercase tracking-[0.15em] text-[var(--anitka-navy)]/70 dark:text-white/50">Powered by ANITKA AI</p>
            </div>

            {/* The mascot introduces the app in a few short pages the visitor clicks through: she walks in from
                beyond the edge of the screen, and her speech bubble appears once she stands there. */}
            <div className="flex w-full flex-col items-center">
              <div className="anitka-intro-bubble relative w-full rounded-3xl bg-white px-5 pb-4 pt-4 text-left shadow-[0_12px_30px_-14px_rgba(10,26,63,0.35)] ring-1 ring-[var(--anitka-navy)]/10 dark:bg-white/10 dark:ring-white/15">
                <h1 className="text-balance text-lg font-bold leading-snug text-[var(--anitka-navy)] dark:text-white">{page.title}</h1>
                <p aria-live="polite" className="mt-1.5 min-h-[5.5rem] text-balance text-sm leading-relaxed text-[var(--anitka-navy)]/75 dark:text-white/80 sm:text-base">
                  {page.text}
                </p>
                <div className="mt-2 flex justify-center gap-1.5" role="group" aria-label="Stránka představení">
                  {INTRO_PAGES.map((item, dot) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => setPageIndex(dot)}
                      aria-label={`Stránka ${dot + 1} z ${INTRO_PAGES.length}`}
                      aria-current={dot === pageIndex ? 'step' : undefined}
                      className="flex size-6 items-center justify-center"
                    >
                      <span className={`h-1.5 rounded-full transition-all ${dot === pageIndex ? 'w-5 bg-[var(--anitka-navy)] dark:bg-[var(--anitka-turquoise)]' : 'w-1.5 bg-[var(--anitka-navy)]/25 dark:bg-white/30'}`} />
                    </button>
                  ))}
                </div>
                {/* The tail of the bubble points down to her. */}
                <span aria-hidden="true" className="absolute left-1/2 top-full h-3 w-5 -translate-x-1/2 bg-white [clip-path:polygon(0_0,100%_0,50%_100%)] dark:bg-[#1d2b52]" />
              </div>
              <div role="img" aria-label="Anitka, maskot aplikace" className="mt-4">
                <AnitkaIntroFigure className="h-[clamp(9.5rem,33svh,19rem)] aspect-[468/809]" />
              </div>
            </div>
          </div>

          <div className="mt-5 w-full space-y-3">
            <button
              type="button"
              onClick={lastPage ? proceed : () => setPageIndex((current) => current + 1)}
              className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-[var(--anitka-navy)] px-6 text-base font-semibold text-white shadow-[0_10px_24px_-8px_rgba(10,26,63,0.45)] transition active:scale-[0.99] dark:bg-[var(--anitka-turquoise)] dark:text-[var(--anitka-navy)]"
            >
              {lastPage ? 'Začít' : 'Další'}
            </button>
            <button
              type="button"
              onClick={proceed}
              className="flex min-h-11 w-full items-center justify-center text-sm font-medium text-[var(--anitka-navy)]/60 transition hover:text-[var(--anitka-navy)] dark:text-white/60 dark:hover:text-white"
            >
              Přeskočit
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
