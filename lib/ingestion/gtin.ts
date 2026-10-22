// The barcode rules of the GTIN family (EAN-8, GTIN-12, EAN-13, GTIN-14), as pure functions.
//
// A barcode is the one identifier two retailers can agree on without talking to each other, so it
// is worth storing — but only when it is well formed. Two separate questions are kept apart on
// purpose (docs/43_CATALOG_IDENTITY_MODEL_PROPOSAL.md, section 3.2): the format of the code
// (length + check digit, checked here) and the evidence that the code really belongs to the
// product (which is a property of the source, not of the digits).
//
// The check digit exists to catch the typos that a hand-written code picks up. It is a format
// rule, not a proof of identity: a valid check digit says the digits are consistent, nothing more.

/** The check digit of a GTIN, computed from the data digits (the code without its last digit).
 *  The weights alternate 3 and 1 starting from the rightmost data digit, which is the rule of the
 *  whole GTIN family, so one implementation covers EAN-8, GTIN-12, EAN-13 and GTIN-14. */
export function gtinCheckDigit(dataDigits: string): number {
  let sum = 0
  for (let index = 0; index < dataDigits.length; index++) {
    const digitsFromRight = dataDigits.length - 1 - index
    sum += Number(dataDigits[index]) * (digitsFromRight % 2 === 0 ? 3 : 1)
  }
  return (10 - (sum % 10)) % 10
}

/** True when the value is a well-formed GTIN: only digits, a length the family defines (8, 12, 13
 *  or 14) and a correct check digit. A leading zero is kept — the code is text, not a number
 *  (CLAUDE.md section 3.2). */
export function isValidGtin(value: string): boolean {
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(value)) return false
  return Number(value[value.length - 1]) === gtinCheckDigit(value.slice(0, -1))
}
