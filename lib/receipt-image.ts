import sharp, { type Sharp } from 'sharp'

// Receipt photo handling for the OCR pipeline (docs/08_OCR_RECEIPT_PIPELINE.md sections 2 and 3):
// working out what an uploaded file really is, and cleaning a photo up so OCR reads it better.
// Pure functions of the input bytes — no network, no storage — so they can be tested with
// synthetic images.

// --- File type detection ---------------------------------------------------------------------

export type SupportedReceiptFileType = { kind: 'supported'; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'; extension: 'jpg' | 'png' | 'webp' | 'pdf' }
export type ReceiptFileType = SupportedReceiptFileType | { kind: 'heic' } | { kind: 'unknown' }

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'heif'])

/** Identifies an upload from its leading bytes instead of trusting the client's declared MIME type
 *  or the file name — both are attacker-controlled, and a phone may label a file wrongly. HEIC is
 *  reported separately because it is a *recognised* format that neither Google Vision nor the
 *  bundled image library can decode, so the caller can give a specific instruction rather than a
 *  generic "unsupported file". */
export function detectReceiptFileType(buffer: Buffer): ReceiptFileType {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { kind: 'supported', mimeType: 'image/jpeg', extension: 'jpg' }
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { kind: 'supported', mimeType: 'image/png', extension: 'png' }
  }
  if (buffer.length >= 12 && buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') {
    return { kind: 'supported', mimeType: 'image/webp', extension: 'webp' }
  }
  // PDFs may have a few bytes of junk before the header; the spec allows the marker in the first 1 KB.
  if (buffer.subarray(0, 1024).toString('latin1').includes('%PDF-')) {
    return { kind: 'supported', mimeType: 'application/pdf', extension: 'pdf' }
  }
  if (buffer.length >= 12 && buffer.toString('latin1', 4, 8) === 'ftyp' && HEIC_BRANDS.has(buffer.toString('latin1', 8, 12))) {
    return { kind: 'heic' }
  }
  return { kind: 'unknown' }
}

// --- OCR preparation ---------------------------------------------------------------------------

/** Long-side cap. Vision recommends only ~1000 px for text, so beyond this extra pixels just cost
 *  upload size and latency (and stay well under Vision's 10 MB request limit). */
const MAX_LONG_SIDE = 4000
/** Refuse to decode an image that would expand to more pixels than this (decompression bombs: a
 *  tiny file can declare enormous dimensions). Comfortably above a 50 MP phone photo. */
const MAX_INPUT_PIXELS = 80_000_000
/** Lighting is treated as uneven (shadow, glare gradient, one side lit) when the darkest 5 % of the
 *  estimated paper brightness is below this fraction of the brightest 5 %. Measured on synthetic
 *  photos: 0.25–0.31 with a strong shadow, ≥ 0.71 for every other case tried. */
const UNEVEN_LIGHTING_RATIO = 0.6
/** Only rotate to fix a skew that is both noticeable and clearly supported by the text layout. A
 *  genuinely tilted receipt scored a text-line alignment gain of 3+ at the right angle; noise sits
 *  around 1. */
const MIN_SKEW_DEGREES = 0.7
const MIN_SKEW_GAIN = 1.5
const MAX_SKEW_DEGREES = 15
const OUTPUT_JPEG_QUALITY = 90
const FALLBACK_JPEG_QUALITIES = [75, 60]
/** Base64 adds a third, and Vision rejects a request over 10 MB, so keep the JPEG under 6 MB (≈ 8 MB
 *  encoded) with headroom for the JSON around it. */
const MAX_OUTPUT_BYTES = 6 * 1024 * 1024
const REDUCED_LONG_SIDE = 2500

export type PreparedReceiptImage = {
  buffer: Buffer
  mimeType: 'image/jpeg'
  /** What was actually done, in order — for the import log. */
  steps: string[]
  width: number
  height: number
  bytesBefore: number
  bytesAfter: number
}

type Gray = { data: Buffer; width: number; height: number }

