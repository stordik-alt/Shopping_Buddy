export const MAX_RECEIPT_UPLOAD_BYTES = 4 * 1024 * 1024

/** Shown for a HEIC/HEIF photo, which neither the OCR nor most browsers can read. iPhones save HEIC
 *  by default, and so do Samsung and other Android phones with "high efficiency" photos turned on. */
export const HEIC_UNSUPPORTED_MESSAGE =
  'Fotka je ve formátu HEIC/HEIF, který zatím neumíme přečíst. iPhone: Nastavení › Fotoaparát › Formáty › Nejkompatibilnější. Samsung a jiné Androidy: ve Fotoaparátu › Nastavení › Formáty obrázků vypněte „Snímky s vysokou účinností“ (HEIF). Pak účtenku vyfoťte znovu.'

/** Whether the picked file is a HEIC/HEIF photo, judged by what the phone says about it (type or
 *  file name) — lets the app explain the problem before uploading. The server still decides from the
 *  file's own bytes (detectReceiptFileType). Pure/testable. */
export function isHeicFile(file: { name: string; type: string }): boolean {
  return /^image\/(heic|heif)(-sequence)?$/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
}

export const MAX_RECEIPT_IMAGE_DIMENSION = 2200

const JPEG_QUALITIES = [0.82, 0.72, 0.62, 0.52, 0.45] as const

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Obrázek se nepodařilo načíst.'))
    }

    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Obrázek se nepodařilo zkomprimovat.'))),
      'image/jpeg',
      quality,
    )
  })
}

/**
 * Keeps small receipt images untouched. Large camera/gallery images are resized and JPEG-compressed
 * before they are converted to base64 for the Server Action. PDFs are deliberately left untouched.
 */
export async function optimizeReceiptImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= MAX_RECEIPT_UPLOAD_BYTES) {
    return file
  }

  const image = await loadImage(file)
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight)
  const initialScale = Math.min(1, MAX_RECEIPT_IMAGE_DIMENSION / longestSide)

  let scale = initialScale

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Pro zpracování fotografie není dostupný canvas.')

    context.drawImage(image, 0, 0, width, height)

    for (const quality of JPEG_QUALITIES) {
      const blob = await canvasToBlob(canvas, quality)
      if (blob.size <= MAX_RECEIPT_UPLOAD_BYTES) {
        return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
          type: 'image/jpeg',
          lastModified: file.lastModified,
        })
      }
    }

    scale *= 0.8
  }

  // If compression could not reach the target, return the best practical representation rather
  // than blocking the receipt flow. The existing server-side 10 MB raw-file validation remains
  // the final safety limit.
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Pro zpracování fotografie není dostupný canvas.')
  context.drawImage(image, 0, 0, width, height)

  const blob = await canvasToBlob(canvas, 0.45)
  return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  })
}
