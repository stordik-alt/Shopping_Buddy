// Stand-in for `sharp` in the Cloudflare build only (next.config.mjs aliases `sharp` to this file when
// BUILD_TARGET=cloudflare). sharp is a native Node addon and cannot run on Workers.
//
// sharp is used only by lib/receipt-image.ts to make a cleaned-up copy of a receipt photo for OCR.
// That step is best-effort: when it throws, the pipeline (app/actions/receipts.ts) sends the original
// photo to OCR instead and records the failure in the import log (`imagePrep.status: 'failed'`). So on
// Cloudflare, OCR gets the original photo until a Workers-compatible replacement is chosen — see
// docs/cloudflare-deployment.md, "OCR image preparation".
function sharpUnavailable() {
  throw new Error('sharp is not available on Cloudflare Workers — the original photo is sent to OCR')
}

export default sharpUnavailable
