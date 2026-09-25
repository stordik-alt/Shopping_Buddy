import { describe, expect, it } from 'vitest'
import sharpUnavailable from './sharp.js'

// The Cloudflare build swaps sharp for this stub. It must throw when called — not return something
// sharp-like — so lib/receipt-image.ts fails fast and the receipt pipeline sends the original photo.
describe('sharp stub for the Cloudflare build', () => {
  it('throws a clear error when called', () => {
    expect(() => sharpUnavailable()).toThrow('sharp is not available on Cloudflare Workers')
  })
})
