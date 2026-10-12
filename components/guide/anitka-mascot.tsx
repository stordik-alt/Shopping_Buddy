import type { GuideMood } from '@/lib/guide'

/** Anitka as a living character. The artwork is one painted picture, so her expressions are drawn over it:
 *  the picture is stacked twice, the upper copy cut off at the neck so only the head tilts and nods while the
 *  body stays put, and a thin SVG on the head adds the eyelids (blinking, a wink) and the mouth (a smile, and
 *  moving lips for a moment whenever a new card starts to "talk"). The motion lives in app/globals.css
 *  (`.anitka-*`); `mood` picks what she does when a card appears (`GuideMood` in lib/guide.ts). Everything
 *  is decorative (`aria-hidden`) and stops under "reduce motion". Coordinates are in the artwork's own
 *  pixels (380 × 678), so the drawing scales with the picture. The ANITKA lettering on her shirt is why the
 *  picture is never mirrored. */
const SRC = '/brand/anitka/anitka-mascot-full.webp'
const SKIN = '#e8ac88'
const SKIN_SHADE = '#dd9572'

/** An almond-shaped eyelid that covers one eye when it is closed, with the lash line at its lower edge. */
function Eyelid({ side, d, lash }: { side: 'l' | 'r'; d: string; lash: string }) {
  return (
    <g className={`anitka-lid anitka-lid-${side}`}>
      <path d={d} fill="url(#anitka-lid-fill)" />
      <path d={lash} fill="none" stroke="#4a2c20" strokeWidth="2.2" strokeLinecap="round" />
    </g>
  )
}

function Face() {
  return (
    <svg viewBox="0 0 380 678" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="anitka-lid-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={SKIN} />
          <stop offset="1" stopColor={SKIN_SHADE} />
        </linearGradient>
        <radialGradient id="anitka-mouth-patch" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.7" stopColor="#ebb391" />
          <stop offset="1" stopColor="#ebb391" stopOpacity="0" />
        </radialGradient>
      </defs>
      <Eyelid side="l" d="M56 186 Q81 164 106 186 Q106 212 81 212 Q56 212 56 186Z" lash="M60 197 Q82 208 104 194" />
      <Eyelid side="r" d="M147 186 Q179 163 213 188 Q213 213 180 213 Q147 213 147 186Z" lash="M152 198 Q180 209 209 195" />
      {/* A smile: the closed mouth is covered by a patch of skin and a curved pair of lips is drawn on it. */}
      <g className="anitka-smile">
        <ellipse cx="126" cy="268" rx="40" ry="15" fill="url(#anitka-mouth-patch)" />
        <path d="M91 259 Q126 301 161 257 Q126 278 91 259Z" fill="#cf6f5b" />
        <path d="M91 259 Q126 279 161 257" fill="none" stroke="#a9493d" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M88 254 Q93 262 97 264 M162 254 Q159 261 155 263" fill="none" stroke="#c98a6d" strokeWidth="1.4" strokeLinecap="round" />
      </g>
      {/* Lips moving for a moment while a new card appears, as if she were saying it. */}
      <g className="anitka-talk">
        <ellipse cx="126" cy="268" rx="40" ry="15" fill="url(#anitka-mouth-patch)" />
        <path d="M93 260 Q126 298 159 258 Q126 274 93 260Z" fill="#cf6f5b" />
        <g className="anitka-talk-open">
          <path d="M99 262 Q126 296 153 260 Q126 271 99 262Z" fill="#7b2d2a" />
        </g>
        <path d="M95 261 Q126 273 157 259" fill="none" stroke="#a9493d" strokeWidth="1.8" strokeLinecap="round" />
      </g>
    </svg>
  )
}

export function AnitkaMascot({ mood = 'smile', className = '' }: { mood?: GuideMood; className?: string }) {
  return (
    <div className={`anitka ${className}`} data-mood={mood} aria-hidden="true">
      <div className="anitka-body relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- approved static brand asset */}
        <img src={SRC} alt="" width={380} height={678} className="block w-full select-none" draggable={false} />
        {/* The head: the same picture cut off at the neck, tilting around the neck. */}
        <div className="anitka-head absolute inset-0">
          <div className="anitka-react absolute inset-0" style={{ clipPath: 'inset(0 0 49.5% 0)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- approved static brand asset */}
            <img src={SRC} alt="" width={380} height={678} className="block w-full select-none" draggable={false} />
            <Face />
          </div>
        </div>
      </div>
    </div>
  )
}
