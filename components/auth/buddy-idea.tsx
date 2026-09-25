import type { CSSProperties } from 'react'
import { Lightbulb } from 'lucide-react'
import styles from './buddy-idea.module.css'

// Buddy's bust on the sign-in page: shoulders, neck and capped head from the intro artwork
// (public/brand) in a round portrait, with a lightbulb popping up beside him as if he just had a
// great idea. Timing is in buddy-idea.module.css; reduced motion shows the lit bulb at once.
export function BuddyIdea() {
  return (
    <div className={styles.scene}>
      <div className={styles.portrait}>
        {/* eslint-disable-next-line @next/next/no-img-element -- images are unoptimized in next.config */}
        <img
          src="/brand/buddy-bust.webp"
          alt="Buddy, robot v kšiltovce, dostal skvělý nápad"
          width={440}
          height={390}
        />
      </div>
      <div className={styles.idea} aria-hidden="true">
        <span className={styles.rays}>
          {[0, 1, 2, 3, 4].map((index) => (
            <span key={index} style={{ '--ray': index } as CSSProperties} />
          ))}
        </span>
        <Lightbulb className={styles.bulb} strokeWidth={1.75} />
      </div>
    </div>
  )
}
