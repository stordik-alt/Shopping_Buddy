// OpenNext for Cloudflare — prepared for a later move of hosting from Vercel to Cloudflare Workers
// (docs/cloudflare-deployment.md). Not used by the Vercel build or deployment.
import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'

// Next's data cache lives in an R2 bucket (binding NEXT_INC_CACHE_R2_BUCKET in wrangler.jsonc).
// It must be writable: lib/db/cached-reads.ts caches the global reads (stores, chains, prices,
// promotions, products and recipes with `unstable_cache` so that page renders stop re-reading them
// from Neon. The cache is invalidated by ingestion/catalog mutations through cache tags; the time
// based revalidate value remains a safety fallback. A read-only cache would leave those reads uncached.
// The prerendered pages (sign-in, sign-up, intro, manifest) are uploaded to the same bucket by
// `opennextjs-cloudflare deploy`. Cache tags are used for global catalog invalidation; no queue or
// Durable Object is required. `revalidatePath` continues to refresh dynamic pages.
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
})
