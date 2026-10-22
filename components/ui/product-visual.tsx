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
  bagel: (c) => (
    <>
      <ellipse cx="26" cy="36" rx="17" ry="13" fill={c.primary} />
      <ellipse cx="26" cy="36" rx="6" ry="4" fill={LABEL} />
      <ellipse cx="42" cy="27" rx="13" ry="10" fill={c.secondary} />
      <ellipse cx="42" cy="27" rx="4.5" ry="3" fill={LABEL} />
      <circle cx="18" cy="31" r="1.4" fill={LABEL} />
      <circle cx="31" cy="41" r="1.4" fill={LABEL} />
      <circle cx="40" cy="23" r="1.2" fill={LABEL} />
    </>
  ),
  roll: (c) => (
    <>
      <path d="M12 40c0-8 9-15 20-15s20 7 20 15c0 6-5 10-11 10H23c-6 0-11-4-11-10z" fill={c.primary} />
      <path d="M22 30c3 4 3 12 0 18M32 27c3 5 3 15 0 22M42 30c3 4 3 12 0 18" stroke={c.secondary} strokeWidth="2.5" fill="none" />
    </>
  ),
  sandwich: (c) => (
    <>
      <path d="M10 27l22-15 22 15v23H10z" fill={c.primary} />
      <path d="M14 29l18-12 18 12v5H14z" fill={c.secondary} />
      <path d="M14 34h36v5H14z" fill={LEAF} />
      <path d="M14 39h36v5l-4 5H18l-4-5z" fill={c.primary} />
      <path d="M14 29l18-12 18 12" fill="none" stroke={LABEL} strokeWidth="2" strokeLinejoin="round" />
    </>
  ),
  'rice-cake': (c) => (
    <>
      <ellipse cx="32" cy="42" rx="21" ry="9" fill={c.secondary} />
      <ellipse cx="32" cy="36" rx="21" ry="9" fill={c.primary} />
      <ellipse cx="32" cy="29" rx="21" ry="9" fill={c.primary} />
      <circle cx="22" cy="27" r="2" fill={LABEL} />
      <circle cx="34" cy="24" r="2.2" fill={LABEL} />
      <circle cx="42" cy="30" r="1.8" fill={LABEL} />
      <circle cx="27" cy="34" r="1.7" fill={LABEL} />
      <circle cx="38" cy="37" r="2" fill={LABEL} />
      <circle cx="20" cy="40" r="1.5" fill={LABEL} />
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
  'cheese-strings': (c) => (
    <>
      <path d="M13 20c5 8 8 16 5 29M24 15c5 10 8 20 5 36M35 13c5 11 8 23 5 39M46 17c4 9 6 18 4 29" fill="none" stroke={c.primary} strokeWidth="7" strokeLinecap="round" />
      <path d="M13 20c5 8 8 16 5 29M24 15c5 10 8 20 5 36M35 13c5 11 8 23 5 39M46 17c4 9 6 18 4 29" fill="none" stroke={c.secondary} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M15 49c8 4 24 5 34 0" fill="none" stroke={LABEL} strokeWidth="2.5" strokeLinecap="round" />
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
  'pork-chop': (c) => (
    <>
      <path d="M17 24c5-8 16-12 26-7 8 4 12 12 9 21-3 10-14 16-25 13-10-2-16-12-13-21z" fill={c.primary} />
      <path d="M24 28c4-4 12-6 18-2M23 41c5 4 12 5 18 2" fill="none" stroke={c.secondary} strokeWidth="3" strokeLinecap="round" />
      <path d="M15 34l-7-5c-4-3-8 2-5 6l4 5c-2 4 3 8 6 5l5-5z" fill={BONE} stroke={c.secondary} strokeWidth="2" strokeLinejoin="round" />
    </>
  ),
  tenderloin: (c) => (
    <>
      <path d="M11 42c4-5 5-13 10-20 5-7 14-10 21-6 7 4 9 13 6 21-3 8-10 14-19 15-7 1-14-2-18-6z" fill={c.primary} />
      <path d="M18 39c8-7 10-17 18-20M28 47c8-2 14-7 17-14" fill="none" stroke={c.secondary} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M17 29c3 1 5 3 7 6" stroke={LABEL} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'roast-joint': (c) => (
    <>
      <path d="M12 30c2-8 10-13 20-13h14c5 0 8 4 7 9l-3 18c-1 6-5 9-11 9H23c-8 0-13-7-11-15z" fill={c.primary} />
      <path d="M22 20l4 32M34 17l3 36M46 20l-1 30" stroke={c.secondary} strokeWidth="2.5" opacity="0.85" />
      <path d="M16 28c10 4 28 4 36 0M14 43c11-4 25-4 37 0" fill="none" stroke={LABEL} strokeWidth="2" strokeLinecap="round" />
      <path d="M20 14c5 5 5 9 2 12M39 13c5 5 6 9 3 12M29 49c-2 5 0 8 4 10" fill="none" stroke={c.secondary} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'meat-cubes': (c) => (
    <>
      <path d="M12 30l12-7 11 6-12 8z" fill={c.secondary} />
      <path d="M12 30v13l11 7V37z" fill={c.primary} />
      <path d="M23 37l12-8v13l-12 8z" fill={c.primary} />
      <path d="M31 20l10-6 11 6-11 7z" fill={c.primary} />
      <path d="M31 20v12l10 6V27z" fill={c.secondary} />
      <path d="M41 27l11-7v13l-11 5z" fill={c.primary} />
      <path d="M20 31l3 2M39 22l3 2" stroke={LABEL} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'soup-cuts': (c) => (
    <>
      <path d="M11 29c3-8 13-11 20-6 5 4 5 12 0 17-6 6-17 5-21-1-2-3-1-7 1-10z" fill={c.primary} />
      <path d="M34 39c-4-6-2-14 4-18 6-4 13 0 13 7 0 5-4 9-9 11l8 8c4-2 8 3 5 6-3 4-8 0-7-3l-9-8z" fill={c.secondary} />
      <path d="M17 32c4-3 8-3 12 0M39 26c3-2 6-1 7 2" fill="none" stroke={LABEL} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="21" cy="40" r="2" fill={c.secondary} />
    </>
  ),
  meatloaf: (c) => (
    <>
      <path d="M10 39c0-12 10-22 22-22s22 10 22 22c0 7-9 11-22 11S10 46 10 39z" fill={c.primary} />
      <path d="M18 31c8-7 20-7 28 0M15 39c10-5 24-5 34 0" fill="none" stroke={c.secondary} strokeWidth="3" strokeLinecap="round" />
      <path d="M22 35l20-4v15l-20 3z" fill={c.secondary} />
      <path d="M26 37l12-2v7l-12 2z" fill={c.primary} />
      <circle cx="31" cy="40" r="2" fill={LABEL} />
    </>
  ),
  'roast-slices': (c) => (
    <>
      <path d="M10 41c1-12 9-21 21-21 8 0 14 4 16 11-1 9-7 17-17 20-9 2-16-2-20-10z" fill={c.secondary} />
      <path d="M18 39c1-10 7-16 15-16 7 0 11 4 12 9-2 8-7 14-15 15-5 1-10-2-12-8z" fill={c.primary} />
      <path d="M37 34c3-2 7-1 9 2M25 30c3-2 7-2 10 0" fill="none" stroke={LABEL} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  'vacuum-pack': (c) => (
    <>
      <path d="M14 15h36l4 5-3 35H13l-3-35z" fill={LABEL} opacity="0.8" />
      <path d="M16 13h32M13 20h39" stroke={c.secondary} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M19 34c2-7 8-11 15-10 7 1 11 7 10 13-2 7-9 10-16 9-7-1-11-6-9-12z" fill={c.primary} />
      <path d="M25 33c4-3 10-4 15-1M25 40c4 2 9 2 13 0" fill="none" stroke={c.secondary} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M17 50h30" stroke={c.secondary} strokeWidth="1.5" opacity="0.6" />
    </>
  ),
  'pork-knuckle': (c) => (
    <>
      <path d="M16 40c-4-7-2-17 5-22 7-5 20-4 27 3 6 6 5 17-1 23-5 5-14 7-22 4z" fill={c.primary} />
      <path d="M20 29c7 3 15 3 23 0M22 41c7 4 14 4 21 1" fill="none" stroke={c.secondary} strokeWidth="3" strokeLinecap="round" />
      <path d="M18 44l-7 6c-4 4 1 9 5 6 4 3 8-2 5-6l5-5z" fill={BONE} stroke={c.secondary} strokeWidth="2" strokeLinejoin="round" />
      <path d="M31 23c3 2 5 5 5 9" stroke={LABEL} strokeWidth="2" strokeLinecap="round" />
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
  'fish-sticks': (c) => (
    <>
      <g transform="rotate(-24 32 32)">
        <rect x="12" y="17" width="40" height="10" rx="5" fill={c.primary} />
        <rect x="12" y="30" width="40" height="10" rx="5" fill={c.secondary} />
        <rect x="12" y="43" width="40" height="10" rx="5" fill={c.primary} />
        <path d="M20 19v6M31 19v6M43 19v6M18 32v6M30 32v6M43 32v6M21 45v6M34 45v6M45 45v6" stroke={LABEL} strokeWidth="2" strokeLinecap="round" />
      </g>
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
  'cheese-slices': (c) => (
    <>
      <path d="M16 15h25v31H16z" fill={c.secondary} />
      <path d="M22 20h25v31H22z" fill={c.primary} />
      <path d="M28 25h25v31H28z" fill={c.primary} />
      <path d="M28 25h25v5H28z" fill={c.accent} opacity="0.65" />
      <path d="M34 33h12M34 40h12M34 47h8" stroke={LABEL} strokeWidth="2" strokeLinecap="round" />
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
  'soap-bar': (c) => (
    <>
      <path d="M17 21c0-4 4-7 9-7h13c5 0 8 3 8 7v19c0 5-4 8-9 8H24c-5 0-8-3-8-8z" fill={c.primary} />
      <path d="M20 22c0-2 3-4 6-4h13c3 0 5 2 5 5v3H20z" fill={c.secondary} opacity="0.65" />
      <path d="M24 34c5-3 12-3 17 0" fill="none" stroke={LABEL} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  sponge: (c) => (
    <>
      <path d="M15 25c0-4 3-7 7-7h23c4 0 7 3 7 7v21c0 4-3 7-7 7H22c-4 0-7-3-7-7z" fill={c.primary} />
      <path d="M15 25c0-4 3-7 7-7h23c4 0 7 3 7 7v6H15z" fill={c.secondary} />
      <circle cx="24" cy="39" r="1.5" fill={LABEL} />
      <circle cx="33" cy="45" r="1.5" fill={LABEL} />
      <circle cx="43" cy="37" r="1.5" fill={LABEL} />
    </>
  ),
  'paper-roll': (c) => (
    <>
      <path d="M15 21c0-4 6-7 14-7s14 3 14 7v29c0 4-6 7-14 7s-14-3-14-7z" fill={c.primary} />
      <ellipse cx="29" cy="21" rx="14" ry="7" fill={LABEL} stroke={c.secondary} strokeWidth="2" />
      <ellipse cx="29" cy="21" rx="5" ry="2.8" fill={c.secondary} />
      <path d="M43 27c4-3 8-2 8 1v19c0 3-4 4-8 2" fill={c.primary} stroke={c.secondary} strokeWidth="2" />
      <ellipse cx="51" cy="28" rx="4" ry="2.5" fill={LABEL} stroke={c.secondary} strokeWidth="1.5" />
    </>
  ),
  'tissue-box': (c) => (
    <>
      <path d="M11 31l21-10 21 10v23H11z" fill={c.primary} />
      <path d="M11 31l21-10 21 10-21 10z" fill={c.secondary} />
      <path d="M25 27c-2-8 2-15 7-20 5 6 8 12 6 20-3 4-10 4-13 0z" fill={LABEL} />
      <path d="M32 27V12" stroke={c.secondary} strokeWidth="2" strokeLinecap="round" />
      <path d="M15 43h34" stroke={LABEL} strokeWidth="2" opacity="0.7" />
    </>
  ),
  'wipes-pack': (c) => (
    <>
      <path d="M12 27c0-4 4-7 8-7h24c5 0 8 3 8 7v23c0 4-3 7-8 7H20c-4 0-8-3-8-7z" fill={c.primary} />
      <path d="M19 23h26v8H19z" fill={c.secondary} />
      <rect x="24" y="16" width="16" height="11" rx="5" fill={LABEL} />
      <path d="M28 21h8" stroke={c.secondary} strokeWidth="2" strokeLinecap="round" />
      <path d="M19 40h26" stroke={c.secondary} strokeWidth="2" opacity="0.6" />
    </>
  ),
  napkins: (c) => (
    <>
      <path d="M14 29l23-13 14 8-23 13z" fill={c.secondary} />
      <path d="M14 35l23-13 14 8-23 13z" fill={c.primary} />
      <path d="M14 41l23-13 14 8-23 13z" fill={c.primary} />
      <path d="M23 36l8-5 7 4-8 5z" fill={LABEL} />
      <path d="M23 43l8-5 7 4-8 5z" fill={c.accent} />
    </>
  ),
  'folded-towel': (c) => (
    <>
      <path d="M13 29c0-3 3-5 6-5h29c3 0 5 2 5 5v22H13z" fill={c.primary} />
      <path d="M18 24v-7c0-3 3-5 6-5h25c3 0 5 2 5 5v7z" fill={c.secondary} />
      <path d="M18 35h35M18 42h35M25 18h23" stroke={LABEL} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M13 50h40" stroke={c.secondary} strokeWidth="2" />
    </>
  ),
  'detergent-capsule': (c) => (
    <>
      <path d="M19 20c0-5 4-8 9-8h10c5 0 8 3 8 8v26c0 5-3 8-8 8H28c-5 0-9-3-9-8z" fill={c.primary} />
      <path d="M19 34c8-5 19-5 27 0v12c0 5-3 8-8 8H28c-5 0-9-3-9-8z" fill={c.accent} />
      <path d="M25 19c3-3 11-4 16-1" fill="none" stroke={LABEL} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  'dishwasher-tablet': (c) => (
    <>
      <rect x="14" y="15" width="36" height="40" rx="7" fill={c.primary} />
      <path d="M14 29h36v13H14z" fill={LABEL} />
      <path d="M22 29v13M39 29v13" stroke={c.secondary} strokeWidth="2" />
      <path d="M23 20h18" stroke={c.secondary} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  'toilet-hanger': (c) => (
    <>
      <path d="M19 11h20c6 0 9 4 9 9v5H37v-5c0-2-1-3-3-3H24v12" fill="none" stroke={c.secondary} strokeWidth="5" strokeLinejoin="round" />
      <path d="M20 31h24v22c0 3-3 5-6 5H26c-4 0-6-2-6-5z" fill={c.primary} />
      <path d="M24 36h16v10H24z" fill={LABEL} />
      <path d="M28 50h8" stroke={c.secondary} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  razor: (c) => (
    <>
      <path d="M29 27h8l8 27c1 4-2 7-6 7h-4c-4 0-7-3-6-7l5-20z" fill={c.primary} />
      <rect x="17" y="14" width="31" height="12" rx="5" fill={c.secondary} />
      <path d="M21 18v5M27 18v5M33 18v5M39 18v5M44 18v5" stroke={LABEL} strokeWidth="1.5" />
      <path d="M31 33h6" stroke={LABEL} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  mop: (c) => (
    <>
      <path d="M41 9L25 39" stroke={c.secondary} strokeWidth="4" strokeLinecap="round" />
      <path d="M17 34l17 9-3 6c-2 4-6 5-10 3l-7-4c-4-2-5-6-3-10z" fill={c.primary} />
      <path d="M14 43l-4 9M20 47l-2 10M26 49l1 9M32 46l4 8" stroke={LABEL} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  'eye-patches': (c) => (
    <>
      <path d="M8 34c4-12 15-18 25-14-1 12-8 22-20 23-4 0-6-4-5-9z" fill={c.primary} />
      <path d="M56 34c-4-12-15-18-25-14 1 12 8 22 20 23 4 0 6-4 5-9z" fill={c.primary} />
      <path d="M15 35c4-7 9-10 15-10M49 35c-4-7-9-10-15-10" fill="none" stroke={c.secondary} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="20" cy="41" r="1.5" fill={LABEL} />
      <circle cx="44" cy="41" r="1.5" fill={LABEL} />
    </>
  ),
  'contact-lenses': (c) => (
    <>
      <path d="M10 33c0-4 4-7 9-7h26c5 0 9 3 9 7v14c0 4-4 7-9 7H19c-5 0-9-3-9-7z" fill={c.primary} />
      <ellipse cx="23" cy="39" rx="8" ry="6" fill={LABEL} />
      <ellipse cx="41" cy="39" rx="8" ry="6" fill={LABEL} />
      <path d="M16 27l4-8h22l5 8" fill={c.secondary} />
      <circle cx="23" cy="39" r="2" fill={c.secondary} />
      <circle cx="41" cy="39" r="2" fill={c.secondary} />
    </>
  ),
  'hair-accessories': (c) => (
    <>
      <path d="M13 35c2-9 11-14 20-12 8 2 12 9 10 17-2 8-10 12-18 10-9-2-14-8-12-15z" fill="none" stroke={c.primary} strokeWidth="6" />
      <path d="M39 19l10 10-5 5-10-10z" fill={c.secondary} />
      <path d="M39 19l-5 5M44 24l-5 5M48 28l-5 5" stroke={LABEL} strokeWidth="1.8" />
      <path d="M19 47l-5 6M24 50l-2 7M29 50l1 7" stroke={c.secondary} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'cosmetic-case': (c) => (
    <>
      <path d="M12 29c0-4 4-7 8-7h24c5 0 8 3 8 7v21c0 4-3 7-8 7H20c-4 0-8-3-8-7z" fill={c.primary} />
      <path d="M21 22v-6c0-4 4-7 11-7s11 3 11 7v6" fill="none" stroke={c.secondary} strokeWidth="3" />
      <path d="M13 32h38" stroke={c.secondary} strokeWidth="2.5" />
      <circle cx="32" cy="42" r="7" fill={LABEL} />
      <circle cx="32" cy="42" r="4" fill={c.accent} />
    </>
  ),
  'nail-tips': (c) => (
    <>
      <path d="M12 35c0-7 4-12 9-12s9 5 9 12v12c0 5-4 8-9 8s-9-3-9-8z" fill={c.primary} />
      <path d="M28 26c0-7 4-12 9-12s9 5 9 12v12c0 5-4 8-9 8s-9-3-9-8z" fill={c.secondary} />
      <path d="M40 39c0-6 3-10 7-10s7 4 7 10v9c0 4-3 6-7 6s-7-2-7-6z" fill={c.primary} />
      <path d="M15 35h12M31 26h12M43 39h8" stroke={LABEL} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  'waxing-kit': (c) => (
    <>
      <path d="M12 17h23v33H12z" fill={c.primary} />
      <path d="M16 22h15v23H16z" fill={LABEL} />
      <path d="M20 25v16M26 25v16" stroke={c.secondary} strokeWidth="2" />
      <path d="M39 34h15v17c0 4-3 6-7 6s-8-2-8-6z" fill={c.secondary} />
      <path d="M38 34h17v-4H38zM44 30l3-14" stroke={c.primary} strokeWidth="3" strokeLinecap="round" />
      <path d="M42 43h9" stroke={LABEL} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'toothbrush-heads': (c) => (
    <>
      <path d="M20 38h8v20h-8zM42 38h8v20h-8z" fill={c.secondary} />
      <rect x="15" y="12" width="18" height="28" rx="8" fill={c.primary} />
      <rect x="37" y="12" width="18" height="28" rx="8" fill={c.primary} />
      <path d="M19 19v8M23 17v10M27 19v8M41 19v8M45 17v10M49 19v8" stroke={LABEL} strokeWidth="2" strokeLinecap="round" />
      <path d="M18 34h12M40 34h12" stroke={c.secondary} strokeWidth="2" />
    </>
  ),
  'oral-care': (c) => (
    <>
      <path d="M15 19h8v17h-8z" fill={c.secondary} />
      <path d="M17 36h5l3 21h-8z" fill={c.primary} />
      <path d="M14 15h10M15 11h8M16 7h6" stroke={LABEL} strokeWidth="2" strokeLinecap="round" />
      <circle cx="43" cy="39" r="12" fill={c.primary} />
      <circle cx="43" cy="39" r="6" fill={LABEL} />
      <path d="M42 51v5M47 52v4" stroke={c.secondary} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'denture-care': (c) => (
    <>
      <path d="M12 29c8-12 32-12 40 0-3 11-10 18-20 18S15 40 12 29z" fill={c.primary} />
      <path d="M17 29c7-7 23-7 30 0l-4 8c-7 4-15 4-22 0z" fill={LABEL} />
      <path d="M21 29v7M27 27v10M33 27v10M39 27v10M45 29v7" stroke={c.secondary} strokeWidth="2" />
      <circle cx="47" cy="49" r="6" fill={c.accent} />
      <path d="M47 45v8M43 49h8" stroke={LABEL} strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  'cosmetic-tools': (c) => (
    <>
      <path d="M17 14h6v23h-6z" fill={c.secondary} />
      <path d="M14 10h12v7H14z" fill={c.primary} />
      <path d="M15 37h10v5c0 7-2 11-5 11s-5-4-5-11z" fill={c.primary} />
      <path d="M34 39c0-8 6-14 13-14s11 6 11 14-4 13-11 13-13-5-13-13z" fill={c.secondary} />
      <path d="M39 38c3-4 9-5 13-1M31 21l14 17M31 19l-3 3" fill="none" stroke={LABEL} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  hairbrush: (c) => (
    <>
      <path d="M27 39h10v19H27z" fill={c.secondary} />
      <rect x="16" y="10" width="32" height="34" rx="14" fill={c.primary} />
      <path d="M22 19v10M28 16v13M35 16v13M41 19v10M22 35h20" stroke={LABEL} strokeWidth="2" strokeLinecap="round" />
      <path d="M27 39h10" stroke={c.secondary} strokeWidth="2" />
    </>
  ),
  'popcorn-bowl': (c) => (
    <>
      <path d="M13 36h38c-1 12-9 19-19 19s-18-7-19-19z" fill={c.secondary} />
      <path d="M17 36c-2-7 2-10 7-8 0-7 8-9 11-3 4-6 12-3 11 3 5-2 8 2 6 8z" fill={c.primary} />
      <circle cx="23" cy="30" r="4" fill={LABEL} />
      <circle cx="34" cy="25" r="4.5" fill={LABEL} />
      <circle cx="44" cy="31" r="4" fill={LABEL} />
      <circle cx="29" cy="34" r="3.5" fill={LABEL} />
      <path d="M17 43h30" stroke={c.primary} strokeWidth="2" />
    </>
  ),
  'puffed-snacks': (c) => (
    <>
      <path d="M11 37c0-5 4-9 9-9s8 4 8 9-3 9-8 9-9-4-9-9zM34 22c0-5 4-9 9-9s9 4 9 9-4 9-9 9-9-4-9-9z" fill={c.primary} />
      <path d="M29 48c-5-2-7-7-4-12 2-4 7-5 11-3 5 2 6 7 4 11-2 5-7 6-11 4z" fill={c.secondary} />
      <path d="M15 35c2-3 5-4 8-2M38 20c2-3 5-4 8-2M29 43c2-2 4-3 7-2" fill="none" stroke={LABEL} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'corn-tubes': (c) => (
    <>
      <g transform="rotate(-24 32 32)">
        <rect x="9" y="18" width="43" height="12" rx="6" fill={c.primary} />
        <ellipse cx="51" cy="24" rx="5" ry="6" fill={c.secondary} />
        <ellipse cx="51" cy="24" rx="2.5" ry="3.5" fill={LABEL} />
        <rect x="12" y="36" width="40" height="12" rx="6" fill={c.primary} />
        <ellipse cx="51" cy="42" rx="5" ry="6" fill={c.secondary} />
        <ellipse cx="51" cy="42" rx="2.5" ry="3.5" fill={LABEL} />
        <path d="M20 20v8M31 20v8M40 20v8M22 38v8M34 38v8M43 38v8" stroke={c.secondary} strokeWidth="1.8" />
      </g>
    </>
  ),
  'wafer-rolls': (c) => (
    <>
      <g transform="rotate(-28 32 32)">
        <rect x="13" y="17" width="38" height="10" rx="5" fill={c.primary} />
        <rect x="13" y="31" width="38" height="10" rx="5" fill={c.secondary} />
        <rect x="13" y="45" width="38" height="10" rx="5" fill={c.primary} />
        <ellipse cx="49" cy="22" rx="4" ry="5" fill={LABEL} />
        <ellipse cx="49" cy="36" rx="4" ry="5" fill={LABEL} />
        <ellipse cx="49" cy="50" rx="4" ry="5" fill={LABEL} />
        <path d="M21 18v8M28 18v8M35 18v8M21 32v8M28 32v8M35 32v8M21 46v8M28 46v8M35 46v8" stroke={c.secondary} strokeWidth="1.4" />
      </g>
    </>
  ),
  'chocolate-box': (c) => (
    <>
      <path d="M11 27l21-12 21 12v28H11z" fill={c.secondary} />
      <path d="M11 27l21-12 21 12-21 12z" fill={c.primary} />
      <circle cx="22" cy="28" r="4.5" fill={LABEL} />
      <circle cx="32" cy="22" r="4.5" fill={c.accent} />
      <circle cx="42" cy="28" r="4.5" fill={LABEL} />
      <circle cx="27" cy="33" r="4.5" fill={c.accent} />
      <circle cx="37" cy="33" r="4.5" fill={c.secondary} />
      <path d="M11 27h42" stroke={LABEL} strokeWidth="2" />
    </>
  ),
  'ice-cream-treats': (c) => (
    <>
      <path d="M12 35h22L23 57z" fill={c.secondary} />
      <path d="M11 33c0-7 5-12 12-12 1-7 8-10 14-6 6 4 6 12 1 18z" fill={c.primary} />
      <path d="M43 36h12v15c0 5-3 8-6 8s-6-3-6-8z" fill={c.primary} />
      <path d="M43 36c0-5 3-8 6-8s6 3 6 8z" fill={c.accent} />
      <path d="M49 59v4M18 42l10 10" stroke={LABEL} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'granola-bowl': (c) => (
    <>
      <path d="M10 34h44c-1 13-10 21-22 21S11 47 10 34z" fill={c.secondary} />
      <path d="M14 34c0-8 7-13 14-10 5-6 15-3 16 3 7-1 10 3 9 7z" fill={c.primary} />
      <path d="M20 29l6-3 4 4-5 4zM33 25l6 2-2 5-6-2zM41 31l5-3 4 4-5 3z" fill={c.accent} />
      <circle cx="25" cy="30" r="1.5" fill={c.secondary} />
      <circle cx="37" cy="34" r="1.5" fill={c.secondary} />
      <path d="M15 42h34" stroke={c.primary} strokeWidth="2" />
    </>
  ),
  'processed-cheese': (c) => (
    <>
      <path d="M12 42l20-28 20 28z" fill={c.primary} />
      <path d="M12 42l20-8 20 8v10H12z" fill={c.secondary} />
      <path d="M19 40l13-19 14 19z" fill={c.primary} />
      <path d="M17 47h30" stroke={LABEL} strokeWidth="2.5" />
      <path d="M21 43v6M32 38v11M43 43v6" stroke={c.accent} strokeWidth="2" />
    </>
  ),
  'cheese-snacks': (c) => (
    <>
      <rect x="11" y="18" width="34" height="10" rx="5" fill={c.primary} transform="rotate(16 28 23)" />
      <rect x="15" y="37" width="36" height="10" rx="5" fill={c.secondary} transform="rotate(-12 33 42)" />
      <circle cx="42" cy="24" r="7" fill={c.primary} />
      <circle cx="42" cy="24" r="2" fill={LABEL} />
      <path d="M20 19l3 8M31 22l3 8M24 39l2 7M37 38l2 7" stroke={LABEL} strokeWidth="1.8" />
    </>
  ),
  'plant-based-dairy': (c) => (
    <>
      <path d="M12 25h17l3 7v24H12z" fill={c.primary} />
      <path d="M12 25l8-9 9 9" fill={c.secondary} />
      <path d="M37 34h17l-2 17c-.5 4-3 6-7 6h-1c-4 0-6-2-7-6z" fill={c.secondary} />
      <path d="M39 31h13v5H39z" fill={c.primary} />
      <path d="M23 43c-5-7-1-12 4-11 0 5-1 9-4 11zM23 43c3-7 8-8 11-6-2 5-6 7-11 6z" fill={LEAF} />
      <path d="M23 42v7" stroke={LABEL} strokeWidth="1.7" strokeLinecap="round" />
    </>
  ),
  'grilled-cheese': (c) => (
    <>
      <path d="M11 31c0-5 4-9 9-9h27c4 0 7 4 7 9v17c0 4-3 7-7 7H19c-5 0-8-3-8-7z" fill={c.primary} />
      <path d="M20 25l-4 28M31 23l-4 32M43 23l-4 32" stroke={c.secondary} strokeWidth="4" strokeLinecap="round" />
      <path d="M17 33h32" stroke={LABEL} strokeWidth="2" opacity="0.8" />
    </>
  ),
  pretzel: (c) => (
    <>
      <path d="M16 39c-6-7-2-17 6-17 6 0 8 7 10 13 2-6 4-13 10-13 8 0 12 10 6 17l-7 8c-3 3-7 2-9-2-2 4-6 5-9 2z" fill="none" stroke={c.primary} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 38c-3-5-1-10 4-11M43 27c5 1 7 6 4 11M27 43l4 3M37 43l-4 3" fill="none" stroke={c.secondary} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="22" cy="23" r="1.4" fill={LABEL} />
      <circle cx="42" cy="23" r="1.4" fill={LABEL} />
    </>
  ),
  crackers: (c) => (
    <>
      <path d="M15 35l20-11 15 8-20 11z" fill={c.secondary} />
      <path d="M15 29l20-11 15 8-20 11z" fill={c.primary} />
      <path d="M15 29l20-11 15 8-20 11z" fill="none" stroke={LABEL} strokeWidth="1.5" />
      <circle cx="25" cy="27" r="1.4" fill={c.secondary} />
      <circle cx="34" cy="23" r="1.4" fill={c.secondary} />
      <circle cx="42" cy="27" r="1.4" fill={c.secondary} />
      <circle cx="30" cy="31" r="1.4" fill={c.secondary} />
    </>
  ),
  fries: (c) => (
    <>
      <path d="M19 14l8-2 5 25-8 2zM30 10l8 1-1 27h-8zM41 14l8 3-7 22-8-2z" fill={c.primary} />
      <path d="M17 34h34l-5 21H22z" fill={c.secondary} />
      <path d="M19 39h30" stroke={LABEL} strokeWidth="2" />
      <path d="M26 44v7M34 44v7M42 44v7" stroke={c.primary} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'potato-products': (c) => (
    <>
      <path d="M10 36l19-18 14 6-17 18z" fill={c.primary} />
      <path d="M16 36l14-13M20 40l15-14" stroke={c.secondary} strokeWidth="2.5" strokeLinecap="round" />
      <rect x="13" y="44" width="27" height="10" rx="5" fill={c.secondary} transform="rotate(-12 26 49)" />
      <ellipse cx="45" cy="43" rx="9" ry="7" fill={c.primary} />
      <path d="M39 43h12M42 39h7" stroke={LABEL} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  dumplings: (c) => (
    <>
      <path d="M12 39c2-11 10-18 20-18s18 7 20 18c-8 5-32 5-40 0z" fill={c.primary} />
      <path d="M17 38c5 3 25 3 30 0M22 32l3 4M31 29l2 6M40 32l-3 4" fill="none" stroke={c.secondary} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M19 45c4 4 22 4 26 0v5c-7 4-19 4-26 0z" fill={c.secondary} />
      <circle cx="32" cy="17" r="2" fill={c.accent} />
    </>
  ),
  'breaded-bites': (c) => (
    <>
      <path d="M11 36c-1-7 5-12 11-11 4-7 15-5 17 2 8-1 14 5 12 12-1 6-7 9-14 9H22c-6 0-10-5-11-12z" fill={LEAF} />
      <path d="M16 31c2-5 8-7 13-4M31 29c3-4 8-4 11-1" fill="none" stroke={c.secondary} strokeWidth="2" strokeLinecap="round" />
      <path d="M17 43c-2-5 2-10 7-10 3-5 11-4 13 1 6-1 10 3 9 8-1 4-5 6-10 6H23c-3 0-5-2-6-5z" fill={c.primary} />
      <circle cx="24" cy="41" r="1.3" fill={LABEL} />
      <circle cx="34" cy="38" r="1.3" fill={LABEL} />
      <circle cx="40" cy="44" r="1.3" fill={LABEL} />
    </>
  ),
  'butter-stick': (c) => (
    <>
      <path d="M12 27l28-12 13 7-28 12z" fill={c.secondary} />
      <path d="M12 27v17l13 8V34z" fill={LABEL} />
      <path d="M25 34l28-12v18L25 52z" fill={c.primary} />
      <path d="M12 27l28-12 13 7-28 12z" fill={c.primary} />
      <path d="M17 29l7 4M43 19l6 3" stroke={LABEL} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'mozzarella-ball': (c) => (
    <>
      <ellipse cx="32" cy="43" rx="19" ry="8" fill={c.secondary} opacity="0.5" />
      <path d="M15 35c0-12 7-21 17-21s17 9 17 21c0 8-7 13-17 13s-17-5-17-13z" fill={c.primary} />
      <path d="M22 29c2-6 6-9 11-10M20 38c1 4 4 6 8 7" fill="none" stroke={LABEL} strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  'frozen-vegetables': (c) => (
    <>
      <circle cx="21" cy="30" r="7" fill={c.primary} />
      <circle cx="36" cy="24" r="6" fill={c.secondary} />
      <circle cx="44" cy="39" r="7" fill={c.primary} />
      <circle cx="27" cy="45" r="6" fill={c.secondary} />
      <path d="M19 20l4-4M40 16v-5M52 29l5-2M12 42l-5 2" fill="none" stroke={c.accent} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M12 24l3 3m0-3l-3 3M33 37l3 3m0-3l-3 3M49 49l3 3m0-3l-3 3" stroke={LABEL} strokeWidth="1.7" strokeLinecap="round" />
    </>
  ),
  'frozen-fruit': (c) => (
    <>
      <circle cx="22" cy="35" r="9" fill={c.primary} />
      <circle cx="35" cy="27" r="9" fill={c.secondary} />
      <circle cx="43" cy="40" r="9" fill={c.primary} />
      <path d="M30 18c3-5 8-6 12-4-1 5-6 7-12 4z" fill={LEAF} />
      <path d="M15 24l3-3m0 3l-3-3M49 24l3-3m0 3l-3-3M11 48l3-3m0 3l-3-3" stroke={LABEL} strokeWidth="2" strokeLinecap="round" />
      <circle cx="20" cy="32" r="1.5" fill={LABEL} />
      <circle cx="41" cy="37" r="1.5" fill={LABEL} />
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
  'wine-bottle': (c) => (
    <>
      <rect x="27" y="5" width="10" height="8" rx="2" fill={c.secondary} />
      <path d="M28 13h8v12c0 3 3 5 7 8 3 3 5 7 5 12v6c0 3-2 5-5 5H21c-3 0-5-2-5-5v-6c0-5 2-9 5-12 4-3 7-5 7-8z" fill={c.primary} />
      <path d="M28 14h8v8h-8z" fill={c.accent} />
      <rect x="21" y="36" width="22" height="13" rx="2" fill={LABEL} />
      <path d="M26 41h12M26 45h8" stroke={c.secondary} strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  'spirit-bottle': (c) => (
    <>
      <path d="M27 7h10v8l5 5v5l7 7v19c0 4-3 7-7 7H22c-4 0-7-3-7-7V32l7-7v-5l5-5z" fill={c.primary} />
      <rect x="25" y="6" width="14" height="7" rx="2" fill={c.secondary} />
      <path d="M24 20h16v5H24z" fill={c.accent} />
      <rect x="20" y="34" width="24" height="15" rx="2" fill={LABEL} />
      <path d="M25 39h14M25 44h10" stroke={c.secondary} strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  'oil-cruet': (c) => (
    <>
      <path d="M28 6h8v8l4 4v6c5 3 8 8 8 14v12c0 4-3 7-7 7H23c-4 0-7-3-7-7V38c0-6 3-11 8-14v-6l4-4z" fill={c.primary} />
      <path d="M28 6h8v5h-8zM36 8h9v4h-9z" fill={c.secondary} />
      <path d="M25 19h14v5H25z" fill={c.secondary} />
      <rect x="21" y="35" width="22" height="12" rx="2" fill={LABEL} />
      <path d="M26 39h12M26 43h8" stroke={c.accent} strokeWidth="2" strokeLinecap="round" />
      <path d="M43 28c6 4 7 11 6 16" fill="none" stroke={c.secondary} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  'spice-jar': (c) => (
    <>
      <rect x="20" y="13" width="24" height="8" rx="2" fill={c.secondary} />
      <path d="M19 21h26v27c0 4-3 7-7 7H26c-4 0-7-3-7-7z" fill={c.primary} />
      <circle cx="26" cy="17" r="1.1" fill={LABEL} />
      <circle cx="32" cy="17" r="1.1" fill={LABEL} />
      <circle cx="38" cy="17" r="1.1" fill={LABEL} />
      <rect x="22" y="31" width="20" height="12" rx="2" fill={LABEL} />
      <path d="M26 36h12" stroke={c.accent} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'sauce-bottle': (c) => (
    <>
      <rect x="27" y="6" width="10" height="8" rx="2" fill={c.secondary} />
      <path d="M28 14h8v8c4 2 7 5 8 10l4 17c1 5-2 8-7 8H23c-5 0-8-3-7-8l4-17c1-5 4-8 8-10z" fill={c.primary} />
      <path d="M25 23h14v5H25z" fill={c.secondary} />
      <rect x="21" y="36" width="22" height="13" rx="2" fill={LABEL} />
      <path d="M26 41h12M26 45h8" stroke={c.accent} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'squeeze-bottle': (c) => (
    <>
      <path d="M18 11c5-4 23-4 28 0l-2 28c0 4-3 7-7 9v5H27v-5c-4-2-7-5-7-9z" fill={c.primary} />
      <path d="M25 14c4-2 10-2 14 0" fill="none" stroke={c.secondary} strokeWidth="2" strokeLinecap="round" />
      <rect x="22" y="29" width="20" height="13" rx="3" fill={LABEL} />
      <path d="M27 34h10M27 38h7" stroke={c.accent} strokeWidth="2" strokeLinecap="round" />
      <path d="M26 53h12v6H26z" fill={c.secondary} />
      <path d="M29 56h6" stroke={LABEL} strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  'syrup-bottle': (c) => (
    <>
      <rect x="28" y="5" width="8" height="8" rx="2" fill={c.secondary} />
      <path d="M28 13h8v8l5 5c4 4 6 9 6 15v6c0 5-3 8-8 8H25c-5 0-8-3-8-8v-6c0-6 2-11 6-15l5-5z" fill={c.primary} />
      <path d="M28 14h8v7h-8z" fill={c.accent} />
      <rect x="21" y="35" width="22" height="13" rx="3" fill={LABEL} />
      <path d="M32 37c4 3 5 7 0 9-5-2-4-6 0-9z" fill={c.accent} />
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
