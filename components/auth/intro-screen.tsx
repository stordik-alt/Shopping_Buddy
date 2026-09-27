'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
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

export function IntroScreen() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [dark, setDark] = useState(false)

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
      <div className="relative flex min-h-[100svh] flex-col overflow-hidden bg-white dark:bg-[var(--anitka-navy)]">
        {/* A very small decorative touch, per the brief — not a shape competing with the logo. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden"
        >
          <div className="absolute left-1/2 top-[-7rem] size-64 -translate-x-1/2 rounded-full bg-[var(--anitka-turquoise)]/10 blur-3xl" />
        </div>

        <div
          className="relative mx-auto flex w-full max-w-sm flex-1 flex-col items-center px-6 pt-[max(3rem,env(safe-area-inset-top)+2rem)] pb-[max(1.5rem,env(safe-area-inset-bottom)+0.5rem)] text-center"
        >
          <div className="flex flex-1 flex-col items-center justify-center gap-8">
            <div className="flex flex-col items-center gap-2">
              {/* The logo is a finished asset with an opaque white background — this plate keeps it
                  crisp against the dark background too, without recolouring the image itself. */}
              <div className="w-full max-w-[17rem] rounded-[1.75rem] bg-white p-5 shadow-[0_16px_40px_-16px_rgba(10,26,63,0.35)] dark:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.55)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- images are unoptimized in next.config; the approved logo is a plain static asset */}
                <img src="/brand/anitka/anitka-logo.png" alt="ANITKA" width={2172} height={724} className="h-auto w-full" fetchPriority="high" />
              </div>
              <p className="text-xs font-medium uppercase tracking-[0.15em] text-[var(--anitka-navy)]/50 dark:text-white/50">Powered by ANITKA AI</p>
            </div>

            <div className="space-y-3">
              <h1 className="text-balance text-2xl font-bold leading-snug text-[var(--anitka-navy)] dark:text-white sm:text-[1.75rem]">
                Vaše chytrá pomocnice pro domácnost.
              </h1>
              <p className="text-balance text-sm text-[var(--anitka-navy)]/70 dark:text-white/75 sm:text-base">
                Nákupy, zásoby, rozpočet a jídelníček na jednom místě.
              </p>
            </div>
          </div>

          <div className="w-full space-y-3">
            <button
              type="button"
              onClick={proceed}
              className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-[var(--anitka-navy)] px-6 text-base font-semibold text-white shadow-[0_10px_24px_-8px_rgba(10,26,63,0.45)] transition active:scale-[0.99] dark:bg-[var(--anitka-turquoise)] dark:text-[var(--anitka-navy)]"
            >
              Začít
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
