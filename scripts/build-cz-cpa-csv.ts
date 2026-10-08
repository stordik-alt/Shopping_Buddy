import fs from 'node:fs'
import path from 'node:path'

const inputDir = process.argv.find((arg) => arg.startsWith('--input-dir='))?.slice(12)
const output = process.argv.find((arg) => arg.startsWith('--output='))?.slice(9)

if (!inputDir || !output) {
  throw new Error('Usage: pnpm exec tsx scripts/build-cz-cpa-csv.ts --input-dir=.tmp/cz-cpa/levels --output=.tmp/cz-cpa/input.csv')
}

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
}

function htmlText(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim()
}

function readLevel(level: number): Array<{ code: string; name: string }> {
  const file = path.join(inputDir as string, `650${level}.html`)
  const raw = fs.readFileSync(file, 'utf8')
  const tables = [...raw.matchAll(/<table[^>]*>[\s\S]*?<\/table>/gi)]
  if (!tables.length) throw new Error(`CZ-CPA level ${level} export contains no table: ${file}`)

  const result: Array<{ code: string; name: string }> = []
  for (const table of tables) {
    const rows = [...table[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    for (const rowMatch of rows) {
      const cells = [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((cell) => htmlText(cell[1]))
        .filter(Boolean)
      if (cells.length < 2) continue

      const code = cells[0].replace(/\s+/g, '').trim()
      const name = cells[1].trim()
      if (!code || !name || /^kód$/i.test(code) || /^název$/i.test(name)) continue
      if (!/^(?:[A-Z]|\d{2,6})$/i.test(code)) continue

      result.push({ code: code.toUpperCase(), name })
    }
  }

  if (!result.length) {
    throw new Error(`CZ-CPA level ${level} export contains no classification rows: ${file}`)
  }

  return result
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
