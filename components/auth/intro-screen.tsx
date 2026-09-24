'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Banknote, ShoppingBasket } from 'lucide-react'
import { useRouter } from 'next/navigation'
import styles from './intro-screen.module.css'

const INTRO_SEEN_KEY = 'shopping-buddy:intro-seen'

function BuddyRobot() {
  return (
    <div className={styles.robotWrap} aria-hidden="true">
      <div className={styles.robotGlow} />
      <div className={styles.robot}>
        <div className={styles.cap}>
          <div className={styles.capTop} />
          <div className={styles.capBrim} />
        </div>
        <div className={styles.head}>
          <div className={styles.ear} />
          <div className={styles.face}>
            <span className={styles.eye} />
            <span className={styles.eye} />
            <span className={styles.mouth} />
          </div>
        </div>
        <div className={styles.neck} />
        <div className={styles.torso}>
          <div className={styles.chestLight} />
          <div className={styles.chestLine} />
        </div>
        <div className={styles.armLeft}>
          <div className={styles.hand} />
          <div className={styles.basket}>
            <div className={styles.basketHandle} />
            <div className={styles.basketBody}>
              <span>🥖</span><span>🥛</span><span>🍎</span>
            </div>
          </div>
        </div>
        <div className={styles.armRight}>
          <div className={styles.hand} />
          <div className={styles.money}>
            <Banknote />
            <span>100 Kč</span>
          </div>
        </div>
        <div className={styles.legLeft} />
        <div className={styles.legRight} />
      </div>
    </div>
  )
}

export function IntroScreen() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (window.localStorage.getItem(INTRO_SEEN_KEY) === '1') {
      router.replace('/auth/sign-in')
      return
    }

    setReady(true)
    window.localStorage.setItem(INTRO_SEEN_KEY, '1')
  }, [router])

  if (!ready) {
    return <main className={styles.screen} aria-hidden="true" />
  }

  return (
    <main className={styles.screen}>
      <div className={styles.backgroundOrb} />
      <div className={styles.content}>
        <div className={styles.hero}>
          <BuddyRobot />
        </div>

        <div className={styles.copy}>
          <div className={styles.brandMark}>
            <ShoppingBasket aria-hidden="true" />
            <span>Buddy</span>
          </div>
          <h1>Chytrý nákupní asistent</h1>
          <p>pro vaši domácnost</p>
        </div>

        <button
          type="button"
          className={styles.continueButton}
          onClick={() => router.push('/auth/sign-in')}
        >
          <span>Pokračovat na přihlášení</span>
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </main>
  )
}
