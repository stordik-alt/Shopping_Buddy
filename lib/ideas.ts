// Ideas for improving the app, sent from the account menu (app/actions/ideas.ts). The rules live here,
// apart from the form and the database, so client and server check the same limits.

export const IDEA_TITLE_MAX = 120
export const IDEA_DETAILS_MAX = 2000
/** Ideas a household may have waiting for review at once; stops a runaway client from flooding the list. */
export const IDEA_MAX_NEW_PER_HOUSEHOLD = 50

export type IdeaStatus = 'new' | 'planned' | 'done' | 'declined'

export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  new: 'Nový',
  planned: 'Plánujeme',
  done: 'Hotovo',
  declined: 'Nebudeme dělat',
}

export type Idea = { id: string; title: string; details: string | null; status: IdeaStatus; createdAt: string; authorName: string | null }

export type IdeaInput = { title: string; details: string }

/** The cleaned idea, or a Czech message saying what is wrong. Whitespace is trimmed; an empty
 *  description is stored as absent. */
export function validateIdeaInput(input: IdeaInput): { ok: true; title: string; details: string | null } | { ok: false; error: string } {
  if (typeof input.title !== 'string' || typeof input.details !== 'string') return { ok: false, error: 'Neplatný nápad.' }
  const title = input.title.trim().replace(/\s+/g, ' ')
  const details = input.details.trim()
  if (title === '') return { ok: false, error: 'Napište stručně, co by aplikace měla umět.' }
  if (title.length > IDEA_TITLE_MAX) return { ok: false, error: `Název je příliš dlouhý (nejvýše ${IDEA_TITLE_MAX} znaků).` }
  if (details.length > IDEA_DETAILS_MAX) return { ok: false, error: `Popis je příliš dlouhý (nejvýše ${IDEA_DETAILS_MAX} znaků).` }
  return { ok: true, title, details: details === '' ? null : details }
}
