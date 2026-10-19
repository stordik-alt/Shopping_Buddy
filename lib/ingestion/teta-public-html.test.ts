import { describe, expect, it } from 'vitest'
import {
  decodeTetaHtml,
  htmlToTetaText,
  parseTetaCatalogLinks,
  parseTetaPublicProductPage,
} from '@/lib/ingestion/teta-public-html'

describe('Teta public HTML parser', () => {
  it('deduplicates product links and ignores non-Teta or non-catalog URLs', () => {
    const html = `
      <a href="/eshop/katalog/sample-product">Product</a>
      <a href="https://www.tetadrogerie.cz/eshop/katalog/sample-product?variant=1">Duplicate</a>
      <a href="/eshop/produkty/vse">Listing</a>
      <a href="https://evil.example/eshop/katalog/ignore">External</a>
      <a href="/api/products/ignore">API</a>
    `
    expect(parseTetaCatalogLinks(html)).toEqual([{
      url: 'https://www.tetadrogerie.cz/eshop/katalog/sample-product',
      slug: 'sample-product',
    }])
  })

  it('decodes Czech HTML entities and strips script/style content', () => {
    expect(decodeTetaHtml('Tip Line&nbsp;&amp; Zewa &#268;')).toBe('Tip Line & Zewa Č')
    expect(htmlToTetaText('<h1>Krém</h1><script>ignore this</script><style>ignore</style> 50&nbsp;ml')).toBe('Krém 50 ml')
  })

  it('extracts observable product detail fields without guessing price roles', () => {
    const html = `
      <nav aria-label="breadcrumb"><a>Domácnost</a><a>Úklid</a></nav>
      <main>
        <h1>Tip Line kapesníky 100 ks</h1>
        <div>17,90 Kč</div><div>9,90 Kč</div>
        <div>0,10 Kč/KS</div><div>Dostupné online</div>
        <div>Kód: 196442</div><div>EAN: 8591234567890</div>
      </main>
    `
    expect(parseTetaPublicProductPage(html, 'https://www.tetadrogerie.cz/eshop/katalog/sample')).toMatchObject({
      name: 'Tip Line kapesníky 100 ks',
      sourceCode: '196442',
      ean: '8591234567890',
      prices: [17.9, 9.9],
      unitPriceText: '0,10 Kč/KS',
      onlineAvailability: 'available',
      categoryPath: ['Domácnost', 'Úklid'],
    })
  })

  it('leaves uncertain fields blank and explains missing source fields', () => {
    const product = parseTetaPublicProductPage('<main><h1>Test</h1></main>', 'https://www.tetadrogerie.cz/eshop/katalog/test')
    expect(product.name).toBe('Test')
    expect(product.prices).toEqual([])
    expect(product.extractionWarnings).toContain('source product code not found')
    expect(product.extractionWarnings).toContain('no displayed price found')
    expect(product.extractionWarnings).toContain('EAN not exposed in visible text or JSON-LD')
  })
})


describe('Teta public JSON-LD fallback', () => {
  it('reads stable product identity fields from a public Product JSON-LD block', () => {
    const html = `
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Product","name":"Testovací produkt","sku":"SKU-42","gtin13":"8591234567890","brand":{"@type":"Brand","name":"TestBrand"},"category":"Domácnost > Úklid"}
      </script>
      <div>19,90 Kč</div>
    `
    expect(parseTetaPublicProductPage(html, 'https://www.tetadrogerie.cz/eshop/katalog/test')).toMatchObject({
      name: 'Testovací produkt',
      sourceCode: 'SKU-42',
      ean: '8591234567890',
      brand: 'TestBrand',
      categoryPath: ['Domácnost', 'Úklid'],
      prices: [19.9],
    })
  })
})
