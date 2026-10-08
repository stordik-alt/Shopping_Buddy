import fs from 'node:fs'
import path from 'node:path'

const inputDir = process.argv.find((arg) => arg.startsWith('--input-dir='))?.slice(13)
const output = process.argv.find((arg) => arg.startsWith('--output='))?.slice(9)

if (!inputDir || !output) {
  throw new Error('Usage: pnpm exec tsx scripts/build-cz-cpa-csv.ts --input-dir=.tmp/cz-cpa/levels --output=.tmp/cz-cpa/input.csv')
}

function parseCsv(document: string): string[][] {
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
      if (char === '\r' && next === '\n') i++
      pushRow()
    } else {
      cell += char
    }
  }
  if (cell || row.length) pushRow()
  return rows
}

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase()
}

function readLevel(level: number): Array<{ code: string; name: string }> {
  const file = path.join(inputDir as string, `650${level}.csv`)
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  const rows = parseCsv(raw)
  if (rows.length < 2) throw new Error(`CZ-CPA level ${level} export is empty: ${file}`)

  const headers = rows[0].map(normalizeHeader)
  const codeIndex = headers.findIndex(
    (header) => ['kód', 'kod', 'code'].includes(header) || header.includes('kód') || header.includes('kod'),
  )
  const nameIndex = headers.findIndex(
    (header) => ['název', 'nazev', 'name'].includes(header) || header.includes('název') || header.includes('nazev') || header.includes('name'),
  )
  if (codeIndex < 0 || nameIndex < 0) {
    throw new Error(`Cannot identify Kód/Název columns in ${file}. Headers: ${headers.join(', ')}`)
  }

  return rows.slice(1)
    .map((row) => ({ code: (row[codeIndex] ?? '').trim(), name: (row[nameIndex] ?? '').trim() }))
    .filter((row) => row.code && row.name)
}

const all: Array<{ code: string; name: string; level: number }> = []
for (let level = 1; level <= 6; level++) {
  const rows = readLevel(level)
  all.push(...rows.map((row) => ({ ...row, level })))
}

const unique = new Map<string, { code: string; name: string; level: number }>()
for (const row of all) unique.set(row.code, row)

fs.writeFileSync(
  output as string,
  ['code,name,level', ...[...unique.values()].map((row) => [row.code, row.name, String(row.level)].map(csvEscape).join(','))].join('\n') + '\n',
  'utf8',
)

console.log(JSON.stringify({
  levels: Object.fromEntries([1, 2, 3, 4, 5, 6].map((level) => [level, all.filter((row) => row.level === level).length])),
  totalEntries: unique.size,
  output,
}, null, 2))
