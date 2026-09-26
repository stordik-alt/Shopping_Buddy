// OpenNext for Cloudflare — prepared for a later move of hosting from Vercel to Cloudflare Workers
// (docs/cloudflare-deployment.md). Not used by the Vercel build or deployment.
import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'

// Next's data cache lives in an R2 bucket (binding NEXT_INC_CACHE_R2_BUCKET in wrangler.jsonc).
// It must be writable: lib/db/cached-reads.ts caches the global reads (stores, chains, prices,
// promotions) for 15 minutes with `unstable_cache` so that page renders stop re-reading them from
// Neon, whose free network transfer ran out. A read-only cache would leave those reads uncached.
// The prerendered pages (sign-in, sign-up, intro, manifest) are uploaded to the same bucket by
// `opennextjs-cloudflare deploy`. No tag cache or queue is configured: the app uses only time-based
// revalidation (no `revalidateTag`), and `revalidatePath` only refreshes dynamic pages.
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
})
