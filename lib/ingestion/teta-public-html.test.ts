import { describe, expect, it } from 'vitest'
import {
  decodeTetaHtml,
  htmlToTetaText,
  isTetaPathDisallowed,
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
    expect(decodeTetaHtml('&amp;lt; &amp;amp; &#xA0; &#160;')).toBe('&lt; &amp;    ')

    expect(htmlToTetaText('<h1>Krém</h1><script>ignore this</script><script type="text/javascript" >ignore this too</script ><script>ignore tabbed close</script\t\n bar><style>ignore</style><style >ignore this too</style > 50&nbsp;ml')).toBe('Krém 50 ml')
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

  it('classifies an explicitly conditional multi-buy price and reads EAN from meta attributes', () => {
    const html = `
      <meta content="8591234567890" itemprop="gtin13">
      <nav aria-label="breadcrumb"><a>Hygiena</a><a>Péče o zuby</a></nav>
      <h1>Colgate Triple Action zubní pasta 75 ml</h1>
      <div>29,90 Kč</div>
      <div>14,95 Kč*</div>
      <p>*za 1 ks při koupi 2 ks produktů značek Colgate, Palmolive a Protex v libovolné kombinaci</p>
      <div>199,33 Kč/LIT</div>
      <div>Dostupné online</div><div>Kód: 270128</div>
    `
    const product = parseTetaPublicProductPage(html, 'https://www.tetadrogerie.cz/eshop/katalog/colgate')
    expect(product.ean).toBe('8591234567890')
    expect(product.prices).toEqual([29.9, 14.95])
    expect(product.priceCandidates).toMatchObject([
      { amount: 29.9, role: 'displayed_price' },
      { amount: 14.95, role: 'conditional_promotion', conditionText: expect.stringContaining('při koupi 2 ks') },
    ])
    expect(product.extractionWarnings).not.toContain('one or more price candidates need role verification')
    expect(product.missingFields).not.toContain('ean')
  })

  it('leaves uncertain fields blank and explains missing source fields', () => {
    const product = parseTetaPublicProductPage('<main><h1>Test</h1></main>', 'https://www.tetadrogerie.cz/eshop/katalog/test')
    expect(product.name).toBe('Test')
    expect(product.prices).toEqual([])
    expect(product.extractionWarnings).toContain('source product code not found')
    expect(product.extractionWarnings).toContain('no displayed price found')
    expect(product.missingFields).toContain('ean')
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


describe('Teta robots.txt path policy', () => {
  it('blocks disallowed path prefixes and allows public catalog paths', () => {
    const rules = ['/api/', '/inventory', '/price', '/_nuxt/']
    expect(isTetaPathDisallowed('/api/products', rules)).toBe(true)
    expect(isTetaPathDisallowed('/inventory/123', rules)).toBe(true)
    expect(isTetaPathDisallowed('/price', rules)).toBe(true)
    expect(isTetaPathDisallowed('/eshop/produkty/vse', rules)).toBe(false)
    expect(isTetaPathDisallowed('/eshop/katalog/product', rules)).toBe(false)
  })
})
