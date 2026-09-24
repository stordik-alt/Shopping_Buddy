import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from '@/lib/db/schema'
import {
  initialExpenses,
  initialHousehold,
  initialItems,
  initialNotifications,
  initialPurchaseHistory,
  initialShoppingLists,
  PRODUCT_PRICES,
  stores as mockStores,
} from '@/lib/mock-data'
import type { ItemCategory, ItemUnit } from '@/lib/types'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

const CATEGORIES: ItemCategory[] = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní']

const PRODUCT_DEFAULTS: Record<string, { category: ItemCategory; unit: ItemUnit }> = {
  'Mléko polotučné': { category: 'Potraviny', unit: 'l' },
  Banány: { category: 'Potraviny', unit: 'kg' },
  'Kuřecí prsa': { category: 'Potraviny', unit: 'kg' },
  'Toaletní papír': { category: 'Drogerie', unit: 'ks' },
  Vejce: { category: 'Potraviny', unit: 'ks' },
  Rýže: { category: 'Potraviny', unit: 'kg' },
  Pečivo: { category: 'Potraviny', unit: 'ks' },
}

function collectProductNames() {
  const names = new Set<string>()
  for (const item of initialItems) names.add(item.name)
  for (const product of PRODUCT_PRICES) names.add(product.productName)
  for (const record of initialPurchaseHistory) for (const item of record.items) names.add(item.name)
  for (const store of mockStores) for (const product of store.availableProducts) names.add(product)
  return Array.from(names)
}

