import { generateVapidKeys } from '@/lib/push/web-push'

// Prints a new VAPID key pair for push notifications (lib/push/, docs/push-notifications.md).
// Set the output as environment variables on the server (Vercel → Settings → Environment Variables,
// or `wrangler secret put` for the Cloudflare build), together with VAPID_SUBJECT. Nothing is written
// to disk. Generate once: replacing the keys later makes every phone's subscription invalid, and
// members have to switch notifications on again.
async function main() {
  const keys = await generateVapidKeys()
  console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`)
  console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`)
  console.log('VAPID_SUBJECT=mailto:<your address>')
  console.error('\nThe private key is a secret: put it only into the server environment, never into git or chat.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
