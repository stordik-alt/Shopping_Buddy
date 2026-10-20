// The audit trail of a household (docs/35_SECURITY_AUDIT.md, S18): which changes are recorded and how an
// entry reads to the owner. Pure; the writing is in lib/db/audit.ts.

export type AuditDetail = Record<string, string | number | boolean | null>

const LABELS = {
  'household.updated': 'Změnil(a) nastavení domácnosti',
  'member.added': 'Přidal(a) člena domácnosti',
  'member.removed': 'Odebral(a) člena domácnosti',
  'invitation.created': 'Pozval(a) nového člena',
  'invitation.revoked': 'Zrušil(a) pozvánku',
  'invitation.accepted': 'Přijal(a) pozvánku do domácnosti',
  'expense.added': 'Přidal(a) výdaj',
  'expense.updated': 'Upravil(a) výdaj',
  'expense.deleted': 'Smazal(a) výdaj',
  'income.added': 'Přidal(a) příjem',
  'income.updated': 'Upravil(a) příjem',
  'income.deleted': 'Smazal(a) příjem',
  'income.received': 'Označil(a) příjem jako přijatý',
  'recurring_income.added': 'Přidal(a) pravidelný příjem',
  'recurring_income.updated': 'Upravil(a) pravidelný příjem',
  'recurring_income.stopped': 'Zastavil(a) pravidelný příjem',
  'recurring_income.received': 'Potvrdil(a) skutečně přijatý pravidelný příjem',
  'recurring_income.skipped': 'Přeskočil(a) termín pravidelného příjmu',
  'budget.period_set': 'Změnil(a) rozpočet období',
  'budget.category_set': 'Změnil(a) limit kategorie',
  'budget.savings_goal_set': 'Změnil(a) cíl úspor',
  'period.closed': 'Uzavřel(a) období',
  'period.reopened': 'Znovu otevřel(a) období',
  'purchase.deleted': 'Smazal(a) nákup',
  'data.reset': 'Smazal(a) data domácnosti',
} as const

export type AuditAction = keyof typeof LABELS

export function auditLabel(action: string): string {
  return (LABELS as Record<string, string>)[action] ?? action
}

/** The detail as a short line ("částka 250, kategorie Potraviny"); empty when there is none. */
const DETAIL_KEYS: Record<string, string> = { amount: 'částka', category: 'kategorie', period: 'období', fields: 'změněno', date: 'datum', status: 'stav', groups: 'smazáno' }
export function auditDetailText(detail: AuditDetail): string {
  return Object.entries(detail)
    .filter(([, value]) => value !== null && value !== '')
    .map(([key, value]) => `${DETAIL_KEYS[key] ?? key} ${value}`)
    .join(', ')
}
