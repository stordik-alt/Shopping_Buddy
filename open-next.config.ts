// OpenNext for Cloudflare — prepared for a later move of hosting from Vercel to Cloudflare Workers
// (docs/cloudflare-deployment.md). Not used by the Vercel build or deployment.
import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache'

// The app has no ISR or `revalidate` exports — every data page is dynamic (`force-dynamic` or
// session-based) and `revalidatePath` only refreshes those. The few prerendered pages (sign-in,
// sign-up, intro, manifest) never change after a build, so they are served read-only from the
// Worker's static assets. That needs no extra R2 bucket, KV namespace or Durable Object.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
})
