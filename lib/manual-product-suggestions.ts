import { ilike, inArray, or } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { normalizeProductText } from '@/lib/product-normalize'
import { PRODUCT_TYPES } from '@/lib/product-types'

const MIN_QUERY_LENGTH = 2
const MAX_RESULTS = 12
const MAX_QUERY_LENGTH = 80

export type ManualProductSuggestion = {
  label: string
  kind: 'type' | 'product'
  productId?: string
  productTypeId?: string
  productTypeKey?: string
  unit?: string | null
  category?: string | null
  subcategory?: string | null
  alias?: boolean
}

export async function searchManualProductSuggestions(query: string): Promise<ManualProductSuggestion[]> {
  if (typeof query !== 'string') throw new Error('Neplatné hledání.')
  const text = query.trim()
  if (text.length < MIN_QUERY_LENGTH || text.length > MAX_QUERY_LENGTH) return []
  const normalized = normalizeProductText(text)
  if (!normalized) return []

  const db = getDb()
  const [products, aliases] = await Promise.all([
    db.query.products.findMany({
      columns: { id: true, name: true, defaultUnit: true, productTypeId: true },
      with: {
        category: { columns: { name: true } },
        subcategory: { columns: { name: true } },
        productType: { columns: { id: true, key: true } },
      },
      where: or(
        ilike(schema.products.searchName, normalized + '%'),
        ilike(schema.products.searchName, '%' + normalized + '%'),
      ),
      limit: MAX_RESULTS,
    }),
    db.select({ productId: schema.productAliases.productId, alias: schema.productAliases.alias })
      .from(schema.productAliases)
      .where(ilike(schema.productAliases.normalizedAlias, '%' + normalized + '%'))
      .limit(MAX_RESULTS),
  ])

  const typeSuggestions: ManualProductSuggestion[] = PRODUCT_TYPES
    .filter((type) => {
      const name = normalizeProductText(type.name)
      return name === normalized || name.startsWith(normalized) || normalized.startsWith(name)
    })
    .slice(0, MAX_RESULTS)
    .map((type) => ({
      kind: 'type', label: type.name, productTypeKey: type.key, unit: type.unit,
      category: type.categories[0] ?? null, subcategory: type.subcategory,
    }))

  const productSuggestions: ManualProductSuggestion[] = products.map((product) => ({
    kind: 'product', label: product.name, productId: product.id,
    productTypeId: product.productType?.id, productTypeKey: product.productType?.key,
    unit: product.defaultUnit, category: product.category?.name ?? null,
    subcategory: product.subcategory?.name ?? null,
  }))

  const aliasIds = [...new Set(aliases.map((row) => row.productId))]
  const aliasProducts = aliasIds.length === 0 ? [] : await db.query.products.findMany({
    columns: { id: true, name: true, defaultUnit: true, productTypeId: true },
    with: { productType: { columns: { id: true, key: true } } },
    where: inArray(schema.products.id, aliasIds),
  })
  const aliasByProduct = new Map(aliases.map((row) => [row.productId, row.alias]))
  const aliasSuggestions: ManualProductSuggestion[] = aliasProducts.map((product) => ({
    kind: 'product', label: product.name, productId: product.id,
    productTypeId: product.productType?.id, productTypeKey: product.productType?.key,
    unit: product.defaultUnit, alias: true,
  }))

  const seen = new Set<string>()
  return [...typeSuggestions, ...productSuggestions, ...aliasSuggestions]
    .filter((item) => {
      const key = item.kind === 'type' ? 'type:' + item.productTypeKey : 'product:' + item.productId
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => {
      const an = normalizeProductText(a.label), bn = normalizeProductText(b.label)
      const rank = (name: string, alias: boolean | undefined) =>
        name === normalized ? 0 : name.startsWith(normalized) ? 1 : alias ? 2 : 3
      return rank(an, a.alias) - rank(bn, b.alias) || a.label.localeCompare(b.label, 'cs')
    })
    .slice(0, MAX_RESULTS)
}
