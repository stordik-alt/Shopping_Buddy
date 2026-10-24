import type { ExpenseCategory } from '../../../lib/expense-categories'

const LIGHT = {
  Potraviny: '#0a1a3f',
  Domácnost: '#499971',
  Děti: '#d9b06b',
  Drogerie: '#6084a9',
  Ostatní: '#c8775a',
  Bydlení: '#6e519d',
  Auto: '#b14d51',
  'Oblečení a obuv': '#a26a9d',
  Zdraví: '#5e7d3b',
  'Volný čas': '#0080a2',
  Doprava: '#008486',
} satisfies Record<ExpenseCategory, string>

const DARK: Record<ExpenseCategory, string> = {
  Potraviny: '#03bcdb',
  Domácnost: '#55a57d',
  Děti: '#e0b771',
  Drogerie: '#78a3cf',
  Ostatní: '#df8c6f',
  Bydlení: '#b093e5',
  Auto: '#eb8182',
  'Oblečení a obuv': '#d59acf',
  Zdraví: '#96b874',
  'Volný čas': '#2fb5d8',
  Doprava: '#16bbbc',
}

/** Mirrors the PWA's category-to-chart-token mapping and its light/dark chart palettes. */
export function expenseCategoryColor(category: string, theme: 'light' | 'dark'): string {
  const palette = theme === 'dark' ? DARK : LIGHT
  return category in palette ? palette[category as ExpenseCategory] : palette.Ostatní
}
