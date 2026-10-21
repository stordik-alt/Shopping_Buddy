import { gunzipSync, gzipSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fetchTetaPublicHtml } from '@/lib/ingestion/teta-public-html'

// Captures a real Teta page's Nuxt payload and stores it gzipped as a test fixture.
//
// The payload is the only ground truth for the devalue encoding Teta uses: the "is this number a
// value or an index?" rule is easy to get wrong, and a hand-written fixture would only prove that
// the code matches our own assumption. A captured payload proves it against the real site.
//
//   pnpm teta:capture-fixture -- --url="https://www.tetadrogerie.cz/eshop/produkty/hygiena?strana=1" \
//     --out=lib/ingestion/fixtures/teta-listing-payload.json.gz
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const url = args.find((arg) => arg.startsWith('--url='))?.slice(6)
  const out = args.find((arg) => arg.startsWith('--out='))?.slice(6)
  if (!url || !out) {
    console.error('Usage: pnpm teta:capture-fixture -- --url=<teta page url> --out=<fixture path>')
    process.exitCode = 1
    return
  }
  const html = await fetchTetaPublicHtml(url)
  const match = /<script\b[^>]*id=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html)
  if (!match) throw new Error('The page carries no __NUXT_DATA__ payload')
  const payload = JSON.parse(match[1].trim()) as unknown
  const gzipped = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'), { level: 9 })
  const target = resolve(out)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, gzipped)
  // A quick self-check: the captured payload must still decode.
  const decoded = JSON.parse(gunzipSync(gzipped).toString('utf8')) as unknown[]
  console.log(`Wrote ${target} (${gzipped.length} bytes gzipped, ${decoded.length} slots) from ${url}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
