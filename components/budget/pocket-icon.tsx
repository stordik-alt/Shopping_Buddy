import { Car, Gift, GraduationCap, Heart, Home, PiggyBank, Plane, ShieldCheck, type LucideIcon } from 'lucide-react'
import type { PocketIcon as PocketIconKey } from '@/lib/pocket-input'

const ICONS: Record<PocketIconKey, { icon: LucideIcon; label: string }> = {
  'piggy-bank': { icon: PiggyBank, label: 'Pokladnička' },
  shield: { icon: ShieldCheck, label: 'Rezerva' },
  car: { icon: Car, label: 'Auto' },
  home: { icon: Home, label: 'Bydlení' },
  plane: { icon: Plane, label: 'Dovolená' },
  gift: { icon: Gift, label: 'Dárky' },
  graduation: { icon: GraduationCap, label: 'Vzdělání' },
  heart: { icon: Heart, label: 'Zdraví' },
}

/** The drawing for a stored Kapsa icon key; an unknown key falls back to the piggy bank. */
export function PocketIcon({ name, className }: { name: string; className?: string }) {
  const Icon = (ICONS[name as PocketIconKey] ?? ICONS['piggy-bank']).icon
  return <Icon className={className} aria-hidden="true" />
}

export const POCKET_ICON_CHOICES = Object.entries(ICONS).map(([key, { label }]) => ({ key, label }))
