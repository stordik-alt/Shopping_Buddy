'use client'

import { useRouter } from 'next/navigation'
import styles from './intro-screen.module.css'

export function IntroScreen() {
  const router = useRouter()

  return (
    <main className={styles.screen}>
      <div className={styles.content}>
        <div className={styles.hero} aria-hidden="true">
          <img
            className={styles.heroImage}
            src="/buddy-intro/robot.webp"
            alt=""
            draggable={false}
          />
        </div>

        <section className={styles.copy} aria-labelledby="buddy-intro-title">
          <h1 id="buddy-intro-title">Buddy</h1>
          <p>Chytrý nákupní asistent pro vaši domácnost</p>
        </section>

        <button
          type="button"
          className={styles.continueButton}
          onClick={() => router.push('/auth/sign-in')}
        >
          Pokračovat na přihlášení
        </button>
      </div>
    </main>
  )
}
