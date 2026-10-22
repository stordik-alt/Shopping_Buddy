'use client'

import type { ReactNode } from 'react'

import { PRODUCT_VISUAL_TINTS, type ProductVisual } from '@/lib/product-visuals'
import { cn } from '@/lib/utils'

// The drawings behind lib/product-visuals.ts. One flat SVG per shape — two or three colours, no
// outlines, no emoji and no icon font — so a cell in the Zásoby grid says at a glance what the
// product is. The colours come from the tint, the geometry from the shape.
//
// The illustrations are decorative: the product's name is always written next to them, so they
// carry no accessible name of their own (aria-hidden) and never become the only way something is
// communicated. A photograph, when a product has one, replaces the drawing entirely.

type Colors = { primary: string; secondary: string; accent: string }

// Structural colours the drawings need regardless of the product's own colour: a label, a bone,
// a foil, a coffee surface, a leaf.
const LABEL = '#F4EFE4'
const BONE = '#F2E8D5'
const FOIL = '#C8CDD4'
const COFFEE = '#6B4423'
const LEAF = '#3F9A52'
const STEM = '#5E3A21'

const DRAWINGS: Record<ProductVisual['shape'], (c: Colors) => ReactNode> = {
  round: (c) => (
    <>
      <circle cx="32" cy="36" r="19" fill={c.primary} />
      <path d="M32 17c5-7 13-7 18-4-2 8-10 11-18 4z" fill={LEAF} />
      <rect x="31" y="9" width="3" height="10" rx="1.5" fill={STEM} />
    </>
  ),
  cabbage: (c) => (
    <>
      <path d="M32 12c8-5 17 0 19 8 7 4 7 15 1 20 0 9-9 15-17 12-7 5-17 2-20-6-8-4-9-14-4-20-1-9 8-16 16-14z" fill={c.primary} />
      <path d="M32 15c-5 7-7 18 0 34M32 24c-6-3-11-7-13-12M32 30c7-5 12-10 15-17M31 36c-7-2-13-2-19 1M33 39c6-2 12-2 18 1" fill="none" stroke={c.secondary} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  oval: (c) => (
    <>
      <ellipse cx="32" cy="34" rx="17" ry="21" fill={c.primary} />
      <ellipse cx="25" cy="25" rx="5" ry="7" fill={c.secondary} opacity="0.35" />
    </>
  ),
  pear: (c) => (
    <>
      <path d="M32 12c6 0 9 6 9 12 0 8 10 12 10 21 0 7-8 11-19 11s-19-4-19-11c0-9 10-13 10-21 0-6 3-12 9-12z" fill={c.primary} />
      <rect x="30.5" y="5" width="3" height="9" rx="1.5" fill={STEM} />
    </>
  ),
  tomato: (c) => (
    <>
      <circle cx="32" cy="35" r="19" fill={c.primary} />
      <path d="M32 15l5 5 8-2-3 8 4 6-9-1-5 5-5-5-9 1 4-6-3-8 8 2z" fill={LEAF} />
    </>
  ),
  pumpkin: (c) => (
    <>
      <path d="M32 17c-7-8-15-3-17 7-8 3-9 18-2 25 5 5 11 5 19 1 8 4 14 4 19-1 7-7 6-22-2-25-2-10-10-15-17-7z" fill={c.primary} />
      <path d="M32 18c-5 8-6 21 0 33M24 17c-4 9-5 21-2 34M40 17c4 9 5 21 2 34" fill="none" stroke={c.secondary} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M30 17c-1-6 1-10 5-12 3 5 2 9-2 13z" fill={LEAF} />
    </>
  ),
  pepper: (c) => (
    <>
      <path d="M32 20c8 0 14 6 14 16s-6 16-14 16-14-6-14-16 6-16 14-16z" fill={c.primary} />
      <path d="M20 26c-5 2-7 8-5 14 1 5 4 8 8 9-4-8-4-17-3-23z" fill={c.secondary} />
      <path d="M44 26c5 2 7 8 5 14-1 5-4 8-8 9 4-8 4-17 3-23z" fill={c.secondary} />
      <rect x="30" y="10" width="4" height="12" rx="2" fill={LEAF} />
    </>
  ),
  cluster: (c) => (
    <>
      <circle cx="32" cy="20" r="8" fill={c.primary} />
      <circle cx="22" cy="33" r="8" fill={c.primary} />
      <circle cx="42" cy="33" r="8" fill={c.primary} />
      <circle cx="27" cy="45" r="8" fill={c.primary} />
      <circle cx="39" cy="46" r="7" fill={c.secondary} />
      <path d="M32 12c4-5 10-6 14-4-1 6-7 8-14 4z" fill={LEAF} />
    </>
  ),
  cherry: (c) => (
    <>
      <circle cx="20" cy="42" r="11" fill={c.primary} />
      <circle cx="44" cy="44" r="9" fill={c.primary} />
      <path d="M20 32c2-12 8-18 18-22" stroke={STEM} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M44 35c1-10 3-16 8-20" stroke={STEM} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M36 12c6-5 13-4 16 0-4 5-11 5-16 0z" fill={LEAF} />
    </>
  ),
  leaf: (c) => (
    <>
      <path d="M32 8c14 4 20 16 20 28 0 12-9 20-20 20S12 48 12 36C12 24 18 12 32 8z" fill={c.primary} />
      <path d="M32 14v38" stroke={c.secondary} strokeWidth="3" strokeLinecap="round" />
      <path d="M32 26l-9-5M32 26l9-5M32 38l-11-5M32 38l11-5" stroke={c.secondary} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  sprig: (c) => (
    <>
      <path d="M32 58V26" stroke={STEM} strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="21" cy="24" rx="9" ry="5" fill={c.primary} transform="rotate(-28 21 24)" />
      <ellipse cx="43" cy="24" rx="9" ry="5" fill={c.primary} transform="rotate(28 43 24)" />
      <ellipse cx="18" cy="40" rx="8" ry="4.5" fill={c.secondary} transform="rotate(-28 18 40)" />
      <ellipse cx="46" cy="40" rx="8" ry="4.5" fill={c.secondary} transform="rotate(28 46 40)" />
    </>
  ),
  long: (c) => (
    <>
      <rect x="8" y="23" width="48" height="19" rx="9.5" fill={c.primary} />
      <circle cx="20" cy="27" r="2" fill={c.secondary} />
      <circle cx="32" cy="38" r="2" fill={c.secondary} />
      <circle cx="44" cy="27" r="2" fill={c.secondary} />
    </>
  ),
  'corn-cob': (c) => (
    <>
      <path d="M22 14c0-4 4-7 10-7s10 3 10 7v31c0 6-4 11-10 13-6-2-10-7-10-13z" fill={c.primary} />
      <path d="M22 17c-9 8-10 23-3 35 4-2 7-6 9-11M42 17c9 8 10 23 3 35-4-2-7-6-9-11" fill={LEAF} />
      <path d="M27 17v29M32 15v34M37 17v29M25 24h14M24 32h16M25 40h14" stroke={c.secondary} strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  bulb: (c) => (
    <>
      <path d="M32 14c11 5 15 13 15 22 0 8-6 14-15 14s-15-6-15-14c0-9 4-17 15-22z" fill={c.primary} />
      <path d="M32 14v36" stroke={c.secondary} strokeWidth="2.5" />
      <path d="M25 22c-3 6-4 12-3 18M39 22c3 6 4 12 3 18" stroke={c.secondary} strokeWidth="2" fill="none" />
      <path d="M32 14c-2-5 0-9 3-11 1 5 0 9-3 11z" fill={LEAF} />
    </>
  ),
  garlic: (c) => (
    <>
      <path d="M32 14c-3-6 0-10 4-12 3 5 1 9-4 12z" fill={LEAF} />
      <path d="M32 14c-11 3-18 12-17 24 1 10 8 16 17 17 9-1 16-7 17-17 1-12-6-21-17-24z" fill={c.primary} />
      <path d="M32 17c-7 8-8 21-5 36M32 17c7 8 8 21 5 36M20 28c4 5 5 13 4 20M44 28c-4 5-5 13-4 20" fill="none" stroke={c.secondary} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M25 52h14" stroke={c.secondary} strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  celeriac: (c) => (
    <>
      <path d="M32 21c-6-5-14-2-17 4-7 1-9 10-4 15-2 7 5 13 12 12 5 5 14 5 19 0 7 1 14-5 12-12 5-5 3-14-4-15-3-6-11-9-18-4z" fill={c.primary} />
      <path d="M32 21V9M27 19c-4-7-3-11 0-14M37 19c4-7 3-11 0-14" stroke={LEAF} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M20 46l-5 7M28 49l-1 7M38 49l1 7M46 46l5 7M18 32l-7-2M46 32l7-2" stroke={c.secondary} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  radish: (c) => (
    <>
      <path d="M27 23c-2-9-1-14 2-19 4 5 5 10 3 17 4-9 9-12 14-13-1 8-5 13-13 18" fill={LEAF} />
      <path d="M19 23c5-5 21-5 26 0 5 6 1 16-6 23-3 4-6 8-7 13-2-5-4-9-7-13-7-7-11-17-6-23z" fill={c.primary} />
      <path d="M32 46c-2 4-3 8-3 11 2-2 4-5 5-8" fill={LABEL} />
      <path d="M22 29c4 2 8 3 11 3M42 29c-3 2-6 3-9 3" stroke={c.secondary} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  mushroom: (c) => (
    <>
      <path d="M10 34c0-12 10-20 22-20s22 8 22 20c0 3-2 5-5 5H15c-3 0-5-2-5-5z" fill={c.primary} />
      <rect x="27" y="36" width="10" height="16" rx="4" fill={BONE} />
    </>
  ),
  blob: (c) => (
    <>
      <path d="M32 12c12 0 20 7 20 20 0 12-8 20-20 20S12 44 12 32c0-13 8-20 20-20z" fill={c.primary} />
      <circle cx="25" cy="26" r="2" fill={c.secondary} />
      <circle cx="39" cy="34" r="2" fill={c.secondary} />
      <circle cx="28" cy="42" r="1.6" fill={c.secondary} />
    </>
  ),
  cone: (c) => (
    <>
      <path d="M32 18l14 34H18z" fill={c.primary} />
      <path d="M32 18c6-6 12-7 16-5-2 7-9 10-16 5z" fill={LEAF} />
      <path d="M32 18c-6-6-12-7-16-5 2 7 9 10 16 5z" fill={LEAF} />
    </>
  ),
  crescent: (c) => (
    <>
      <path d="M46 12c2 14-6 30-22 38-5 3-9 2-10-2-1-4 3-6 8-9 12-6 18-16 20-28z" fill={c.primary} />
      <path d="M44 12c3 3 3 7 1 11-1-4-1-8-1-11z" fill={c.secondary} />
    </>
  ),
  bottle: (c) => (
    <>
      <rect x="27" y="6" width="10" height="9" rx="2" fill={c.secondary} />
      <path d="M29 15h6v6c6 2 9 7 9 13v16c0 4-3 7-7 7H27c-4 0-7-3-7-7V34c0-6 3-11 9-13z" fill={c.primary} />
      <rect x="22" y="34" width="20" height="12" rx="2" fill={LABEL} />
    </>
  ),
  can: (c) => (
    <>
      <rect x="17" y="14" width="30" height="40" rx="4" fill={c.primary} />
      <rect x="17" y="14" width="30" height="7" rx="3" fill={FOIL} />
      <rect x="17" y="28" width="30" height="9" fill={c.secondary} />
    </>
  ),
  jar: (c) => (
    <>
      <rect x="16" y="12" width="32" height="9" rx="3" fill={c.secondary} />
      <path d="M18 21h28v27c0 4-3 7-7 7H25c-4 0-7-3-7-7z" fill={c.primary} />
      <rect x="22" y="30" width="20" height="11" rx="2" fill={LABEL} />
    </>
  ),
  cup: (c) => (
    <>
      <rect x="15" y="14" width="34" height="8" rx="4" fill={c.secondary} />
      <path d="M18 22h28l-3 28c-.4 4-3 6-7 6H28c-4 0-6.6-2-7-6z" fill={c.primary} />
    </>
  ),
  mug: (c) => (
    <>
      <path d="M44 26h5c5 0 8 3 8 8s-3 8-8 8h-5" fill="none" stroke={c.secondary} strokeWidth="5" />
      <rect x="14" y="20" width="32" height="30" rx="6" fill={c.primary} />
      <ellipse cx="30" cy="22" rx="13" ry="4" fill={COFFEE} />
    </>
  ),
  glass: (c) => (
    <>
      <path d="M19 12h26l-3 38c-.3 3-2 5-5 5H27c-3 0-4.7-2-5-5z" fill={c.primary} opacity="0.85" />
      <path d="M21 30h22l-2 20c-.3 3-2 5-5 5H28c-3 0-4.7-2-5-5z" fill={c.secondary} />
    </>
  ),
  carton: (c) => (
    <>
      <path d="M20 26L32 10l12 16z" fill={c.secondary} />
      <rect x="20" y="26" width="24" height="30" rx="3" fill={c.primary} />
      <rect x="24" y="34" width="16" height="10" rx="2" fill={LABEL} />
    </>
  ),
  'tea-box': (c) => (
    <>
      <path d="M17 15l15-7 15 7v40H17z" fill={c.primary} />
      <path d="M32 8v47" stroke={c.secondary} strokeWidth="2" />
      <rect x="21" y="25" width="22" height="20" rx="3" fill={LABEL} />
      <path d="M32 40V30M32 35c-4-6-8-5-8-1 4 3 7 3 8 1zM32 33c4-6 8-5 8-1-4 3-7 3-8 1z" fill={c.accent} />
      <path d="M39 25l8-7" stroke={c.secondary} strokeWidth="1.5" />
      <path d="M45 15h7v6h-7z" fill={c.secondary} />
    </>
  ),
  packet: (c) => (
    <>
      <path d="M17 14h30l4 38c.3 3-2 5-5 5H18c-3 0-5.3-2-5-5z" fill={c.primary} />
      <rect x="17" y="14" width="30" height="7" rx="2" fill={c.secondary} />
      <ellipse cx="32" cy="36" rx="10" ry="12" fill={LABEL} />
    </>
  ),
  tub: (c) => (
    <>
      <rect x="12" y="18" width="40" height="10" rx="5" fill={c.secondary} />
      <path d="M15 28h34l-3 22c-.5 4-3 6-7 6H25c-4 0-6.5-2-7-6z" fill={c.primary} />
    </>
  ),
  tube: (c) => (
    <>
      <path d="M22 10h20l-3 30c-.5 7-4 10-7 10s-6.5-3-7-10z" fill={c.primary} />
      <rect x="26" y="48" width="12" height="8" rx="2" fill={c.secondary} />
    </>
  ),
  loaf: (c) => (
    <>
      <path d="M10 36c0-10 10-18 22-18s22 8 22 18v8c0 4-3 7-7 7H17c-4 0-7-3-7-7z" fill={c.primary} />
      <path d="M22 24l6 4M32 22l6 4M42 26l5 3" stroke={c.secondary} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  baguette: (c) => (
    <>
      <path d="M11 43c-3-3-2-8 2-12l18-18c4-4 9-5 12-2s2 8-2 12L23 41c-4 4-9 5-12 2z" fill={c.primary} />
      <path d="M23 25l5 5M31 17l5 5M15 33l5 5" stroke={c.secondary} strokeWidth="3" strokeLinecap="round" />
      <path d="M13 45l-4 4M43 13l4-4" stroke={c.secondary} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  roll: (c) => (
    <>
      <path d="M12 40c0-8 9-15 20-15s20 7 20 15c0 6-5 10-11 10H23c-6 0-11-4-11-10z" fill={c.primary} />
      <path d="M22 30c3 4 3 12 0 18M32 27c3 5 3 15 0 22M42 30c3 4 3 12 0 18" stroke={c.secondary} strokeWidth="2.5" fill="none" />
    </>
  ),
  pastry: (c) => (
    <>
      <path d="M12 43c-4-5-2-12 3-16l6-5 3-9 9 6 9-3 1 10 8 7c4 4 3 11-2 14-5 4-11 2-17-1-7 4-15 3-20-3z" fill={c.primary} />
      <path d="M20 27c3 5 5 11 5 18M30 21c4 7 6 15 6 24M40 22c-1 8 0 14 4 20" fill="none" stroke={c.secondary} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  'cake-slice': (c) => (
    <>
      <path d="M10 27l24-14 20 12-24 14z" fill={c.primary} />
      <path d="M10 27v18l20 12V39z" fill={c.secondary} />
      <path d="M30 39l24-14v18L30 57z" fill={c.primary} />
      <path d="M10 27l24-14 20 12-24 14z" fill={c.accent} opacity="0.7" />
      <circle cx="34" cy="20" r="2" fill={LABEL} />
    </>
  ),
  tortilla: (c) => (
    <>
      <ellipse cx="32" cy="38" rx="24" ry="12" fill={c.primary} />
      <ellipse cx="32" cy="30" rx="22" ry="11" fill={c.secondary} />
      <ellipse cx="32" cy="30" rx="15" ry="7" fill={c.primary} opacity="0.7" />
    </>
  ),
  wedge: (c) => (
    <>
      <path d="M10 48L46 16l8 32z" fill={c.primary} />
      <circle cx="30" cy="36" r="4" fill={c.secondary} />
      <circle cx="38" cy="30" r="2.5" fill={c.secondary} />
    </>
  ),
  drumstick: (c) => (
    <>
      <ellipse cx="38" cy="26" rx="16" ry="13" transform="rotate(-35 38 26)" fill={c.primary} />
      <rect x="18" y="38" width="20" height="6" rx="3" fill={BONE} transform="rotate(-35 28 41)" />
      <circle cx="17" cy="48" r="5" fill={BONE} />
      <circle cx="24" cy="54" r="4.5" fill={BONE} />
    </>
  ),
  'poultry-breast': (c) => (
    <>
      <path d="M32 13c-5 5-13 6-18 13-5 8-2 21 6 26 5 3 9 1 12-3 3 4 7 6 12 3 8-5 11-18 6-26-5-7-13-8-18-13z" fill={c.primary} />
      <path d="M32 20c-4 7-5 17 0 26M22 29c3 2 5 5 6 8M42 29c-3 2-5 5-6 8" fill="none" stroke={c.secondary} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  'poultry-wing': (c) => (
    <>
      <path d="M13 39c-2-7 2-14 9-17 5-2 10-1 14 2 8-1 14 4 15 11 1 6-3 11-9 12-8 2-12-3-17-2-6 2-10 0-12-6z" fill={c.primary} />
      <path d="M21 28c3 6 8 11 15 16M34 25c-1 7 3 13 9 17" fill="none" stroke={c.secondary} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="16" cy="38" r="3" fill={BONE} />
    </>
  ),
  'whole-poultry': (c) => (
    <>
      <path d="M32 15c-8 0-14 7-14 16 0 5 2 9 5 12-6 5-7 10-3 12 4 2 9-1 12-5 3 4 8 7 12 5 4-2 3-7-3-12 3-3 5-7 5-12 0-9-6-16-14-16z" fill={c.primary} />
      <path d="M18 27c-6-4-11-2-10 3 1 4 5 7 11 8M46 27c6-4 11-2 10 3-1 4-5 7-11 8" fill={c.primary} stroke={c.secondary} strokeWidth="3" strokeLinejoin="round" />
      <path d="M32 17c-2-4 0-7 3-8 3 4 1 7-3 8z" fill={c.secondary} />
    </>
  ),
  steak: (c) => (
    <>
      <path d="M12 31c3-10 13-16 24-15 10 1 17 5 17 13 0 4-3 6-2 10 1 6-5 12-14 13-12 2-23-3-26-10-2-4 0-7 1-11z" fill={c.primary} />
      <path d="M23 25c4 2 6 5 7 9M38 21c-4 5-5 10-4 14M22 42c5-3 11-3 16 0" fill="none" stroke={c.secondary} strokeWidth="3" strokeLinecap="round" />
      <path d="M42 31c2-2 5-1 6 1s0 4-2 5-5 1-6-1 0-4 2-5z" fill={LABEL} />
    </>
  ),
  ribs: (c) => (
    <>
      <path d="M13 18c4-4 8 0 12 0s8-4 12 0 8 0 14 2v25c-6 2-10-2-14 2s-8-1-12 0-8 4-12 0z" fill={c.primary} />
      <path d="M21 20v25M31 20v25M41 20v25" stroke={BONE} strokeWidth="5" strokeLinecap="round" />
      <path d="M21 20v25M31 20v25M41 20v25" stroke={c.secondary} strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  mince: (c) => (
    <>
      <path d="M11 43c2-7 7-10 12-11 1-8 8-12 15-8 7-2 14 3 13 10 5 4 4 11-1 14H16c-4 0-7-2-5-5z" fill={c.primary} />
      <path d="M19 39c4-5 8-4 11-8M30 43c4-7 10-8 15-9M23 47c6-2 11-2 17 0" fill="none" stroke={c.secondary} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="20" cy="34" r="1.5" fill={LABEL} />
      <circle cx="39" cy="37" r="1.5" fill={LABEL} />
    </>
  ),
  bone: (c) => (
    <>
      <path d="M18 13c-4-4-11 2-7 7-5 5 1 12 6 8l22 22c-4 5 3 11 8 6 5 4 11-3 7-8 4-5-3-11-8-7L24 19c3-5-1-9-6-6z" fill={BONE} stroke={c.secondary} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M20 23l21 21" stroke={c.secondary} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
    </>
  ),
  cut: (c) => (
    <>
      <path d="M10 24c0-4 4-7 10-7h28c4 0 6 3 6 7v18c0 4-2 7-6 7H20c-6 0-10-3-10-7z" fill={c.primary} />
      <path d="M14 30c10 4 30 4 40 0v6c-10 4-30 4-40 0z" fill={LABEL} />
    </>
  ),
  tray: (c) => (
    <>
      <rect x="10" y="20" width="44" height="30" rx="6" fill={LABEL} />
      <path d="M16 34c4-9 28-9 32 0 1 3 0 6-2 6H18c-2 0-3-3-2-6z" fill={c.primary} />
    </>
  ),
  slices: (c) => (
    <>
      <circle cx="22" cy="36" r="14" fill={c.primary} />
      <circle cx="22" cy="36" r="9" fill={c.secondary} />
      <circle cx="42" cy="30" r="12" fill={c.primary} />
      <circle cx="42" cy="30" r="7.5" fill={c.secondary} />
    </>
  ),
  stripes: (c) => (
    <>
      <path d="M8 22c10-6 18 4 28-2s14 2 20-2" stroke={c.primary} strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d="M8 38c10-6 18 4 28-2s14 2 20-2" stroke={c.primary} strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d="M8 22c10-6 18 4 28-2s14 2 20-2" stroke={c.secondary} strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  ),
  sausage: (c) => (
    <>
      <rect x="8" y="24" width="48" height="16" rx="8" fill={c.primary} />
      <path d="M18 24v16M46 24v16" stroke={c.secondary} strokeWidth="3" />
    </>
  ),
  fish: (c) => (
    <>
      <path d="M14 32c8-13 30-13 38 0-8 13-30 13-38 0z" fill={c.primary} />
      <path d="M52 32l10-8v16z" fill={c.secondary} />
      <circle cx="24" cy="29" r="2.5" fill={LABEL} />
    </>
  ),
  seafood: (c) => (
    <>
      <path d="M14 43c-4-6-2-15 5-21 8-7 21-6 28 2 6 7 4 18-4 24-7 5-18 5-25-1l-8 5 4-9z" fill={c.primary} />
      <path d="M22 27c-4 5-4 12 0 17M30 23c-4 7-4 15 0 23M38 25c-4 6-4 13 0 20" fill="none" stroke={c.secondary} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="43" cy="33" r="2" fill={LABEL} />
      <path d="M18 45c-4 4-9 4-13 1 2-4 7-6 12-5" fill={c.accent} />
    </>
  ),
  egg: (c) => (
    <>
      <ellipse cx="32" cy="36" rx="17" ry="21" fill={BONE} />
      <circle cx="32" cy="36" r="9" fill={c.primary} />
    </>
  ),
  block: (c) => (
    <>
      <rect x="12" y="18" width="40" height="30" rx="5" fill={c.primary} />
      <rect x="12" y="30" width="40" height="7" fill={c.secondary} opacity="0.6" />
    </>
  ),
  spray: (c) => (
    <>
      <path d="M20 26h20v24c0 4-2 6-6 6H26c-4 0-6-2-6-6z" fill={c.primary} />
      <path d="M40 20h10v8H40z" fill={c.secondary} />
      <path d="M44 12h6v10h-6z" fill={c.secondary} />
    </>
  ),
  umbrella: (c) => (
    <>
      <path d="M8 32c2-12 12-20 24-20s22 8 24 20c-5-4-9-4-14 0-6-4-14-4-20 0-5-4-9-4-14 0z" fill={c.primary} />
      <path d="M32 13v34c0 6 4 9 8 7 2-1 3-3 3-5" fill="none" stroke={c.secondary} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M18 24c4 1 7 3 10 7M46 24c-4 1-7 3-10 7" fill="none" stroke={c.secondary} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  blister: (c) => (
    <>
      <rect x="10" y="20" width="44" height="26" rx="5" fill={FOIL} />
      <circle cx="22" cy="33" r="7" fill={c.primary} />
      <circle cx="42" cy="33" r="7" fill={c.primary} />
    </>
  ),
  box: (c) => (
    <>
      <rect x="10" y="18" width="44" height="34" rx="5" fill={c.primary} />
      <rect x="18" y="26" width="28" height="16" rx="3" fill={LABEL} />
    </>
  ),
  sheet: (c) => (
    <>
      <rect x="8" y="18" width="34" height="32" rx="4" fill={c.primary} />
      <circle cx="42" cy="34" r="16" fill={c.secondary} />
      <circle cx="42" cy="34" r="5" fill={LABEL} />
    </>
  ),
  basket: (c) => (
    <>
      <path d="M12 24h40l-4 26c-.4 3-3 5-6 5H22c-3 0-5.6-2-6-5z" fill={c.primary} />
      <path d="M24 24a8 8 0 0116 0" fill="none" stroke={c.secondary} strokeWidth="4" />
      <path d="M24 34h16M25 44h14" stroke={c.secondary} strokeWidth="2.5" />
    </>
  ),
  bowl: (c) => (
    <>
      <path d="M10 26h44c0 14-10 24-22 24S10 40 10 26z" fill={c.primary} />
      <ellipse cx="32" cy="26" rx="22" ry="7" fill={c.secondary} />
    </>
  ),
  nest: (c) => (
    <>
      <ellipse cx="32" cy="38" rx="22" ry="14" fill={c.primary} />
      <path d="M18 32c8 8 20 8 28 0M16 40c9 7 23 7 32 0" stroke={c.secondary} strokeWidth="2.5" fill="none" />
    </>
  ),
  bar: (c) => (
    <>
      <rect x="10" y="22" width="44" height="22" rx="4" fill={c.primary} />
      <path d="M22 22v22M42 22v22" stroke={c.secondary} strokeWidth="3" />
    </>
  ),
  cookie: (c) => (
    <>
      <circle cx="32" cy="34" r="20" fill={c.primary} />
      <circle cx="25" cy="28" r="3" fill={c.secondary} />
      <circle cx="39" cy="30" r="3" fill={c.secondary} />
      <circle cx="31" cy="41" r="3" fill={c.secondary} />
    </>
  ),
  glasses: (c) => (
    <>
      <circle cx="19" cy="34" r="11" fill="none" stroke={c.primary} strokeWidth="4" />
      <circle cx="45" cy="34" r="11" fill="none" stroke={c.primary} strokeWidth="4" />
      <path d="M30 32h4" stroke={c.primary} strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  brush: (c) => (
    <>
      <rect x="29" y="10" width="6" height="30" rx="3" fill={c.secondary} />
      <path d="M20 38h24v6c0 8-6 12-12 12s-12-4-12-12z" fill={c.primary} />
    </>
  ),
  candle: (c) => (
    <>
      <rect x="26" y="22" width="12" height="32" rx="3" fill={c.primary} />
      <path d="M32 8c5 6 5 10 0 14-5-4-5-8 0-14z" fill={c.accent} />
      <rect x="30" y="20" width="4" height="5" fill={c.secondary} />
    </>
  ),
  battery: (c) => (
    <>
      <rect x="22" y="16" width="20" height="38" rx="3" fill={c.primary} />
      <rect x="27" y="9" width="10" height="8" rx="2" fill={c.secondary} />
      <rect x="26" y="30" width="12" height="18" rx="2" fill={c.secondary} opacity="0.5" />
    </>
  ),
  'coffee-capsule': (c) => (
    <>
      <path d="M16 30h32v18c0 4-3 7-7 7H23c-4 0-7-3-7-7z" fill={c.primary} />
      <ellipse cx="32" cy="30" rx="16" ry="6" fill={c.secondary} />
      <path d="M22 26c4-6 16-6 20 0" fill="none" stroke={LABEL} strokeWidth="3" />
    </>
  ),
  headphones: (c) => (
    <>
      <path d="M14 38V32a18 18 0 0136 0v6" fill="none" stroke={c.primary} strokeWidth="5" />
      <rect x="10" y="36" width="11" height="17" rx="5" fill={c.secondary} />
      <rect x="43" y="36" width="11" height="17" rx="5" fill={c.secondary} />
    </>
  ),
  cable: (c) => (
    <>
      <path d="M14 18h12v14H14z" fill={c.secondary} />
      <path d="M38 32h12v14H38z" fill={c.secondary} />
      <path d="M26 25h6a6 6 0 016 6v1" fill="none" stroke={c.primary} strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  'cat-bowl': (c) => (
    <>
      <path d="M20 20l-2-12 12 8M44 20l2-12-12 8" fill={c.primary} />
      <path d="M20 13l4 6M44 13l-4 6" stroke={c.secondary} strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="24" r="13" fill={c.primary} />
      <path d="M12 39h40c-1 11-9 17-20 17s-19-6-20-17z" fill={c.primary} />
      <path d="M26 23h1M37 23h1M29 29l3 2 3-2M24 28l-6-1M24 31l-6 1M40 28l6-1M40 31l6 1" fill="none" stroke={c.secondary} strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="32" cy="39" rx="19" ry="4" fill={c.secondary} />
    </>
  ),
  'dog-bowl': (c) => (
    <>
      <path d="M19 17c-8-7-14-3-12 6 1 6 6 10 13 9M45 17c8-7 14-3 12 6-1 6-6 10-13 9" fill={c.primary} />
      <ellipse cx="32" cy="23" rx="14" ry="13" fill={c.primary} />
      <ellipse cx="32" cy="29" rx="8" ry="6" fill={c.secondary} />
      <circle cx="27" cy="22" r="1.5" fill={LABEL} />
      <circle cx="37" cy="22" r="1.5" fill={LABEL} />
      <path d="M12 39h40c-1 11-9 17-20 17s-19-6-20-17z" fill={c.primary} />
      <ellipse cx="32" cy="39" rx="19" ry="4" fill={c.secondary} />
    </>
  ),
  'bottle-nipple': (c) => (
    <>
      <path d="M25 13c0-6 3-9 7-9s7 3 7 9v4c0 3 3 5 5 8 2 3 2 8 1 12H19c-1-4-1-9 1-12 2-3 5-5 5-8z" fill={c.primary} />
      <path d="M20 37h24v7H20zM23 48h18v5H23z" fill={c.secondary} />
      <path d="M28 15h8M24 29h16" stroke={LABEL} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  pacifier: (c) => (
    <>
      <path d="M25 31c0-8 3-14 7-14s7 6 7 14v5H25z" fill={c.primary} />
      <path d="M15 35c6-4 28-4 34 0l-3 9c-7 4-21 4-28 0z" fill={c.secondary} />
      <path d="M25 44c0 8 4 13 7 13s7-5 7-13" fill="none" stroke={c.primary} strokeWidth="4" strokeLinecap="round" />
      <circle cx="21" cy="39" r="1.5" fill={LABEL} />
      <circle cx="43" cy="39" r="1.5" fill={LABEL} />
    </>
  ),
  'baby-bib': (c) => (
    <>
      <path d="M23 10c0 8-4 12-9 17l5 27c1 4 4 6 8 6h10c4 0 7-2 8-6l5-27c-5-5-9-9-9-17h-7c0 5-2 7-5 7s-5-2-5-7z" fill={c.primary} />
      <path d="M27 18c1 3 3 5 5 5s4-2 5-5M20 43h24v8H20z" fill={c.secondary} opacity="0.75" />
      <circle cx="21" cy="30" r="1.5" fill={LABEL} />
      <circle cx="43" cy="30" r="1.5" fill={LABEL} />
    </>
  ),
  'changing-pad': (c) => (
    <>
      <path d="M14 20c0-4 3-7 7-7h23c4 0 7 3 7 7v25c0 4-3 7-7 7H21c-4 0-7-3-7-7z" fill={c.primary} />
      <path d="M20 19h25v27H20zM26 19v27M39 19v27" fill="none" stroke={c.secondary} strokeWidth="2.5" />
      <path d="M43 13v9h8" fill="none" stroke={LABEL} strokeWidth="3" strokeLinejoin="round" />
    </>
  ),
  'makeup-set': (c) => (
    <>
      <path d="M13 26h18v27H13z" fill={c.primary} />
      <path d="M13 26h18v7H13zM18 19h8v7h-8z" fill={c.secondary} />
      <path d="M37 17h14v36H37z" fill={c.primary} />
      <path d="M37 17h14v7H37zM40 10h8v7h-8z" fill={c.secondary} />
      <path d="M40 34h8v11h-8z" fill={LABEL} opacity="0.8" />
    </>
  ),
  'perfume-bottle': (c) => (
    <>
      <rect x="27" y="8" width="10" height="8" rx="2" fill={c.secondary} />
      <rect x="29" y="4" width="6" height="5" rx="1" fill={c.secondary} />
      <path d="M25 16h14l3 7 7 6v21c0 4-3 7-7 7H22c-4 0-7-3-7-7V29l7-6z" fill={c.primary} />
      <rect x="22" y="32" width="20" height="12" rx="3" fill={LABEL} />
      <path d="M32 19v5" stroke={c.secondary} strokeWidth="2" />
    </>
  ),
  diaper: (c) => (
    <>
      <path d="M15 17h34l-3 27c-1 8-7 12-14 14-7-2-13-6-14-14z" fill={c.primary} />
      <path d="M15 17h34v9H15z" fill={c.secondary} />
      <path d="M20 29c4 5 8 8 12 8s8-3 12-8M21 43c3 4 7 6 11 7 4-1 8-3 11-7" fill="none" stroke={LABEL} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M15 20l-6 4 7 7M49 20l6 4-7 7" fill="none" stroke={c.secondary} strokeWidth="3" strokeLinejoin="round" />
    </>
  ),
  'hygiene-pad': (c) => (
    <>
      <path d="M26 10c-4 8-7 16-7 26 0 10 5 17 13 23 8-6 13-13 13-23 0-10-3-18-7-26-3 4-9 4-12 0z" fill={c.primary} />
      <path d="M25 18c-5-2-10 1-10 6 0 4 3 7 8 7M39 18c5-2 10 1 10 6 0 4-3 7-8 7" fill={c.primary} stroke={c.secondary} strokeWidth="2.5" />
      <path d="M32 18v32M27 27c2 2 3 5 3 8M37 27c-2 2-3 5-3 8" fill="none" stroke={c.secondary} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'feminine-care': (c) => (
    <>
      <path d="M16 13c-3 7-5 14-5 23 0 9 4 16 11 21 7-5 11-12 11-21 0-9-2-16-5-23-3 3-9 3-12 0z" fill={c.primary} />
      <path d="M17 20c-4-2-8 1-8 5 0 3 2 5 6 6M27 20c4-2 8 1 8 5 0 3-2 5-6 6" fill={c.primary} stroke={c.secondary} strokeWidth="2" />
      <rect x="42" y="17" width="10" height="35" rx="5" fill={c.secondary} />
      <path d="M47 52v5M45 57h4" stroke={c.secondary} strokeWidth="2" strokeLinecap="round" />
      <path d="M47 21v23" stroke={LABEL} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  glove: (c) => (
    <>
      <path d="M21 52c-2-4-5-11-7-17-2-5 4-8 7-3l4 7-2-23c0-5 7-5 7 0l1 15V12c0-5 7-5 7 0v19V15c0-5 7-5 7 0v18l1-13c1-5 8-4 7 2l-2 24c-1 9-7 14-15 14h-4c-5 0-9-3-11-8z" fill={c.primary} />
      <path d="M18 48h31M25 23l1 14M32 27v10M39 27v10M46 30v8" fill="none" stroke={c.secondary} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  socks: (c) => (
    <>
      <path d="M17 10h13v25c0 4 4 6 10 8l-1 10H15v-7c0-4 2-8 2-12z" fill={c.primary} />
      <path d="M34 10h13v23c0 4 3 7 7 10l-3 10H30v-6c0-4 2-8 4-11z" fill={c.secondary} />
      <path d="M17 18h13M34 18h13" stroke={LABEL} strokeWidth="2.5" />
    </>
  ),
  hosiery: (c) => (
    <>
      <path d="M20 11h24v12l-5 30H29l3-24H18l-2-18z" fill={c.primary} />
      <path d="M20 11h24v8H20z" fill={c.secondary} />
      <path d="M20 23h13M33 23l-4 29M40 23l-3 29" fill="none" stroke={c.secondary} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  underwear: (c) => (
    <>
      <path d="M13 17h38l-4 35c-7 2-12-2-15-10-3 8-8 12-15 10z" fill={c.primary} />
      <path d="M13 17h38v8H13z" fill={c.secondary} />
      <path d="M18 29l7 4M46 29l-7 4M32 27v13" stroke={LABEL} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  leggings: (c) => (
    <>
      <path d="M18 10h28l-2 18-4 28H28l1-24h-2l1 24H16l4-28z" fill={c.primary} />
      <path d="M18 10h28v8H18z" fill={c.secondary} />
      <path d="M32 19v12" stroke={c.secondary} strokeWidth="2" />
    </>
  ),
}

/** The picture of a product: its photograph when it has one, its illustration otherwise. */
export function ProductVisual({
  visual,
  imageUrl,
  className,
  alt,
}: {
  visual: ProductVisual
  /** A product photograph, when one exists; the illustration is the fallback. */
  imageUrl?: string | null
  className?: string
  /** The accessible name, when the picture carries meaning on its own. */
  alt?: string
}) {
  if (imageUrl) {
    return <img src={imageUrl} alt={alt ?? ''} loading="lazy" decoding="async" className={cn('size-full object-contain', className)} />
  }

  const colors = PRODUCT_VISUAL_TINTS[visual.tint]
  return (
    <svg viewBox="0 0 64 64" className={cn('size-full', className)} role={alt ? 'img' : undefined} aria-label={alt} aria-hidden={alt ? undefined : true}>
      {/* A soft shadow the product stands on — it grounds the drawing and keeps a pale product
          (a milk bottle) from floating away on a pale card. */}
      <ellipse cx="32" cy="57" rx="18" ry="3.5" fill="#0B1220" opacity="0.08" />
      {DRAWINGS[visual.shape](colors)}
    </svg>
  )
}
