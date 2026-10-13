// The currency code the app stores (docs/37_SECURITY_REMEDIATION_PLAN.md, S5). A receipt's currency is read from
// printed text by OCR and a model, which return what is printed ("Kč") as readily as the ISO code; a price or
// receipt row must hold the three-letter ISO 4217 code ("CZK"), so everything that comes from a receipt passes
// through here before it is written.

/** What a printed currency sign or abbreviation stands for. Keys are upper-case without dots or spaces. */
const CURRENCY_ALIASES: Record<string, string> = {
  'KČ': 'CZK',
  KC: 'CZK',
  'KČS': 'CZK',
  '€': 'EUR',
  $: 'USD',
  '£': 'GBP',
  ZŁ: 'PLN',
  ZL: 'PLN',
  FT: 'HUF',
}

/** The ISO 4217 code for a currency as read from a receipt, or null when it is empty or not recognised
 *  (the caller then uses the household's default, CZK, as it always did for a missing currency — nothing is guessed). */
export function normalizeCurrency(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.normalize('NFC').replace(/[\s.]/g, '').toUpperCase()
  if (!text) return null
  if (/^[A-Z]{3}$/.test(text)) return text
  return CURRENCY_ALIASES[text] ?? null
}