async function main() {
  console.log('Seeding product categories...')
  const categoryRows = await db
    .insert(schema.productCategories)
    .values(CATEGORIES.map((name) => ({ name })))
    .returning()
  const categoryIdByName = new Map(categoryRows.map((row) => [row.name, row.id]))

  console.log('Seeding products...')
  const productNames = collectProductNames()
  const productRows = await db
    .insert(schema.products)
    .values(
      productNames.map((name) => {
        const defaults = PRODUCT_DEFAULTS[name] ?? { category: 'Potraviny' as ItemCategory, unit: 'ks' as ItemUnit }
        return { name, categoryId: categoryIdByName.get(defaults.category)!, defaultUnit: defaults.unit }
      }),
    )
    .returning()
  const productIdByName = new Map(productRows.map((row) => [row.name, row.id]))

  console.log('Seeding stores and locations...')
  const chains = Array.from(new Set(mockStores.map((store) => store.chain)))
  const storeRows = await db
    .insert(schema.stores)
    .values(chains.map((chain) => ({ chain })))
    .returning()
  const storeIdByChain = new Map(storeRows.map((row) => [row.chain, row.id]))

  const locationRows = await db
    .insert(schema.storeLocations)
    .values(
      mockStores.map((store) => ({
        storeId: storeIdByChain.get(store.chain)!,
        name: store.name,
        address: store.address,
        city: store.city,
        country: store.country,
        // Seed fixtures have GPS coordinates; production OCR-created branches may legitimately not.
        lat: store.gps?.lat.toString() ?? null,
        lng: store.gps?.lng.toString() ?? null,
        hours: store.hours,
      })),
    )
    .returning()
  const locationIdByChain = new Map<string, string>(mockStores.map((store, index) => [store.chain, locationRows[index].id]))

  console.log('Seeding prices and deals...')
  for (const product of PRODUCT_PRICES) {
    const productId = productIdByName.get(product.productName)
    if (!productId) continue
    for (const price of product.prices) {
      const storeLocationId = locationIdByChain.get(price.store)
      if (!storeLocationId) continue
      await db.insert(schema.prices).values({
        productId,
        storeId: storeIdByChain.get(price.store)!,
        storeLocationId,
        regularPrice: price.regularPrice.toString(),
        unit: price.unit,
        unitPrice: price.unitPrice.toString(),
        observedAt: price.recordedAt,
        validFrom: price.recordedAt,
      })
      if (price.dealPrice && price.dealValidUntil) {
        await db.insert(schema.deals).values({
          productId,
          storeId: storeIdByChain.get(price.store)!,
          storeLocationId,
          dealPrice: price.dealPrice.toString(),
          validFrom: price.recordedAt,
          validUntil: price.dealValidUntil,
        })
      }
    }
  }

  console.log('Seeding household...')
  const [household] = await db
    .insert(schema.households)
    .values({ name: initialHousehold.name, monthlyBudget: initialHousehold.monthlyBudget.toString() })
    .returning()

  // Demo fixtures only — not linked to a Neon Auth account (userId left null).
  // A real household is created for a signed-up user on first login; see lib/db/queries.ts.
  for (const member of initialHousehold.members) {
    const [memberRow] = await db
      .insert(schema.householdMembers)
      .values({
        householdId: household.id,
        name: member.name,
        role: member.role === 'Správce domácnosti' ? 'owner' : 'member',
      })
      .returning()
    await db.insert(schema.profiles).values({
      memberId: memberRow.id,
      age: member.age,
      favoriteFoods: member.favoriteFoods,
      dislikedFoods: member.dislikedFoods,
      allergies: member.allergies,
    })
  }

  console.log('Seeding children...')
  await db.insert(schema.children).values(
    initialHousehold.children.map((child) => ({
      householdId: household.id,
      name: child.name,
      age: child.age,
      preferences: child.preferences,
      specialNeeds: child.specialNeeds || null,
    })),
  )

  console.log('Seeding preferences...')
  await db.insert(schema.preferences).values({
    householdId: household.id,
    preferredBrands: initialHousehold.preferences.preferredBrands,
    preferredStores: initialHousehold.preferences.preferredStores,
    preferredProducts: initialHousehold.preferences.preferredProducts,
    excludedProducts: initialHousehold.preferences.excludedProducts,
    priceSensitivity:
      initialHousehold.preferences.priceSensitivity === 'Nejlevnější'
        ? 'cheapest'
        : initialHousehold.preferences.priceSensitivity === 'Kvalita především'
          ? 'quality_first'
          : 'balanced',
    qualityPreference: initialHousehold.preferences.qualityPreference === 'Prémiová' ? 'premium' : 'standard',
    preferCzechProducts: initialHousehold.preferences.preferCzechProducts,
    restrictions: initialHousehold.restrictions,
  })

  console.log('Seeding shopping lists and items...')
  const listRows = await db
    .insert(schema.shoppingLists)
    .values(initialShoppingLists.map((name) => ({ householdId: household.id, name })))
    .returning()
  const mainListId = listRows[0].id

  await db.insert(schema.shoppingListItems).values(
    initialItems.map((item) => ({
      listId: mainListId,
      productId: productIdByName.get(item.name) ?? null,
      name: item.name,
      detail: item.detail,
      price: item.price.toString(),
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
      done: item.done,
      priority: item.priority,
      note: item.note ?? null,
      preferredStoreLocationId: item.store ? (locationIdByChain.get(item.store) ?? null) : null,
      onSale: item.onSale ?? false,
    })),
  )

  console.log('Seeding purchase history...')
  for (const record of initialPurchaseHistory) {
    const [purchase] = await db
      .insert(schema.purchases)
      .values({
        householdId: household.id,
        storeLocationId: record.store ? (locationIdByChain.get(record.store) ?? null) : null,
        date: record.date,
        total: record.total.toString(),
        discount: record.discount != null ? record.discount.toString() : null,
      })
      .returning()
    await db.insert(schema.purchaseItems).values(
      record.items.map((item) => ({
        purchaseId: purchase.id,
        productId: productIdByName.get(item.name) ?? null,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        price: item.price.toString(),
      })),
    )
  }

  console.log('Seeding expenses...')
  await db.insert(schema.expenses).values(
    initialExpenses.map((expense) => ({
      householdId: household.id,
      amount: expense.amount.toString(),
      note: expense.note,
      category: expense.category,
      date: expense.date,
    })),
  )

  console.log('Seeding budget...')
  await db.insert(schema.budgets).values({
    householdId: household.id,
    month: '2026-09-01',
    amount: initialHousehold.monthlyBudget.toString(),
  })

  console.log('Seeding notifications...')
  await db.insert(schema.notifications).values(
    initialNotifications.map((notification) => ({
      householdId: household.id,
      title: notification.title,
      detail: notification.detail,
      unread: notification.unread,
    })),
  )

  console.log('Seed complete. Household id:', household.id)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
