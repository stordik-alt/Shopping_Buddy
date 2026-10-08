export type GpcNode = { code: string; name: string; level: 'segment' | 'family' | 'class' | 'brick' | 'unknown'; parentCode: string | null; path: string[] }

function asArray<T>(value: T | T[] | undefined): T[] { return value == null ? [] : Array.isArray(value) ? value : [value] }

function textValue(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim() || null
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    for (const key of ['Description', 'description', 'Definition', 'definition', 'Title', 'title', 'Name', 'name', 'Label', 'label', 'Text', 'text', '@_Description', '@_description', '@_Definition', '@_definition', '@_Title', '@_title', '@_Name', '@_name', '@_Label', '@_label', '@_Text', '@_text', '#text']) {
      const found = textValue(obj[key])
      if (found) return found
    }
  }
  return null
}

function codeValue(value: unknown, keyHint = ''): string | null {
  if (typeof value === 'string' || typeof value === 'number') {
    const raw = String(value).trim()
    return /^\d{8}$/.test(raw) && (
      /code|id/i.test(keyHint) || /^\d{8}$/.test(raw)
    ) ? raw : null
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const preferred = [
      'Code', 'code', 'BrickCode', 'brickCode', 'GPCCode', 'gpcCode',
      'GpcCode', 'GPCBrickCode', 'gpcBrickCode', 'SegmentCode', 'segmentCode',
      'FamilyCode', 'familyCode', 'ClassCode', 'classCode', 'ID', 'id'
    ]
    for (const key of preferred) {
      const found = codeValue(obj[key], key)
      if (found) return found
    }
    for (const [key, child] of Object.entries(obj)) {
      if (/code|id/i.test(key)) {
        const found = codeValue(child, key)
        if (found) return found
      }
    }
  }
  return null
}

function levelOf(key: string, node: Record<string, unknown>): GpcNode['level'] {
  const lower = key.toLowerCase()
  for (const level of ['brick', 'class', 'family', 'segment'] as const) if (lower.includes(level)) return level
  const raw = textValue(node['Level'] ?? node['level'] ?? node['Type'] ?? node['type'])?.toLowerCase()
  for (const level of ['brick', 'class', 'family', 'segment'] as const) if (raw?.includes(level)) return level
  return 'unknown'
}

function collectNodes(value: unknown, parentCode: string | null = null, path: string[] = [], key = 'root'): GpcNode[] {
  const result: GpcNode[] = []
  for (const item of asArray(value)) {
    if (!item || typeof item !== 'object') continue
    const node = item as Record<string, unknown>
    const code = codeValue(node)
    const name = textValue(node)
    const level = levelOf(key, node)
    const nextPath = code && name ? [...path, code] : path
    if (code && name) result.push({ code, name, level, parentCode, path: nextPath })
    for (const [childKey, childValue] of Object.entries(node)) {
      if (['Code','code','BrickCode','brickCode','GPCCode','gpcCode','GpcCode','GPCBrickCode','gpcBrickCode','SegmentCode','segmentCode','FamilyCode','familyCode','ClassCode','classCode','ID','id','Description','description','Definition','definition','Title','title','Name','name','Label','label','Text','text','Level','level','Type','type'].includes(childKey)) continue
      result.push(...collectNodes(childValue, code ?? parentCode, nextPath, childKey))
    }
  }
  return result
}

export function parseGpcDocument(document: unknown): GpcNode[] {
  const all = collectNodes(document)
  return [...new Map(all.map((node) => [node.code + ':' + node.name, node])).values()]
}
