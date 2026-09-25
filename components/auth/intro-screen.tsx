'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { Montserrat } from 'next/font/google'
import styles from './intro-screen.module.css'

// Versioned so an old test value cannot unexpectedly skip the new intro.
const SKIP_INTRO_KEY = 'shopping-buddy:skip-intro:v2'

// The intro artwork's wordmark is set in a geometric heavy sans; Montserrat matches it. latin-ext
// covers the Czech diacritics in the tagline and button.
const montserrat = Montserrat({ subsets: ['latin', 'latin-ext'], weight: ['500', '700', '800'] })

// The wordmark's letters pop in one after another (the delay step lives in the CSS via --i).
const TITLE_LETTERS = ['B', 'u', 'd', 'd', 'y']

// Sparks drifting up around Buddy once he has landed: horizontal position (% of the scene),
// starting height (% from the bottom) and delay, so they don't rise in lockstep.
const SPARKS = [
  { x: 24, y: 30, delay: 0 },
  { x: 72, y: 42, delay: 0.9 },
  { x: 35, y: 58, delay: 1.7 },
  { x: 66, y: 22, delay: 2.4 },
  { x: 18, y: 50, delay: 3.1 },
  { x: 80, y: 60, delay: 1.3 },
]

export function IntroScreen() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [skipIntro, setSkipIntro] = useState(false)

  useEffect(() => {
    const shouldSkip = window.localStorage.getItem(SKIP_INTRO_KEY) === 'true'

    if (shouldSkip) {
      router.replace('/auth/sign-in')
      return
    }

    setReady(true)
  }, [router])

  const handleContinue = () => {
    if (skipIntro) {
      window.localStorage.setItem(SKIP_INTRO_KEY, 'true')
    } else {
      window.localStorage.removeItem(SKIP_INTRO_KEY)
    }

    router.push('/auth/sign-in')
  }

  if (!ready) {
    return <main className={styles.screen} aria-hidden="true" />
  }

  return (
    <main className={`${styles.screen} ${montserrat.className}`}>
      <div className={styles.content}>
        {/* Buddy's entrance (timing in intro-screen.module.css): he rises in and lands with a
            bounce, rings flash on the floor and the glow behind him lights up; afterwards he
            gently floats while sparks drift up. Reduced motion shows the final scene at once.
            The artwork lives under /intro/ so proxy.ts serves it to signed-out visitors. */}
        <div className={styles.hero}>
          <div className={styles.glow} aria-hidden="true" />
          <div className={styles.buddy}>
            {/* eslint-disable-next-line @next/next/no-img-element -- images are unoptimized in next.config; a plain img keeps the object-fit sizing simple */}
            <img
              src="/intro/buddy-hero.webp"
              alt="Buddy, robot v kšiltovce, s nákupním košíkem a bankovkami"
              width={1080}
              height={1340}
              fetchPriority="high"
            />
          </div>
          <div className={styles.landingRing} aria-hidden="true" />
          <div className={`${styles.landingRing} ${styles.landingRingLate}`} aria-hidden="true" />
          <div className={styles.sparks} aria-hidden="true">
            {SPARKS.map((spark, index) => (
              <span
                key={index}
                style={{
                  '--x': `${spark.x}%`,
                  '--y': `${spark.y}%`,
                  '--delay': `${spark.delay}s`,
                } as CSSProperties}
              />
            ))}
          </div>
        </div>

        <section className={styles.copy} aria-labelledby="buddy-intro-title">
          <h1 id="buddy-intro-title" aria-label="Buddy">
            {TITLE_LETTERS.map((letter, index) => (
              <span key={index} aria-hidden="true" style={{ '--i': index } as CSSProperties}>
                {letter}
              </span>
            ))}
          </h1>
          <p>Chytrý nákupní asistent pro vaši domácnost</p>
        </section>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.continueButton}
            onClick={handleContinue}
          >
            Pokračovat na přihlášení
          </button>

          <label className={styles.skipOption}>
            <input
              type="checkbox"
              checked={skipIntro}
              onChange={(event) => setSkipIntro(event.target.checked)}
            />
            <span>Příště už intro nezobrazovat</span>
          </label>
        </div>
      </div>
    </main>
  )
}
