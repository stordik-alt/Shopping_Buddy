import { writeFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProductVisual } from '../components/ui/product-visual'
import {
  CATEGORY_VISUALS,
  PRODUCT_TYPE_VISUALS,
  SUBCATEGORY_VISUALS,
  type ProductVisual as ProductVisualData,
} from '../lib/product-visuals'

const visuals = [
  ...Object.values(PRODUCT_TYPE_VISUALS),
  ...Object.values(SUBCATEGORY_VISUALS),
  ...Object.values(CATEGORY_VISUALS),
]
const unique = new Map<string, ProductVisualData>()
for (const visual of visuals) unique.set(`${visual.shape}:${visual.tint}`, visual)

const illustrations = Object.fromEntries([...unique].map(([key, visual]) => {
  const markup = renderToStaticMarkup(createElement(ProductVisual, { visual }))
  const xml = markup
    .replace(' class="size-full"', '')
    .replace(' aria-hidden="true"', '')
  return [key, xml]
}))

async function main() {
  await writeFile(new URL('../apps/mobile/lib/product-illustrations.json', import.meta.url), `${JSON.stringify(illustrations)}\n`)
  console.log(`Generated ${Object.keys(illustrations).length} shared product illustrations.`)
}

void main()
