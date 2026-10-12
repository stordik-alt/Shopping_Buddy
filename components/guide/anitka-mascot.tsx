'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import type { GuideMood } from '@/lib/guide'

/** Anitka as a living character, from the owner's artwork (a girl in a blue T-shirt, seen from the front), cut out
 *  from the studio background of the animation she was made for. One canvas (300 × 417 px, upper body) is used by
 *  every picture:
 *  - the still picture (`anitka-guide-front.webp`), on which the head is stacked a second time and cut off at the
 *    neck, so only the head drifts, nods and tilts; on it a thin SVG draws the eyelids (blinking, a wink) and the
 *    mouth (a smile, and moving lips while a card "talks");
 *  - the greeting (`mood: 'wave'`, the first card): the frames of the wave animation, packed into a sprite sheet
 *    (`anitka-guide-wave.webp`, 7 × 5 tiles, played at 12 frames per second), shown in place of the still picture
 *    and faded back into it at the end.
 *  The motion of the still picture lives in app/globals.css (`.anitka-*`); `mood` picks what she does when a card
 *  appears (`GuideMood` in lib/guide.ts). Everything is decorative (`aria-hidden`) and stops under "reduce
 *  motion" (no greeting then, just the still picture). The SVG uses the animation's own pixel coordinates (frame
 *  1176 × 1756), shifted by the crop. */
const FRONT = '/brand/anitka/anitka-guide-front.webp'
const WAVE = '/brand/anitka/anitka-guide-wave.webp'
const CROP = { x: 150, y: 150, w: 690, h: 960 }
const COLS = 7
const ROWS = 5
const TILES = 35
const FPS = 12

/** An eyelid that covers one eye when it is closed, with the lash line at its lower edge. */
function Eyelid({ side, d, lash }: { side: 'l' | 'r'; d: string; lash: string }) {
  return (
    <g className={`anitka-lid anitka-lid-${side}`}>
      <path d={d} fill="url(#anitka-lid-fill)" />
      <path d={lash} fill="none" stroke="#5a3326" strokeWidth="3" strokeLinecap="round" />
    </g>
  )
}

function Face() {
  return (
    <svg viewBox={`0 0 ${CROP.w} ${CROP.h}`} className="pointer-events-none absolute inset-0 size-full" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="anitka-lid-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9a589" />
          <stop offset="1" stopColor="#e8bba0" />
        </linearGradient>
      </defs>
      <g transform={`translate(${-CROP.x} ${-CROP.y})`}>
        <Eyelid side="l" d="M517 331 Q543 306 570 331 Q570 355 543 355 Q517 355 517 331Z" lash="M521 336 Q543 354 566 336" />
        <Eyelid side="r" d="M605 331 Q633 306 660 331 Q660 355 633 355 Q605 355 605 331Z" lash="M609 336 Q633 354 657 336" />
        {/* A broader smile: the corners of the mouth lift a little. */}
        <g className="anitka-smile">
          <path d="M551 396 Q555 406 566 410 M625 394 Q621 405 609 409" fill="none" stroke="#b56d5c" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M565 410 Q588 418 610 408" fill="none" stroke="#c98474" strokeWidth="2.4" strokeLinecap="round" />
        </g>
        {/* Lips moving for a moment while a card is "said": the opening grows and shrinks from the upper lip. */}
        <g className="anitka-talk">
          <g className="anitka-talk-open">
            <path d="M566 402 Q588 397 611 402 Q588 426 566 402Z" fill="#6a2626" />
            <path d="M566 402 Q588 426 611 402" fill="none" stroke="#c98474" strokeWidth="2.6" strokeLinecap="round" />
          </g>
        </g>
      </g>
    </svg>
  )
}

/** How long she "talks" for a card: about as long as it takes to say its text, kept between 1.6 and 4.5 s so
 *  a long card does not make her chatter on and a short one still gets a sentence. */
export function talkDurationMs(text: string): number {
  return Math.min(4500, Math.max(1600, Math.round(text.length * 38)))
}

const tilePosition = (index: number) => `${((index % COLS) * 100) / (COLS - 1)}% ${(Math.floor(index / COLS) * 100) / (ROWS - 1)}%`

export function AnitkaMascot({ mood = 'smile', talkMs = 2400, className = '' }: { mood?: GuideMood; talkMs?: number; className?: string }) {
  // True while the greeting is played; the still picture and the head are hidden meanwhile.
  const [waving, setWaving] = useState(false)
  const [sprite, setSprite] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (mood !== 'wave' || !sprite || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let cancelled = false
    const picture = new Image()
    picture.onload = () => {
      if (cancelled) return
      const started = performance.now()
      sprite.style.backgroundPosition = tilePosition(0)
      setWaving(true)
      const tick = (now: number) => {
        const index = Math.floor(((now - started) / 1000) * FPS)
        if (index >= TILES) {
          setWaving(false)
          return
        }
        sprite.style.backgroundPosition = tilePosition(index)
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }
    picture.src = WAVE
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [mood, sprite])

  return (
    <div className={`anitka ${className}`} data-mood={mood} data-waving={waving} style={{ '--talk': `${talkMs}ms` } as CSSProperties} aria-hidden="true">
      <div className="anitka-body relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- approved static brand asset */}
        <img src={FRONT} alt="" width={300} height={417} className="anitka-front relative block h-auto w-full select-none" draggable={false} />
        {/* The head: the same picture cut off at the neck, tilting around the neck. */}
        <div className="anitka-head absolute inset-0">
          <div className="anitka-speak absolute inset-0">
            <div className="anitka-react absolute inset-0" style={{ clipPath: 'inset(0 0 63% 0)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- approved static brand asset */}
              <img src={FRONT} alt="" width={300} height={417} className="block h-auto w-full select-none" draggable={false} />
              <Face />
            </div>
          </div>
        </div>
        {mood === 'wave' && (
          <div
            ref={setSprite}
            className="anitka-wave-sprite absolute inset-0"
            style={{ backgroundImage: `url(${WAVE})`, backgroundSize: `${COLS * 100}% ${ROWS * 100}%`, backgroundRepeat: 'no-repeat', backgroundPosition: tilePosition(0) }}
          />
        )}
      </div>
    </div>
  )
}
