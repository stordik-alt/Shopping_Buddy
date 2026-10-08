export type OffTaxonomyNode = {
  tagId: string
  canonicalName: string
  language: string
  parents: string[]
  children: string[]
  synonyms: string[]
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function stringValue(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') {
    const result = String(value).trim()
    return result || null
  }
  return null
}

function localizedValue(value: unknown, preferredLanguage: string): { value: string; language: string } | null {
  const direct = stringValue(value)
  if (direct) return { value: direct, language: preferredLanguage }
  if (!value || typeof value !== 'object') return null
  const object = value as Record<string, unknown>
  const preferred = stringValue(object[preferredLanguage])
  if (preferred) return { value: preferred, language: preferredLanguage }
  const first = Object.entries(object).find(([, item]) => stringValue(item))
  if (!first) return null
  return { value: stringValue(first[1])!, language: first[0] }
}

function ids(value: unknown): string[] {
  return asArray(value).map(stringValue).filter((value): value is string => Boolean(value))
}

function synonyms(value: unknown, language: string): string[] {
  if (!value || typeof value !== 'object') return []
  const object = value as Record<string, unknown>
  const values = object[language] ?? object.en ?? Object.values(object)[0]
  return asArray(values).map(stringValue).filter((value): value is string => Boolean(value))
}

export function parseOffTaxonomy(document: unknown, preferredLanguage = 'cs'): OffTaxonomyNode[] {
  if (!document || typeof document !== 'object') return []
  const root = document as Record<string, unknown>
  const result: OffTaxonomyNode[] = []

  for (const [tagId, raw] of Object.entries(root)) {
    if (!raw || typeof raw !== 'object') continue
    const node = raw as Record<string, unknown>
    const localized = localizedValue(node.name ?? node.names, preferredLanguage)
    if (!localized) continue

    result.push({
      tagId,
      canonicalName: localized.value,
      language: localized.language,
      parents: ids(node.parents),
      children: ids(node.children),
      synonyms: synonyms(node.synonyms, localized.language),
    })
  }

  return [...new Map(result.map((node) => [node.tagId, node])).values()]
}
