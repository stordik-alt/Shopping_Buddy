'use client'

import { useEffect, useRef } from 'react'

/** Anitka's entrance on the intro screen: she walks in from beyond the left edge of the screen, in profile,
 *  towards the middle; there she slows down, turns to the visitor and waves.
 *
 *  The pictures are frames of the owner's animation (a walk in profile, then the turn and the wave, 5 s of it
 *  at 24 fps), cut out from the studio background and packed into one sprite sheet
 *  (`anitka-intro-walk.webp`, 8 × 8 tiles of 300 × 509 px, played at 12 fps):
 *  - tiles 0–15 are one full stride (32 source frames), which is repeated as often as the distance asks for,
 *    so the feet keep up with the ground on a narrow phone and on a wide screen alike;
 *  - tiles 16–62 are the end of the walk, the turn, the wave and a calm standing pose (source frames 100–192).
 *  Both the frame and the position are worked out from the elapsed time and written straight to the element
 *  (no React re-render per frame). Under "reduce motion" she just stands there, facing the visitor.
 *  Decorative: the speech bubble beside her says everything. */
const ATLAS = '/brand/anitka/anitka-intro-walk.webp'
const COLS = 8
const ROWS = 8
const FPS = 12
const CYCLE_FRAMES = 16
const TAIL_FIRST = CYCLE_FRAMES
const TAIL_FRAMES = 47
const LAST_FRAME = TAIL_FIRST + TAIL_FRAMES - 1
/** The tail frame (counted from the start of the tail) where the wave begins. */
const WAVE_AT_TAIL = 19
/** The tail frames in which she is still moving forward while she turns; she slows down over them. */
const DECEL_FRAMES = 12
/** How fast the source animation's stride moves the ground under the feet, in source pixels per second, and the
 *  height those pixels are measured in. Matching it keeps the feet from sliding. */
const SOURCE_SPEED = 720
const SOURCE_HEIGHT = 1545

export function AnitkaIntroFigure({ onWave, className = '' }: { onWave?: () => void; className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const walkerRef = useRef<HTMLDivElement>(null)
  const onWaveRef = useRef(onWave)
  onWaveRef.current = onWave

  useEffect(() => {
    const box = boxRef.current
    const walker = walkerRef.current
    if (!box || !walker) return

    const showFrame = (index: number) => {
      const col = index % COLS
      const row = Math.floor(index / COLS)
      walker.style.backgroundPosition = `${(col * 100) / (COLS - 1)}% ${(row * 100) / (ROWS - 1)}%`
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      showFrame(LAST_FRAME)
      walker.style.opacity = '1'
      onWaveRef.current?.()
      return
    }

    let raf = 0
    let cancelled = false
    const picture = new Image()
    picture.onload = () => {
      if (cancelled) return
      // Geometry is read once the picture is there: where she is going to stand and how big she is.
      const rect = box.getBoundingClientRect()
      const startX = -(rect.left + rect.width + 8)
      const distance = -startX
      const cycle = CYCLE_FRAMES / FPS
      const decel = DECEL_FRAMES / FPS
      const naturalSpeed = SOURCE_SPEED * (rect.height / SOURCE_HEIGHT)
      // Whole strides only, so the walk ends where a stride ends; the speed is adjusted a little to fit.
      const strides = Math.max(1, Math.round((distance - (naturalSpeed * decel) / 2) / (naturalSpeed * cycle)))
      const speed = distance / (strides * cycle + decel / 2)
      const walkTime = strides * cycle
      const tailTime = TAIL_FRAMES / FPS

      let waved = false
      const started = performance.now()
      walker.style.opacity = '1'

      const tick = (now: number) => {
        const t = (now - started) / 1000
        let x = 0
        let frame = LAST_FRAME
        if (t < walkTime) {
          x = startX + speed * t
          frame = Math.floor((t % cycle) * FPS) % CYCLE_FRAMES
        } else {
          const tau = t - walkTime
          const tail = Math.min(TAIL_FRAMES - 1, Math.floor(tau * FPS))
          frame = TAIL_FIRST + tail
          x = tau < decel ? startX + speed * walkTime + speed * (tau - (tau * tau) / (2 * decel)) : 0
          if (!waved && tail >= WAVE_AT_TAIL) {
            waved = true
            onWaveRef.current?.()
          }
        }
        walker.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`
        showFrame(frame)
        if (t < walkTime + tailTime) raf = requestAnimationFrame(tick)
      }
      walker.style.transform = `translate3d(${startX}px,0,0)`
      showFrame(0)
      raf = requestAnimationFrame(tick)
    }
    // If the picture cannot be loaded there is nothing to wait for: show the bubble anyway.
    picture.onerror = () => {
      if (!cancelled) onWaveRef.current?.()
    }
    picture.src = ATLAS
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div ref={boxRef} className={`relative ${className}`} aria-hidden="true">
      <div
        ref={walkerRef}
        className="anitka-intro-walker absolute inset-0"
        style={{
          opacity: 0,
          backgroundImage: `url(${ATLAS})`,
          backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: `${(((LAST_FRAME % COLS) * 100) / (COLS - 1)).toFixed(2)}% ${((Math.floor(LAST_FRAME / COLS) * 100) / (ROWS - 1)).toFixed(2)}%`,
        }}
      >
        {/* Where she stands: a soft shadow on the ground that walks with her. */}
        <div className="anitka-intro-shadow" />
      </div>
    </div>
  )
}
