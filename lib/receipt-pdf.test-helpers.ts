// Test-only: builds a tiny valid PDF with a real text layer, so the PDF text-layer path can be
// tested without committing an actual receipt (which carries personal data). Not imported by any
// application code. ASCII only — the standard Helvetica font has no Czech letters.

/** A one-page PDF whose text layer contains `lines`, one per line. `withText: false` produces a page
 *  with no text at all (what an image-only scan looks like to a text extractor). */
export function makeTextPdf(lines: string[], options: { withText?: boolean } = {}): Buffer {
  const escape = (line: string) => line.replace(/[\\()]/g, '\\$&')
  const content =
    options.withText === false ? '' : `BT /F1 10 Tf 12 TL 20 800 Td ${lines.map((line) => `(${escape(line)}) Tj T*`).join(' ')} ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefStart = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

/** Lines of an Albert-style e-receipt, ASCII only, with two weighed items. */
export const ALBERT_STYLE_RECEIPT_LINES = [
  'Polozka Cena',
  'JOJO MARSHMALL.80G',
  '1 x 13.90 Kc 13.90 Kc',
  'A',
  'JABLKA GALA',
  '0.43 x 34.90 Kc',
  'P',
  '15.00 Kc',
  'A',
  'BRAMBORY KONZ POZDNI',
  '0.935 x 19.90 Kc',
  'P',
  '18.60 Kc',
  'A',
  'Celkem 47.50 Kc',
]
