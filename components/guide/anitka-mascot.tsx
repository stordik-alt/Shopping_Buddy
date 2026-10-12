import type { CSSProperties } from 'react'
import type { GuideMood } from '@/lib/guide'

/** Anitka as a living character, built from a few painted layers that all share one canvas (385 × 764 px, cut
 *  from the owner's artwork, background removed):
 *  - body: the figure without her right arm (the head is part of it),
 *  - arm: the right arm hanging down (a mirrored copy of the left one, since the artwork shows it raised),
 *  - wave-arm + wave-hand: the raised arm for the greeting, the hand cut at the elbow so it can wave.
 *  The head is the body picture stacked a second time, cut off at the neck, so only the head tilts and nods; on
 *  it a thin SVG draws the eyelids (blinking, a wink) and the mouth (a smile, and moving lips while a card
 *  "talks"). The motion lives in app/globals.css (`.anitka-*`); `mood` picks what she does when a card
 *  appears (`GuideMood` in lib/guide.ts). Everything is decorative (`aria-hidden`) and stops under "reduce
 *  motion". The SVG uses the artwork's original pixel coordinates (1088 × 1920) shifted by the crop. The
 *  ANITKA lettering on her shirt is why the picture is never mirrored as a whole. */
const BASE = '/brand/anitka/'
export const MASCOT_BODY = `${BASE}anitka-guide-body.webp`
const ARM = `${BASE}anitka-guide-arm.webp`
const WAVE_ARM = `${BASE}anitka-guide-wave-arm.webp`
const WAVE_HAND = `${BASE}anitka-guide-wave-hand.webp`
const CROP = { x: 172, y: 100, w: 916, h: 1820 }

/** An eyelid that covers one eye when it is closed, with the lash line at its lower edge. */
function Eyelid({ side, d, lash }: { side: 'l' | 'r'; d: string; lash: string }) {
  return (
    <g className={`anitka-lid anitka-lid-${side}`}>
      <path d={d} fill="url(#anitka-lid-fill)" />
      <path d={lash} fill="none" stroke="#4a2c20" strokeWidth="4" strokeLinecap="round" />
    </g>
  )
}

function Face() {
  return (
    <svg viewBox={`0 0 ${CROP.w} ${CROP.h}`} className="pointer-events-none absolute inset-0 size-full" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="anitka-lid-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d8a081" />
          <stop offset="1" stopColor="#e0ab8c" />
        </linearGradient>
      </defs>
      <g transform={`translate(${-CROP.x} ${-CROP.y})`}>
        <Eyelid side="l" d="M354 508 Q408 470 464 510 Q464 562 408 562 Q354 562 354 508Z" lash="M360 522 Q410 552 460 522" />
        <Eyelid side="r" d="M564 510 Q628 468 694 510 Q694 564 628 564 Q564 564 564 510Z" lash="M570 522 Q630 552 690 522" />
        {/* A broader smile: the corners of the mouth lift a little. */}
        <g className="anitka-smile">
          <path d="M434 650 Q440 664 454 667 M596 648 Q590 662 576 665" fill="none" stroke="#b9644f" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M452 668 Q515 690 578 665" fill="none" stroke="#c9735d" strokeWidth="3" strokeLinecap="round" />
        </g>
        {/* Lips moving for a moment while a card is "said": the opening grows and shrinks from the upper lip. */}
        <g className="anitka-talk">
          <g className="anitka-talk-open">
            <path d="M466 663 Q515 657 564 663 Q515 700 466 663Z" fill="#6e2626" />
            <path d="M466 663 Q515 700 564 663" fill="none" stroke="#c9735d" strokeWidth="3.5" strokeLinecap="round" />
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

export function AnitkaMascot({ mood = 'smile', talkMs = 2400, className = '' }: { mood?: GuideMood; talkMs?: number; className?: string }) {
  return (
    <div className={`anitka ${className}`} data-mood={mood} style={{ '--talk': `${talkMs}ms` } as CSSProperties} aria-hidden="true">
      <div className="anitka-body relative">
        {/* The raised arm stands behind the body (the hair hangs over it); only the greeting shows it. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- approved static brand asset */}
        <img src={WAVE_ARM} alt="" width={385} height={764} className="anitka-wave-arm absolute inset-0 size-full select-none" draggable={false} />
        <div className="anitka-wave-hand absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- approved static brand asset */}
          <img src={WAVE_HAND} alt="" width={385} height={764} className="size-full select-none" draggable={false} />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- approved static brand asset */}
        <img src={MASCOT_BODY} alt="" width={385} height={764} className="relative block w-full select-none" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element -- approved static brand asset */}
        <img src={ARM} alt="" width={385} height={764} className="anitka-arm-rest absolute inset-0 size-full select-none" draggable={false} />
        {/* The head: the body picture cut off at the neck, tilting around the neck. */}
        <div className="anitka-head absolute inset-0">
          <div className="anitka-speak absolute inset-0">
            <div className="anitka-react absolute inset-0" style={{ clipPath: 'inset(0 0 62.9% 0)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- approved static brand asset */}
              <img src={MASCOT_BODY} alt="" width={385} height={764} className="block w-full select-none" draggable={false} />
              <Face />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
