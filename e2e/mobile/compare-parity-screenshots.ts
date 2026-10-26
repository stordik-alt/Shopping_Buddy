import { mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve('test-results/mobile-parity')
const names = [
  'home', 'shopping', 'pantry', 'budget', 'recipes', 'deals', 'stores', 'profile',
  'receipts', 'mealplan', 'budget-plan', 'ai-chat', 'guide-welcome', 'guide-spotlight', 'guide-feature-spotlight',
] as const

async function findScreenshot(directory: string, filename: string): Promise<string | null> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      const found = await findScreenshot(candidate, filename)
      if (found) return found
    } else if (entry.isFile() && entry.name === filename) {
      return candidate
    }
  }
  return null
}

async function normalizeNativeScreenshot(input: string, output: string) {
  const image = sharp(input)
  const metadata = await image.metadata()
  if (!metadata.width || !metadata.height) throw new Error(`Invalid Android screenshot: ${input}`)
  const scale = metadata.width / 390
  const extraHeight = metadata.height / scale - 844
  const top = extraHeight > 0 ? Math.round(extraHeight * scale / 2) : 0
  const cropHeight = Math.min(metadata.height - top, Math.round(844 * scale))
  await image.extract({ left: 0, top, width: metadata.width, height: cropHeight }).resize(390, 844).png().toFile(output)
  const stats = await sharp(output).stats()
  if (stats.channels.slice(0, 3).every((channel) => channel.min === channel.max)) {
    throw new Error(`Android screenshot is blank: ${input}`)
  }
}

async function makePair(theme: 'light' | 'dark', name: typeof names[number], pwa: string, native: string, output: string) {
  const nativeNormalized = path.join(path.dirname(output), `${theme}-${name}-android.png`)
  await normalizeNativeScreenshot(native, nativeNormalized)
  const label = Buffer.from(`<svg width="780" height="32"><rect width="390" height="32" fill="#f1f3f5"/><rect x="390" width="390" height="32" fill="#e9ecef"/><text x="12" y="22" font-family="sans-serif" font-size="16" font-weight="700" fill="#202124">PWA · ${name}</text><text x="402" y="22" font-family="sans-serif" font-size="16" font-weight="700" fill="#202124">Android · ${name}</text></svg>`)
  await sharp({ create: { width: 780, height: 876, channels: 4, background: '#ffffff' } })
    .composite([
      { input: label, left: 0, top: 0 },
      { input: await sharp(pwa).resize(390, 844).png().toBuffer(), left: 0, top: 32 },
      { input: await sharp(nativeNormalized).png().toBuffer(), left: 390, top: 32 },
    ])
    .png()
    .toFile(output)
}

async function makeContactSheet(theme: 'light' | 'dark', pairs: string[], output: string) {
  const tileWidth = 585
  const tileHeight = 658
  const columns = 2
  const rows = Math.ceil(pairs.length / columns)
  const tiles = await Promise.all(pairs.map((file, index) => sharp(file).resize(tileWidth, tileHeight).png().toBuffer().then((input) => ({
    input,
    left: (index % columns) * tileWidth,
    top: Math.floor(index / columns) * tileHeight,
  }))))
  await sharp({ create: { width: columns * tileWidth, height: rows * tileHeight, channels: 4, background: theme === 'dark' ? '#18212d' : '#ffffff' } })
    .composite(tiles)
    .png()
    .toFile(output)
}

async function main() {
  await mkdir(path.join(root, 'comparison'), { recursive: true })
  for (const theme of ['light', 'dark'] as const) {
    const pairs: string[] = []
    for (const name of names) {
      const filename = `${theme}-${name}.png`
      const pwa = await findScreenshot(path.join(root, 'pwa'), filename)
      const native = await findScreenshot(path.join(root, 'native'), filename)
      if (!pwa || !native) throw new Error(`Missing ${theme} screenshot pair for ${name}: PWA=${pwa ?? 'missing'}, Android=${native ?? 'missing'}`)
      const pair = path.join(root, 'comparison', `${theme}-${name}.png`)
      await makePair(theme, name, pwa, native, pair)
      pairs.push(pair)
    }
    await makeContactSheet(theme, pairs, path.join(root, 'comparison', `${theme}-contact-sheet.png`))
  }
  process.stdout.write(`Compared ${names.length} paired screens in light and dark themes.\n`)
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})
