'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Montserrat } from 'next/font/google'
import styles from './intro-screen.module.css'

// Versioned so an old test value cannot unexpectedly skip the new intro.
const SKIP_INTRO_KEY = 'shopping-buddy:skip-intro:v2'

// The intro artwork's wordmark is set in a geometric heavy sans; Montserrat matches it. latin-ext
// covers the Czech diacritics in the tagline and button.
const montserrat = Montserrat({ subsets: ['latin', 'latin-ext'], weight: ['500', '700', '800'] })

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
        {/* Artwork lives under /intro/ so proxy.ts serves it to signed-out visitors. The title,
            tagline and button are real text below it rather than baked into the picture. */}
        <div className={styles.hero}>
          {/* eslint-disable-next-line @next/next/no-img-element -- images are unoptimized in next.config; a plain img keeps the object-fit sizing simple */}
          <img
            src="/intro/buddy-hero.webp"
            alt="Buddy, robot v kšiltovce, s nákupním košíkem a bankovkami"
            width={1080}
            height={1340}
            fetchPriority="high"
          />
        </div>

        <section className={styles.copy} aria-labelledby="buddy-intro-title">
          <h1 id="buddy-intro-title">Buddy</h1>
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
