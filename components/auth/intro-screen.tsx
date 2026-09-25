'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BuddyScene } from './buddy-scene'
import styles from './intro-screen.module.css'

// Versioned so an old test value cannot unexpectedly skip the new intro.
const SKIP_INTRO_KEY = 'shopping-buddy:skip-intro:v2'

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
    <main className={styles.screen}>
      <div className={styles.content}>
        <div className={styles.hero}>
          <BuddyScene />
        </div>

        <section className={styles.copy} aria-labelledby="buddy-intro-title">
          <h1 id="buddy-intro-title">Buddy</h1>
          <p>Chytrý nákupní asistent pro vaši domácnost</p>
        </section>

        <div className={styles.actions}>
          <label className={styles.skipOption}>
            <input
              type="checkbox"
              checked={skipIntro}
              onChange={(event) => setSkipIntro(event.target.checked)}
            />
            <span>Příště už intro nezobrazovat</span>
          </label>

          <button
            type="button"
            className={styles.continueButton}
            onClick={handleContinue}
          >
            Pokračovat na přihlášení
          </button>
        </div>
      </div>
    </main>
  )
}
