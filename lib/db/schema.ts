import { relations } from 'drizzle-orm'
import { boolean, date, index, integer, numeric, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// --- Enums -----------------------------------------------------------------

export const memberRoleEnum = pgEnum('member_role', ['owner', 'member'])
export const priceSensitivityEnum = pgEnum('price_sensitivity', ['cheapest', 'balanced', 'quality_first'])
export const qualityPreferenceEnum = pgEnum('quality_preference', ['standard', 'premium'])
export const itemCategoryEnum = pgEnum('item_category', ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní'])
export const itemUnitEnum = pgEnum('item_unit', ['ks', 'kg', 'g', 'l', 'ml'])
export const itemPriorityEnum = pgEnum('item_priority', ['Nízká', 'Normální', 'Vysoká'])
export const storeChainEnum = pgEnum('store_chain', ['Lidl', 'Albert', 'Kaufland', 'Billa', 'Penny', 'JIP'])
export const invitationStatusEnum = pgEnum('invitation_status', ['pending', 'accepted', 'revoked'])

// --- Accounts & households --------------------------------------------------
// Identity/login lives in the `neon_auth` schema (Neon Auth / Managed Better Auth),
// not here — there is no local `users` table. `household_members.userId` references
// `neon_auth.user(id)` via a hand-written migration (see lib/db/migrations), because
// Neon manages that schema directly and it isn't declared in this Drizzle schema.

export const households = pgTable('households', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  monthlyBudget: numeric('monthly_budget', { precision: 10, scale: 2 }).notNull().default('0'),
  // ISO 4217 code. The household's home currency — all its own money values (budget, expenses,
  // purchases) are denominated in this. Defaults to CZK; the first market is Czech Republic
  // (docs/00_PROJECT_CONTEXT.md), but the column exists so a future household isn't hard-coded to it.
  currency: text('currency').notNull().default('CZK'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// Membership: links a user account to a household with a permission role.
export const householdMembers = pgTable(
  'household_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    // References neon_auth.user(id); no Drizzle-level FK because that schema is managed by Neon Auth.
    userId: uuid('user_id'),
    name: text('name').notNull(),
    role: memberRoleEnum('role').notNull().default('member'),
    joinedAt: timestamp('joined_at').notNull().defaultNow(),
  },
  // Looked up by userId on every authenticated request (lib/auth/authorize.ts's requireHousehold()) — the single hottest query in the app.
  (table) => [index('household_members_user_id_idx').on(table.userId)],
)

// A pending (or resolved) invite for someone to join a household. Token-based join link
// rather than emailed automatically — no email-sending integration is provisioned yet.
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    token: text('token').notNull().unique(),
    status: invitationStatusEnum('status').notNull().default('pending'),
    invitedByMemberId: uuid('invited_by_member_id').references(() => householdMembers.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  // Looked up by email on every first login (lib/db/queries.ts's getHouseholdData()) to check for a pending invite.
  (table) => [index('invitations_email_idx').on(table.email)],
)

// Extended profile data for a household member (food preferences, allergies).
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').notNull().unique().references(() => householdMembers.id, { onDelete: 'cascade' }),
  age: integer('age').notNull(),
  favoriteFoods: text('favorite_foods').array().notNull().default([]),
  dislikedFoods: text('disliked_foods').array().notNull().default([]),
  allergies: text('allergies').array().notNull().default([]),
})

export const children = pgTable('children', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  age: integer('age').notNull(),
  preferences: text('preferences').notNull().default(''),
  specialNeeds: text('special_needs'),
})

// Household-level shopping preferences (one row per household).
export const preferences = pgTable('preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().unique().references(() => households.id, { onDelete: 'cascade' }),
  preferredBrands: text('preferred_brands').array().notNull().default([]),
  preferredStores: text('preferred_stores').array().notNull().default([]),
  preferredProducts: text('preferred_products').array().notNull().default([]),
  excludedProducts: text('excluded_products').array().notNull().default([]),
  priceSensitivity: priceSensitivityEnum('price_sensitivity').notNull().default('balanced'),
  qualityPreference: qualityPreferenceEnum('quality_preference').notNull().default('standard'),
  preferCzechProducts: boolean('prefer_czech_products').notNull().default(false),
  restrictions: text('restrictions').array().notNull().default([]),
})

