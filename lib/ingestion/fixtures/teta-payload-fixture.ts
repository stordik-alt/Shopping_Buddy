import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The captured Nuxt payloads of real tetadrogerie.cz pages. They are the ground truth for the
// devalue encoding: a hand-written fixture would only prove that the decoder agrees with our own
// guess. Captured with `pnpm teta:capture-fixture` and stored gzipped (the raw payload of one
// listing page is ~1 MB of JSON).

const FIXTURE_DIR = join(__dirname)

/** The captured page HTML of one listing page ("teta-listing-payload.json.gz"). */
export function tetaListingFixtureHtml(): string {
  return readFixture('teta-listing-payload.json.gz')
}

/** The captured page HTML of one product page ("teta-detail-payload.json.gz"). */
export function tetaDetailFixtureHtml(): string {
  return readFixture('teta-detail-payload.json.gz')
}

function readFixture(name: string): string {
  const values = JSON.parse(gunzipSync(readFileSync(join(FIXTURE_DIR, name))).toString('utf8')) as unknown[]
  // The decoder reads the payload out of the page, so the fixture is wrapped back into a page.
  return `<html><body><script id="__NUXT_DATA__" type="application/json">${JSON.stringify(values)}</script></body></html>`
}
