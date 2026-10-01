import { backfillRecipeImages } from '@/lib/recipes/importer'

function parseArgs(argv: string[]) {
  let sourceId: string | undefined
  let limit = 5000
  let delayMs = 250
  let dryRun = false
  const imageHosts: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]
    if (arg === '--source' && next) { sourceId = next; index += 1 }
    else if (arg?.startsWith('--source=')) sourceId = arg.slice('--source='.length)
    else if (arg?.startsWith('--limit=')) limit = Number(arg.slice('--limit='.length))
    else if (arg?.startsWith('--delay-ms=')) delayMs = Number(arg.slice('--delay-ms='.length))
    else if (arg === '--dry-run') dryRun = true
    else if (arg?.startsWith('--image-host=')) imageHosts.push(arg.slice('--image-host='.length))
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error('--limit must be an integer from 1 to 5000')
  if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 60_000) throw new Error('--delay-ms must be an integer from 0 to 60000')
  return { sourceId, limit, delayMs, dryRun, imageHosts }
}

backfillRecipeImages(parseArgs(process.argv.slice(2))).catch((error) => {
  console.error(error)
  process.exit(1)
})