// --- Product catalog & stores ------------------------------------------------

export const productCategories = pgTable('product_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: itemCategoryEnum('name').notNull().unique(),
})

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  categoryId: uuid('category_id').notNull().references(() => productCategories.id),
  defaultUnit: itemUnitEnum('default_unit').notNull().default('ks'),
})

// A retail chain (brand), e.g. Lidl. First market: Česká republika, architecture allows more.
export const stores = pgTable('stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  chain: storeChainEnum('chain').notNull().unique(),
})

// A physical branch of a store chain.
export const storeLocations = pgTable('store_locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  country: text('country').notNull().default('Česká republika'),
  lat: numeric('lat', { precision: 9, scale: 6 }).notNull(),
  lng: numeric('lng', { precision: 9, scale: 6 }).notNull(),
  hours: text('hours').notNull(),
})

export const prices = pgTable('prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  storeLocationId: uuid('store_location_id').notNull().references(() => storeLocations.id, { onDelete: 'cascade' }),
  regularPrice: numeric('regular_price', { precision: 10, scale: 2 }).notNull(),
  // ISO 4217 code — per docs/03_DATABASE.md rule 9 ("Prices must have explicit currency").
  // Lives on the price row (not just the store) since a store's prices could in principle span
  // currencies without this, e.g. a cross-border retailer.
  currency: text('currency').notNull().default('CZK'),
  unit: itemUnitEnum('unit').notNull(),
  unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
  recordedAt: date('recorded_at').notNull(),
})

export const deals = pgTable('deals', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  storeLocationId: uuid('store_location_id').notNull().references(() => storeLocations.id, { onDelete: 'cascade' }),
  dealPrice: numeric('deal_price', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('CZK'),
  validFrom: date('valid_from').notNull(),
  validUntil: date('valid_until').notNull(),
})

// --- Shopping lists ----------------------------------------------------------

export const shoppingLists = pgTable('shopping_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const shoppingListItems = pgTable('shopping_list_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  listId: uuid('list_id').notNull().references(() => shoppingLists.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  detail: text('detail').notNull().default(''),
  price: numeric('price', { precision: 10, scale: 2 }).notNull().default('0'),
  quantity: integer('quantity').notNull().default(1),
  unit: itemUnitEnum('unit').notNull().default('ks'),
  category: itemCategoryEnum('category').notNull().default('Ostatní'),
  done: boolean('done').notNull().default(false),
  priority: itemPriorityEnum('priority').notNull().default('Normální'),
  note: text('note'),
  preferredStoreLocationId: uuid('preferred_store_location_id').references(() => storeLocations.id, { onDelete: 'set null' }),
  onSale: boolean('on_sale').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  // Set once a "shopping reminder" notification has covered this item (see the cron job at
  // app/api/cron/shopping-reminders). Null means never reminded yet. Prevents the same
  // still-undone item from generating a new reminder every day the job runs.
  remindedAt: timestamp('reminded_at'),
})

// --- Purchases & budgets ------------------------------------------------------

export const purchases = pgTable('purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  storeLocationId: uuid('store_location_id').references(() => storeLocations.id, { onDelete: 'set null' }),
  date: date('date').notNull(),
  total: numeric('total', { precision: 10, scale: 2 }).notNull(),
  discount: numeric('discount', { precision: 10, scale: 2 }),
})

export const purchaseItems = pgTable('purchase_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  purchaseId: uuid('purchase_id').notNull().references(() => purchases.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  quantity: integer('quantity').notNull().default(1),
  unit: itemUnitEnum('unit').notNull().default('ks'),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
})

