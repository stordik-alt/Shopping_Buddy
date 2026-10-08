export type CzCpaNode = {
  code: string
  name: string
  level: number
  parentCode: string | null
  path: string[]
}

function textValue(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') {
    const result = String(value).trim()
    return result || null
  }
  if (!value || typeof value !== 'object') return null
  const object = value as Record<string, unknown>
  for (const key of ['name', 'nazev', 'Název', 'NAME', 'Name', '#text']) {
    const candidate = object[key]
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      const result = String(candidate).trim()
      if (result) return result
    }
  }
  return null
}

function normalizeCode(value: unknown): string | null {
  const code = textValue(value)?.replace(/\s+/g, '')
  if (!code) return null
  if (!/^(?:[A-Z]|\d{2,6})$/i.test(code)) return null
  return code.toUpperCase()
}

function levelForCode(code: string): number | null {
  if (/^[A-Z]$/.test(code)) return 1
  if (/^\d{2,6}$/.test(code)) return code.length - 0
  return null
}

function parseRows(rows: Array<Record<string, unknown>>): CzCpaNode[] {
  const raw = rows
    .map((row) => {
      const code = normalizeCode(row.code ?? row.kod ?? row.Kód ?? row.CODE ?? row.Code)
      const name = textValue(row.name ?? row.nazev ?? row.Název ?? row.NAME ?? row.Name ?? row['#text'])
      const explicitLevel = Number(textValue(row.level ?? row.uroven ?? row.úroveň ?? row.LEVEL) ?? '')
      const level = Number.isInteger(explicitLevel) && explicitLevel >= 1 && explicitLevel <= 6
        ? explicitLevel
        : code ? levelForCode(code) : null
      return code && name && level ? { code, name, level } : null
    })
    .filter((row): row is { code: string; name: string; level: number } => Boolean(row))

  const byCode = new Map(raw.map((row) => [row.code, row]))
  const result: CzCpaNode[] = []
  const parentByCode = new Map<string, string | null>()
  const pathByCode = new Map<string, string[]>()
  const stack: Array<{ level: number; code: string }> = []

  for (const row of raw) {
    while (stack.length && stack[stack.length - 1].level >= row.level) stack.pop()
    const parentCode = stack.length ? stack[stack.length - 1].code : null
    const parentPath = parentCode ? (pathByCode.get(parentCode) ?? []) : []
    parentByCode.set(row.code, parentCode)
    pathByCode.set(row.code, [...parentPath, row.code])
    stack.push({ level: row.level, code: row.code })
  }

  for (const row of raw) {
    const parentCode = parentByCode.get(row.code) ?? null
    result.push({
      ...row,
      parentCode: parentCode && byCode.has(parentCode) ? parentCode : null,
      path: pathByCode.get(row.code) ?? [row.code],
    })
  }

  return [...new Map(result.map((node) => [node.code, node])).values()]
}

function objectRows(document: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(document)) return document.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))

  if (!document || typeof document !== 'object') return []
  const root = document as Record<string, unknown>
  for (const key of ['items', 'rows', 'data', 'classification', 'klasifikace', 'Polozky', 'Položky']) {
    const value = root[key]
    if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
  }

  const rows: Array<Record<string, unknown>> = []
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (!value || typeof value !== 'object') return
    const object = value as Record<string, unknown>
    const code = normalizeCode(object.code ?? object.kod ?? object.Kód ?? object.CODE ?? object.Code)
    const name = textValue(object.name ?? object.nazev ?? object.Název ?? object.NAME ?? object.Name)
    if (code && name) rows.push(object)
    for (const child of Object.values(object)) visit(child)
  }
  visit(document)
  return rows
}

function parseCsv(document: string): Array<Record<string, unknown>> {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  const pushCell = () => {
    row.push(cell)
    cell = ''
  }
  const pushRow = () => {
    pushCell()
    if (row.some((value) => value.trim())) rows.push(row)
    row = []
  }

  for (let i = 0; i < document.length; i++) {
    const char = document[i]
    const next = document[i + 1]
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"'
        i++
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      pushCell()
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\\n') i++
      pushRow()
    } else {
      cell += char
    }
  }
  if (cell || row.length) pushRow()

  if (rows.length < 2) return []
  const headers = rows[0].map((value) => value.trim().toLowerCase())
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
}

export function parseCzCpaDocument(document: unknown, format?: 'json' | 'csv' | 'xml'): CzCpaNode[] {
  if (typeof document === 'string' && (format === 'csv' || document.includes('\n'))) {
    const rows = parseCsv(document.replace(/^\uFEFF/, ''))
    return parseRows(rows)
  }

  if (typeof document === 'string') {
    const parsed = JSON.parse(document)
    return parseRows(objectRows(parsed))
  }

  return parseRows(objectRows(document))
}
