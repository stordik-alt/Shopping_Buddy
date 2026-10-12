/** Anitka in full figure for the intro: she walks in from beyond the edge of the screen, steps to her place and
 *  stands there with her arms up. Painted layers on one canvas (468 × 809 px, from the owner's artwork with the
 *  background removed): the upper body with the hips, and the two legs with their shoes, which are lifted one
 *  after the other while she walks (the straight legs are built from the same denim as the guide's picture,
 *  because the artwork shows her in the air with her knees bent). The motion is in app/globals.css
 *  (`.anitka-intro-*`) and ends in the resting pose; under "reduce motion" she is simply standing there.
 *  Decorative: the card next to her says everything. */
const BASE = '/brand/anitka/'
const BODY = `${BASE}anitka-intro-body.webp`
const LEG_LEFT = `${BASE}anitka-intro-leg-left.webp`
const LEG_RIGHT = `${BASE}anitka-intro-leg-right.webp`

export function AnitkaIntroFigure({ className = '' }: { className?: string }) {
  return (
    <div className={`anitka-intro ${className}`} aria-hidden="true">
      <div className="anitka-intro-walk">
        <div className="anitka-intro-bob relative">
          {/* Legs stand behind the hips; each is lifted in turn while she walks. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- approved static brand asset */}
          <img src={LEG_LEFT} alt="" width={468} height={809} className="anitka-intro-leg anitka-intro-leg-l absolute inset-0 size-full select-none" draggable={false} fetchPriority="high" />
          {/* eslint-disable-next-line @next/next/no-img-element -- approved static brand asset */}
          <img src={LEG_RIGHT} alt="" width={468} height={809} className="anitka-intro-leg anitka-intro-leg-r absolute inset-0 size-full select-none" draggable={false} fetchPriority="high" />
          {/* eslint-disable-next-line @next/next/no-img-element -- approved static brand asset */}
          <img src={BODY} alt="" width={468} height={809} className="relative block h-auto w-full select-none" draggable={false} fetchPriority="high" />
        </div>
        {/* Where she stands: a soft shadow on the ground that walks with her. */}
        <div className="anitka-intro-shadow" />
      </div>
    </div>
  )
}
