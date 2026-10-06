// The kinds of notification the app raises (docs/14_NOTIFICATION_PREFERENCES.md). Each member can
// switch any of them off; the database check constraint (migrations 0066 and 0072) lists the same keys.

export const NOTIFICATION_KINDS = [
  { key: 'budget', label: 'Rozpočet domácnosti', description: 'Když výdaje dosáhnou 80 % nebo překročí měsíční rozpočet.' },
  { key: 'category_limit', label: 'Limity kategorií', description: 'Když výdaje v kategorii dosáhnou 80 % nebo překročí její limit.' },
  { key: 'deal_on_list', label: 'Akce na položky ze seznamu', description: 'Když je položka, kterou přidáte na seznam, právě nejlevněji v akci.' },
  { key: 'new_deals', label: 'Nové letáky', description: 'Když vyjde nový leták obchodu, který máte mezi svými obchody.' },
  { key: 'shopping_reminder', label: 'Připomínka nákupu', description: 'Ráno, když na seznamu něco čeká.' },
  { key: 'pantry_check', label: 'Kontrola zásob', description: 'Jednou týdně: co asi došlo a jestli to ještě máte.' },
  { key: 'recurring_payment', label: 'Pravidelné platby', description: 'V den splatnosti nájmu, energií a dalších pravidelných plateb.' },
  { key: 'household', label: 'Domácnost', description: 'Když se k domácnosti připojí nový člen.' },
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]['key']

const KEYS = new Set<string>(NOTIFICATION_KINDS.map((kind) => kind.key))

export function isNotificationKind(value: unknown): value is NotificationKind {
  return typeof value === 'string' && KEYS.has(value)
}

/** Whether a member sees a notification: everything except the kinds they switched off. A row without
 *  a kind (written before preferences existed) is shown to everyone. */
export function wantsNotification(kind: string | null | undefined, switchedOff: ReadonlySet<string>): boolean {
  return !kind || !switchedOff.has(kind)
}