const rawOptions = (image: Gray) => ({ raw: { width: image.width, height: image.height, channels: 1 as const } })

async function toGray(pipeline: Sharp): Promise<Gray> {
  const { data, info } = await pipeline.grayscale().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

/** How uneven the paper's lighting is, as `dark / bright` of the estimated background (1 = even).
 *  The background is a median of a *shrunken* copy, so text strokes (a minority of pixels) drop out
 *  of the estimate instead of dragging it down — a plain blur would treat dense text as shadow. */
async function estimateBackground(image: Gray): Promise<{ small: Gray; ratio: number }> {
  const small = await toGray(sharp(image.data, rawOptions(image)).resize({ width: 200, height: 200, fit: 'inside' }).median(9))
  const sorted = Uint8Array.from(small.data).sort()
  const at = (q: number) => sorted[Math.floor(q * (sorted.length - 1))]
  return { small, ratio: at(0.95) === 0 ? 1 : at(0.05) / at(0.95) }
}

/** Flat-field correction: divides the image by its estimated background, which removes a smooth
 *  shadow or lighting gradient so a single global threshold (what OCR engines effectively use) can
 *  separate text from paper everywhere. `colour-dodge` computes base / (1 − top), so compositing the
 *  negated background gives base / background. */
async function flattenLighting(image: Gray, backgroundSmall: Gray): Promise<Gray> {
  const background = await toGray(
    sharp(backgroundSmall.data, rawOptions(backgroundSmall)).resize({ width: image.width, height: image.height, fit: 'fill', kernel: 'cubic' }).negate(),
  )
  return toGray(
    sharp(image.data, rawOptions(image)).composite([{ input: background.data, raw: rawOptions(background).raw, blend: 'colour-dodge' }]),
  )
}

/** Otsu-free text mask: a pixel is "ink" when clearly darker than the paper around it. Comparing
 *  against the local background (rather than one global threshold) keeps a dark table edge or a
 *  shadow from being mistaken for text. Returns interleaved x,y coordinates. */
async function findInkPoints(image: Gray): Promise<{ points: Int32Array; width: number; height: number }> {
  const small = await toGray(sharp(image.data, rawOptions(image)).resize({ width: 600, fit: 'inside' }))
  const background = await toGray(sharp(small.data, rawOptions(small)).median(15))
  const found: number[] = []
  for (let y = 0; y < small.height; y++) {
    for (let x = 0; x < small.width; x++) {
      const i = y * small.width + x
      if (background.data[i] > 60 && small.data[i] < 0.7 * background.data[i]) found.push(x, y)
    }
  }
  return { points: Int32Array.from(found), width: small.width, height: small.height }
}

/** Estimates how many degrees the text lines are tilted, by finding the rotation that makes the
 *  ink pixels pile up into the fewest, sharpest horizontal rows (projection-profile method — text
 *  lines are the dominant structure on a receipt). Returns the angle and a confidence `gain`: how
 *  much sharper the rows are at that angle than unrotated. */
export function estimateSkew(points: Int32Array, width: number, height: number): { angle: number; gain: number } {
  if (points.length < 400) return { angle: 0, gain: 1 } // fewer than 200 ink pixels: nothing to judge by
  const offset = Math.ceil(width * Math.sin((MAX_SKEW_DEGREES + 1) * (Math.PI / 180))) + 1
  const bins = new Int32Array(height + 2 * offset + 2)

  const score = (degrees: number): number => {
    bins.fill(0)
    const radians = degrees * (Math.PI / 180)
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    for (let i = 0; i < points.length; i += 2) bins[Math.round(points[i + 1] * cos - points[i] * sin) + offset] += 1
    let sumOfSquares = 0
    for (const count of bins) sumOfSquares += count * count
    return sumOfSquares
  }

  const unrotated = score(0)
  let bestAngle = 0
  let bestScore = unrotated
  for (let degrees = -MAX_SKEW_DEGREES; degrees <= MAX_SKEW_DEGREES; degrees += 0.5) {
    const s = score(degrees)
    if (s > bestScore) {
      bestScore = s
      bestAngle = degrees
    }
  }
  const coarse = bestAngle
  for (let degrees = coarse - 0.5; degrees <= coarse + 0.5; degrees += 0.1) {
    const s = score(degrees)
    if (s > bestScore) {
      bestScore = s
      bestAngle = degrees
    }
  }
  return { angle: Math.round(bestAngle * 10) / 10, gain: bestScore / unrotated }
}

/** Cleans a receipt photo up so OCR reads it more reliably. In order:
 *  1. apply the camera's EXIF orientation (a photo taken sideways is otherwise read sideways);
 *  2. convert to grayscale — colour carries nothing OCR needs, and it removes colour noise;
 *  3. cap the size (see MAX_LONG_SIDE);
 *  4. only if the lighting is measurably uneven, flatten it (see `flattenLighting`) — applying it
 *     to an already even photo hurt small/blurry text in testing, so it is conditional;
 *  5. stretch contrast, so faded thermal-paper print gets a full tonal range;
 *  6. straighten a clearly tilted receipt.
 *  Output is a grayscale JPEG. Throws if the bytes are not a decodable image — the caller keeps the
 *  original and carries on. Deliberately no binarization or sharpening: both can destroy thin
 *  strokes and OCR engines do their own thresholding. */
export async function prepareReceiptImageForOcr(input: Buffer): Promise<PreparedReceiptImage> {
  const steps: string[] = ['auto-rotate', 'grayscale']
  let gray = await toGray(
    sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: MAX_LONG_SIDE, height: MAX_LONG_SIDE, fit: 'inside', withoutEnlargement: true }),
  )

  const { small, ratio } = await estimateBackground(gray)
  if (ratio < UNEVEN_LIGHTING_RATIO) {
    gray = await flattenLighting(gray, small)
    steps.push('flatten-lighting')
  }

  gray = await toGray(sharp(gray.data, rawOptions(gray)).normalise({ lower: 1, upper: 99 }))
  steps.push('contrast')

  const ink = await findInkPoints(gray)
  const skew = estimateSkew(ink.points, ink.width, ink.height)
  let pipeline = sharp(gray.data, rawOptions(gray))
  if (Math.abs(skew.angle) >= MIN_SKEW_DEGREES && Math.abs(skew.angle) <= MAX_SKEW_DEGREES && skew.gain >= MIN_SKEW_GAIN) {
    // The estimate is the angle the *text* is rotated by; rotating the image the opposite way
    // straightens it. Corners exposed by the rotation are filled with white paper colour.
    pipeline = pipeline.rotate(-skew.angle, { background: '#ffffff' })
    steps.push(`deskew:${skew.angle}`)
  }

  // `b-w` makes it a true single-channel JPEG (otherwise sharp writes three identical channels).
  // Very noisy photos compress poorly, so step quality down — and finally resolution — until the
  // result fits the OCR request limit rather than sending something the API will refuse.
  const encode = (quality: number, maxSide?: number) => {
    const candidate = pipeline.clone()
    if (maxSide) candidate.resize({ width: maxSide, height: maxSide, fit: 'inside' })
    return candidate.toColourspace('b-w').jpeg({ quality }).toBuffer({ resolveWithObject: true })
  }
  let encoded = await encode(OUTPUT_JPEG_QUALITY)
  for (const quality of FALLBACK_JPEG_QUALITIES) {
    if (encoded.data.length <= MAX_OUTPUT_BYTES) break
    encoded = await encode(quality)
    steps.push(`jpeg-quality:${quality}`)
  }
  if (encoded.data.length > MAX_OUTPUT_BYTES) {
    encoded = await encode(FALLBACK_JPEG_QUALITIES[FALLBACK_JPEG_QUALITIES.length - 1], REDUCED_LONG_SIDE)
    steps.push(`downscale:${REDUCED_LONG_SIDE}`)
  }
  const { data, info } = encoded
  return { buffer: data, mimeType: 'image/jpeg', steps, width: info.width, height: info.height, bytesBefore: input.length, bytesAfter: data.length }
}