export const budgets = pgTable('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  month: date('month').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
})

export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  note: text('note').notNull().default(''),
  category: itemCategoryEnum('category').notNull().default('Ostatní'),
  date: date('date').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// --- Meal plans & notifications ------------------------------------------------

export const mealPlans = pgTable('meal_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  weekStart: date('week_start').notNull(),
  budgetLimit: numeric('budget_limit', { precision: 10, scale: 2 }).notNull(),
  estimatedTotal: numeric('estimated_total', { precision: 10, scale: 2 }).notNull(),
  plan: text('plan').notNull(), // JSON-serialized WeeklyMealPlan snapshot
  generatedAt: timestamp('generated_at').notNull().defaultNow(),
})

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  detail: text('detail').notNull(),
  unread: boolean('unread').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// --- Relations -----------------------------------------------------------------

export const householdsRelations = relations(households, ({ many, one }) => ({
  members: many(householdMembers),
  children: many(children),
  preferences: one(preferences, { fields: [households.id], references: [preferences.householdId] }),
  shoppingLists: many(shoppingLists),
  purchases: many(purchases),
  budgets: many(budgets),
  expenses: many(expenses),
  mealPlans: many(mealPlans),
  notifications: many(notifications),
  invitations: many(invitations),
}))

export const invitationsRelations = relations(invitations, ({ one }) => ({
  household: one(households, { fields: [invitations.householdId], references: [households.id] }),
  invitedByMember: one(householdMembers, { fields: [invitations.invitedByMemberId], references: [householdMembers.id] }),
}))

export const householdMembersRelations = relations(householdMembers, ({ one }) => ({
  household: one(households, { fields: [householdMembers.householdId], references: [households.id] }),
  profile: one(profiles, { fields: [householdMembers.id], references: [profiles.memberId] }),
}))

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(productCategories, { fields: [products.categoryId], references: [productCategories.id] }),
  prices: many(prices),
  deals: many(deals),
}))

export const storesRelations = relations(stores, ({ many }) => ({
  locations: many(storeLocations),
}))

export const storeLocationsRelations = relations(storeLocations, ({ one, many }) => ({
  store: one(stores, { fields: [storeLocations.storeId], references: [stores.id] }),
  prices: many(prices),
  deals: many(deals),
}))

export const pricesRelations = relations(prices, ({ one }) => ({
  product: one(products, { fields: [prices.productId], references: [products.id] }),
  storeLocation: one(storeLocations, { fields: [prices.storeLocationId], references: [storeLocations.id] }),
}))

export const dealsRelations = relations(deals, ({ one }) => ({
  product: one(products, { fields: [deals.productId], references: [products.id] }),
  storeLocation: one(storeLocations, { fields: [deals.storeLocationId], references: [storeLocations.id] }),
}))

export const shoppingListsRelations = relations(shoppingLists, ({ one, many }) => ({
  household: one(households, { fields: [shoppingLists.householdId], references: [households.id] }),
  items: many(shoppingListItems),
}))

export const shoppingListItemsRelations = relations(shoppingListItems, ({ one }) => ({
  list: one(shoppingLists, { fields: [shoppingListItems.listId], references: [shoppingLists.id] }),
  product: one(products, { fields: [shoppingListItems.productId], references: [products.id] }),
  preferredStoreLocation: one(storeLocations, { fields: [shoppingListItems.preferredStoreLocationId], references: [storeLocations.id] }),
}))

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  household: one(households, { fields: [purchases.householdId], references: [households.id] }),
  storeLocation: one(storeLocations, { fields: [purchases.storeLocationId], references: [storeLocations.id] }),
  items: many(purchaseItems),
}))

export const purchaseItemsRelations = relations(purchaseItems, ({ one }) => ({
  purchase: one(purchases, { fields: [purchaseItems.purchaseId], references: [purchases.id] }),
  product: one(products, { fields: [purchaseItems.productId], references: [products.id] }),
}))
