import styles from './buddy-scene.module.css'

// The intro's short animation: Buddy hops in, a shopping cart rolls up to his hand, coins and a
// banknote drop into it and he waves. Drawn as inline SVG so it needs no image download and stays
// sharp at any size. Timing lives in buddy-scene.module.css; every element's natural position is
// its final one, so with reduced motion (animations off) the finished scene is shown as-is.
//
// Each animated <g> carries only a CSS class: a CSS transform on an SVG element replaces its
// `transform` attribute, so static placement (rotations) sits on an inner element instead.
export function BuddyScene() {
  return (
    <svg className={styles.scene} viewBox="0 0 360 300" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="buddy-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#63eb2e" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#63eb2e" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="180" cy="210" rx="170" ry="120" fill="url(#buddy-glow)" />
      <ellipse className={styles.shadowBuddy} cx="120" cy="280" rx="44" ry="7" fill="#000" opacity="0.35" />
      <ellipse className={styles.shadowCart} cx="278" cy="280" rx="62" ry="7" fill="#000" opacity="0.35" />

      {/* Shopping cart: groceries, then the money, then the basket drawn over their lower part. */}
      <g className={styles.cart}>
        <g>
          <rect x="238" y="170" width="24" height="38" rx="3" fill="#f4f8fc" />
          <path d="M238 172 L250 160 L262 172 Z" fill="#dbe7f3" />
          <rect x="238" y="184" width="24" height="10" fill="#5ab0ff" />
          <rect x="274" y="160" width="12" height="50" rx="6" fill="#e0a458" transform="rotate(16 280 185)" />
          <circle cx="310" cy="194" r="13" fill="#ff5a5f" />
          <path d="M310 181 q5 -7 11 -6 q-3 7 -11 6 Z" fill="#63eb2e" />
        </g>

        <g className={styles.coin1}>
          <Coin cx={262} cy={204} />
        </g>
        <g className={styles.coin2}>
          <Coin cx={292} cy={200} />
        </g>
        <g className={styles.coin3}>
          <Coin cx={320} cy={206} />
        </g>
        <g className={styles.note}>
          <g transform="rotate(-10 286 190)">
            <rect x="263" y="178" width="48" height="24" rx="4" fill="#9be37a" stroke="#3bcf31" strokeWidth="2" />
            <circle cx="275" cy="190" r="6" fill="none" stroke="#2c8f22" strokeWidth="1.5" />
            <text x="298" y="194" textAnchor="middle" fontSize="11" fontWeight="800" fill="#1d6b16">
              100
            </text>
          </g>
        </g>

        <path d="M196 197 L214 197 L226 208" fill="none" stroke="#9fb6cc" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M220 206 L338 206 L324 262 L234 262 Z" fill="rgba(99,235,46,0.16)" stroke="#63eb2e" strokeWidth="4" strokeLinejoin="round" />
        <g stroke="#63eb2e" strokeWidth="2" opacity="0.55">
          <line x1="226" y1="234" x2="331" y2="234" />
          <line x1="258" y1="206" x2="262" y2="262" />
          <line x1="288" y1="206" x2="288" y2="262" />
          <line x1="318" y1="206" x2="312" y2="262" />
        </g>
        <g className={styles.wheel}>
          <circle cx="246" cy="272" r="9" fill="#0b2a45" stroke="#63eb2e" strokeWidth="3" />
          <line x1="246" y1="265" x2="246" y2="279" stroke="#63eb2e" strokeWidth="2" />
        </g>
        <g className={styles.wheel}>
          <circle cx="314" cy="272" r="9" fill="#0b2a45" stroke="#63eb2e" strokeWidth="3" />
          <line x1="314" y1="265" x2="314" y2="279" stroke="#63eb2e" strokeWidth="2" />
        </g>
      </g>

      <g className={styles.sparkles} fill="#fff7c2">
        <Sparkle x={250} y={150} size={7} />
        <Sparkle x={330} y={164} size={5} />
        <Sparkle x={300} y={140} size={4} />
      </g>

      {/* Buddy */}
      <g className={styles.buddy}>
        <g className={styles.buddyFloat}>
          <rect x="100" y="236" width="14" height="34" rx="7" fill="#b8cde0" />
          <rect x="126" y="236" width="14" height="34" rx="7" fill="#b8cde0" />
          <rect x="93" y="262" width="26" height="12" rx="6" fill="#63eb2e" />
          <rect x="121" y="262" width="26" height="12" rx="6" fill="#63eb2e" />

          <g className={styles.wave}>
            <line x1="86" y1="178" x2="60" y2="148" stroke="#d3e3f2" strokeWidth="14" strokeLinecap="round" />
            <circle cx="57" cy="143" r="10" fill="#f2f7fc" />
          </g>
          <line x1="154" y1="186" x2="188" y2="197" stroke="#d3e3f2" strokeWidth="14" strokeLinecap="round" />
          <circle cx="194" cy="197" r="10" fill="#f2f7fc" />

          <rect x="82" y="160" width="76" height="82" rx="24" fill="#e6f0fa" />
          <rect x="96" y="178" width="48" height="40" rx="12" fill="#0b2a45" />
          <circle className={styles.chestLight} cx="120" cy="198" r="9" fill="#63eb2e" />

          <rect x="112" y="148" width="16" height="14" fill="#b8cde0" />
          <rect x="72" y="64" width="96" height="86" rx="28" fill="#f2f7fc" />
          <rect x="64" y="94" width="10" height="26" rx="5" fill="#63eb2e" />
          <rect x="166" y="94" width="10" height="26" rx="5" fill="#63eb2e" />
          <rect x="84" y="86" width="72" height="46" rx="18" fill="#0b2a45" />
          <g className={styles.eyes}>
            <ellipse cx="106" cy="106" rx="7" ry="9" fill="#63eb2e" />
            <ellipse cx="134" cy="106" rx="7" ry="9" fill="#63eb2e" />
          </g>
          <path d="M110 120 Q120 127 130 120" fill="none" stroke="#63eb2e" strokeWidth="3" strokeLinecap="round" />

          {/* Cap, peak towards the cart. */}
          <path d="M76 80 Q78 44 120 44 Q162 44 164 80 Z" fill="#3bcf31" />
          <rect x="150" y="72" width="36" height="10" rx="5" fill="#2fae27" />
          <rect x="76" y="76" width="88" height="6" rx="3" fill="#2fae27" />
          <text x="120" y="70" textAnchor="middle" fontSize="18" fontWeight="800" fill="#021323">
            B
          </text>
        </g>
      </g>
    </svg>
  )
}

function Coin({ cx, cy }: { cx: number; cy: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r="11" fill="#f7c948" stroke="#d99a1c" strokeWidth="3" />
      <text x={cx} y={cy + 3} textAnchor="middle" fontSize="8" fontWeight="800" fill="#8a5a00">
        Kč
      </text>
    </>
  )
}

/** A four-pointed star centred on (x, y). */
function Sparkle({ x, y, size }: { x: number; y: number; size: number }) {
  const s = size
  return <path d={`M${x} ${y - s} L${x + s * 0.3} ${y - s * 0.3} L${x + s} ${y} L${x + s * 0.3} ${y + s * 0.3} L${x} ${y + s} L${x - s * 0.3} ${y + s * 0.3} L${x - s} ${y} L${x - s * 0.3} ${y - s * 0.3} Z`} />
}
