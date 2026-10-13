/** Reads JSON that the app itself stored in a text column (a receipt's parsed result or lines). A row can
 *  be damaged (an interrupted write, a hand edit), and an unguarded `JSON.parse` then takes down the whole
 *  page or action for one bad row. The failure is logged with `context` and returned as `null`, so the
 *  caller decides what a missing value means; it is never silently turned into valid-looking data. */
export function parseStoredJson<T>(text: string, context: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch (error) {
    console.error(`[stored-json] unreadable JSON in ${context}`, error)
    return null
  }
}
