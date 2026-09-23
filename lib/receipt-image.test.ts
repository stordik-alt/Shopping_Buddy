import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { detectReceiptFileType, estimateSkew, prepareReceiptImageForOcr } from '@/lib/receipt-image'

// Synthetic "receipts": horizontal dark bars stand in for lines of text. That is deliberately
// font-independent (the machine running the tests may not have the same fonts) while still giving
// the tilt estimator the dominant structure a real receipt has.
const WIDTH = 900
const HEIGHT = 700
const BAR_ROWS = Array.from({ length: 14 }, (_, i) => 90 + i * 40)

function receiptSvg({ ink = '#111', paper = '#fff', gradientOpacity = 0 }: { ink?: string; paper?: string; gradientOpacity?: number } = {}): Buffer {
  // Thin vertical strokes (2 px wide, every 7 px) rather than solid bars: a solid 14 px bar would
  // be read as background by the local-contrast text detector, unlike real thin print strokes.
  const bars = BAR_ROWS.map((y, i) => {
    const strokes = Math.floor((300 + ((i * 97) % 420)) / 7)
    return Array.from({ length: strokes }, (_, k) => `<rect x="${60 + k * 7}" y="${y}" width="2" height="12" fill="${ink}"/>`).join('')
  }).join('')
  const shade = gradientOpacity
    ? `<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="${gradientOpacity}"/><stop offset="0.6" stop-color="#000" stop-opacity="0.05"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>`
    : ''
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><rect width="100%" height="100%" fill="${paper}"/>${bars}${shade}</svg>`)
}

const jpeg = (svg: Buffer) => sharp(svg).jpeg({ quality: 90 }).toBuffer()

/** Mean brightness (0–255) of a rectangle of the image. */
async function meanBrightness(image: Buffer, region: { left: number; top: number; width: number; height: number }): Promise<number> {
  // stats() analyses its *input*, ignoring pipeline steps, so crop to a buffer first.
  const cropped = await sharp(image).extract(region).grayscale().toBuffer()
  return (await sharp(cropped).stats()).channels[0].mean
}

describe('detectReceiptFileType', () => {
  it('recognises real JPEG, PNG and WebP files by their bytes', async () => {
    const svg = receiptSvg()
    expect(detectReceiptFileType(await sharp(svg).jpeg().toBuffer())).toEqual({ kind: 'supported', mimeType: 'image/jpeg', extension: 'jpg' })
    expect(detectReceiptFileType(await sharp(svg).png().toBuffer())).toEqual({ kind: 'supported', mimeType: 'image/png', extension: 'png' })
    expect(detectReceiptFileType(await sharp(svg).webp().toBuffer())).toEqual({ kind: 'supported', mimeType: 'image/webp', extension: 'webp' })
  })

  it('recognises a PDF, including one with a few bytes before the header', () => {
    expect(detectReceiptFileType(Buffer.from('%PDF-1.7\n1 0 obj'))).toEqual({ kind: 'supported', mimeType: 'application/pdf', extension: 'pdf' })
    expect(detectReceiptFileType(Buffer.from('\n\n  %PDF-1.4\n')).kind).toBe('supported')
  })

  it('recognises HEIC separately so the user can be told exactly what to do', () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(16)])
    const heif = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypmif1'), Buffer.alloc(16)])
    expect(detectReceiptFileType(heic)).toEqual({ kind: 'heic' })
    expect(detectReceiptFileType(heif)).toEqual({ kind: 'heic' })
  })

  it('does not accept anything else, whatever it claims to be', () => {
    expect(detectReceiptFileType(Buffer.from('<html><script>alert(1)</script></html>')).kind).toBe('unknown')
    expect(detectReceiptFileType(Buffer.from('MZ\x90\x00 pretend this is an exe')).kind).toBe('unknown')
    expect(detectReceiptFileType(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypavif'), Buffer.alloc(16)])).kind).toBe('unknown') // AVIF: not HEIC, not supported
    expect(detectReceiptFileType(Buffer.alloc(0)).kind).toBe('unknown')
    expect(detectReceiptFileType(Buffer.from([0xff, 0xd8])).kind).toBe('unknown') // truncated JPEG magic
  })
})

describe('estimateSkew', () => {
  /** Interleaved x,y points along `lines` horizontal text-like rows, tilted by `degrees`. */
  function tiltedLines(degrees: number): Int32Array {
    const radians = degrees * (Math.PI / 180)
    const points: number[] = []
    for (let line = 0; line < 12; line += 1) {
      for (let x = 40; x < 500; x += 1) {
        if (x % 7 < 4) continue // gaps like letters
        const y0 = 60 + line * 30
        points.push(x, Math.round(y0 + x * Math.tan(radians)), x, Math.round(y0 + 1 + x * Math.tan(radians)))
      }
    }
    return Int32Array.from(points)
  }

  it('finds no skew in straight lines', () => {
    const { angle } = estimateSkew(tiltedLines(0), 600, 800)
    expect(Math.abs(angle)).toBeLessThan(0.5)
  })

  it.each([5, -8])('finds a %d° tilt with high confidence', (degrees) => {
    const { angle, gain } = estimateSkew(tiltedLines(degrees), 600, 800)
    expect(Math.abs(angle - degrees)).toBeLessThanOrEqual(1)
    expect(gain).toBeGreaterThan(1.5)
  })

  it('refuses to judge from almost no ink', () => {
    expect(estimateSkew(Int32Array.from([1, 1, 2, 2]), 600, 800)).toEqual({ angle: 0, gain: 1 })
  })
})

describe('prepareReceiptImageForOcr', () => {
  it('outputs a grayscale JPEG and records what it did', async () => {
    const prepared = await prepareReceiptImageForOcr(await jpeg(receiptSvg()))
    const meta = await sharp(prepared.buffer).metadata()
    expect(prepared.mimeType).toBe('image/jpeg')
    expect(meta.format).toBe('jpeg')
    expect(meta.channels).toBe(1)
    expect(prepared.steps).toEqual(expect.arrayContaining(['auto-rotate', 'grayscale', 'contrast']))
    expect(prepared.width).toBe(meta.width)
    expect(prepared.bytesAfter).toBe(prepared.buffer.length)
  })

  it('applies the camera\'s EXIF orientation instead of leaving the photo sideways', async () => {
    // A 400×200 image tagged "rotate 90° to display" must come out 200×400.
    const sideways = await sharp({ create: { width: 400, height: 200, channels: 3, background: '#fff' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer()
    const prepared = await prepareReceiptImageForOcr(sideways)
    expect([prepared.width, prepared.height]).toEqual([200, 400])
  })

  it('stretches the contrast of faded print', async () => {
    const faded = await jpeg(receiptSvg({ ink: '#9a9a9a', paper: '#c8c8c8' })) // ink and paper only ~46 levels apart
    const { channels: before } = await sharp(faded).grayscale().stats()
    const prepared = await prepareReceiptImageForOcr(faded)
    const { channels: after } = await sharp(prepared.buffer).stats()
    expect(before[0].max - before[0].min).toBeLessThan(80)
    expect(after[0].max - after[0].min).toBeGreaterThan(200)
  })

  it('caps very large images so the OCR upload stays small', async () => {
    const huge = await sharp({ create: { width: 6000, height: 1200, channels: 3, background: '#fff' } }).png().toBuffer()
    const prepared = await prepareReceiptImageForOcr(huge)
    expect(Math.max(prepared.width, prepared.height)).toBe(4000)
    expect(prepared.width / prepared.height).toBeCloseTo(5, 1) // aspect ratio kept
  })

  it('keeps a very noisy photo under the OCR request size limit by lowering quality or resolution', async () => {
    // Pure noise barely compresses: at quality 90 this 4000×3000 image is ~6.4 MB.
    const noisy = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 40 } } }).jpeg({ quality: 90 }).toBuffer()
    const prepared = await prepareReceiptImageForOcr(noisy)
    expect(prepared.bytesAfter).toBeLessThanOrEqual(6 * 1024 * 1024)
    expect(prepared.steps.some((s) => s.startsWith('jpeg-quality:') || s.startsWith('downscale:'))).toBe(true)
  }, 30_000)

  describe('lighting', () => {
    it('evens out a strong shadow across the paper', async () => {
      const shadowed = await jpeg(receiptSvg({ gradientOpacity: 0.8 }))
      const blankStrip = (left: number) => ({ left, top: 5, width: 100, height: 40 }) // rows above the first bar
      const beforeGap = (await meanBrightness(shadowed, blankStrip(760))) - (await meanBrightness(shadowed, blankStrip(10)))

      const prepared = await prepareReceiptImageForOcr(shadowed)
      expect(prepared.steps).toContain('flatten-lighting')
      const afterGap = Math.abs((await meanBrightness(prepared.buffer, blankStrip(760))) - (await meanBrightness(prepared.buffer, blankStrip(10))))

      expect(beforeGap).toBeGreaterThan(120) // dark on the left, bright on the right
      expect(afterGap).toBeLessThan(25) // paper is now uniformly light
    })

    it('leaves already even lighting alone (flattening hurt small or blurry text in testing)', async () => {
      const prepared = await prepareReceiptImageForOcr(await jpeg(receiptSvg()))
      expect(prepared.steps).not.toContain('flatten-lighting')
    })
  })

  describe('tilt', () => {
    const tilted = (degrees: number) => sharp(receiptSvg()).rotate(degrees, { background: '#cfc8bd' }).jpeg({ quality: 85 }).toBuffer()

    it.each([8, -12])('straightens a receipt tilted by %d°', async (degrees) => {
      const prepared = await prepareReceiptImageForOcr(await tilted(degrees))
      const step = prepared.steps.find((s) => s.startsWith('deskew:'))
      expect(step).toBeDefined()
      expect(Math.abs(Number(step!.split(':')[1]) - degrees)).toBeLessThanOrEqual(1)

      // Black-box proof that it really is straight now: a second pass finds nothing left to fix.
      const again = await prepareReceiptImageForOcr(prepared.buffer)
      expect(again.steps.some((s) => s.startsWith('deskew:'))).toBe(false)
    })

    it('does not rotate a receipt that is already straight', async () => {
      const prepared = await prepareReceiptImageForOcr(await jpeg(receiptSvg()))
      expect(prepared.steps.some((s) => s.startsWith('deskew:'))).toBe(false)
    })

    it('does not rotate an image with no text-like structure', async () => {
      const blank = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#fff' } }).jpeg().toBuffer()
      const prepared = await prepareReceiptImageForOcr(blank)
      expect(prepared.steps.some((s) => s.startsWith('deskew:'))).toBe(false)
    })
  })

  describe('bad input', () => {
    it('throws for bytes that are not an image, so the caller can fall back to the original', async () => {
      await expect(prepareReceiptImageForOcr(Buffer.from('definitely not an image'))).rejects.toThrow()
    })

    it('throws for a truncated JPEG rather than returning half a picture', async () => {
      const whole = await jpeg(receiptSvg())
      await expect(prepareReceiptImageForOcr(whole.subarray(0, Math.floor(whole.length / 3)))).rejects.toThrow()
    })

    it('refuses an image that declares an enormous size (decompression bomb)', async () => {
      // 10000×10000 = 100 MP of flat colour compresses to a tiny file but would expand to ~100 MB.
      const bomb = await sharp({ create: { width: 10000, height: 10000, channels: 3, background: '#808080' } }).png({ compressionLevel: 9 }).toBuffer()
      expect(bomb.length).toBeLessThan(5 * 1024 * 1024) // fits under the app's 10 MB upload cap
      await expect(prepareReceiptImageForOcr(bomb)).rejects.toThrow(/pixel limit/i)
    }, 60_000)
  })
})
