import { relations } from 'drizzle-orm'
import { boolean, date, index, integer, numeric, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// --- Enums -----------------------------------------------------------------

export const memberRoleEnum = pgEnum('member_role', ['owner', 'member'])
export const priceSensitivityEnum = pgEnum('price_sensitivity', ['cheapest', 'balanced', 'quality_first'])
export const qualityPreferenceEnum = pgEnum('quality_preference', ['standard', 'premium'])
export const itemCategoryEnum = pgEnum('item_category', ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní'])
export const itemUnitEnum = pgEnum('item_unit', ['ks', 'kg', 'g', 'l', 'ml'])
export const itemPriorityEnum = pgEnum('item_priority', ['Nízká', 'Normální', 'Vysoká'])
export const invitationStatusEnum = pgEnum('invitation_status', ['pending', 'accepted', 'revoked'])
export const pantryLocationEnum = pgEnum('pantry_location', ['Spíž', 'Lednice', 'Mrazák', 'Domácnost'])
export const priceScopeEnum = pgEnum('price_scope', ['STORE', 'STORE_FORMAT', 'REGION', 'CHAIN'])
export const priceSourceTypeEnum = pgEnum('price_source_type', ['RECEIPT', 'OFFICIAL', 'FLYER', 'API', 'OTHER'])
export const priceLocationResolutionEnum = pgEnum('price_location_resolution', ['UNKNOWN', 'RESOLVED', 'NOT_APPLICABLE'])
// 'pending_review' / 'imported' / 'discarded' are the original manual-entry states — a manual
// import has no OCR/AI step, so it goes straight to 'imported'. The rest is the real OCR pipeline
// state machine (docs/08_OCR_RECEIPT_PIPELINE.md section 11): uploaded → ocr_processing →
// ocr_completed → parsing → parsed → validating → completed, with ocr_failed/parsing_failed/
// review_required/duplicate_review/cancelled as the alternative branches. Kept as one enum
// (not a second status column) so every receipt_imports row, manual or OCR, has one authoritative
// status field.
export const receiptStatusEnum = pgEnum('receipt_status', [
  'pending_review',
  'imported',
  'discarded',
  'uploaded',
  'ocr_processing',
  'ocr_completed',
  'ocr_failed',
  'parsing',
  'parsed',
  'parsing_failed',
  'validating',
  'review_required',
  'duplicate_review',
  'completed',
  'cancelled',
])

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
  // Where this product is remembered to live once a household has confirmed/corrected it at least
  // once (lib/db/queries.ts's upsertProductCatalogDefaults, called from a human-confirmed receipt
  // import — never from an unreviewed AI guess). Null until then, at which point
  // lib/pantry.ts's inferPantryLocation()'s keyword heuristic is used instead. Existing per the
  // owner's "BIO KUŘE" example: a correction made once must be remembered for every later receipt
  // of the same product, not re-guessed every time.
  defaultLocation: pantryLocationEnum('default_location'),
})

// A retail chain (brand), e.g. Lidl. First market: Česká republika, architecture allows more.
export const stores = pgTable('stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  chain: text('chain').notNull().unique(),
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
  // Store chain remains explicit even when the physical branch is unknown. This prevents a real
  // STORE observation from being misrepresented as a CHAIN price.
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  storeLocationId: uuid('store_location_id').references(() => storeLocations.id, { onDelete: 'cascade' }),
  priceScope: priceScopeEnum('price_scope').notNull().default('STORE'),
  sourceType: priceSourceTypeEnum('source_type').notNull().default('OTHER'),
  locationResolution: priceLocationResolutionEnum('location_resolution').notNull().default('RESOLVED'),
  regularPrice: numeric('regular_price', { precision: 10, scale: 2 }).notNull(),
  // ISO 4217 code — per docs/03_DATABASE.md rule 9 ("Prices must have explicit currency").
  // Lives on the price row (not just the store) since a store's prices could in principle span
  // currencies without this, e.g. a cross-border retailer.
  currency: text('currency').notNull().default('CZK'),
  unit: itemUnitEnum('unit').notNull(),
  unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
  // Observation date is the historical fact. Current price is derived from the latest applicable
  // observation; it is not stored as a mutable singleton value.
  observedAt: date('observed_at').notNull(),
  validFrom: date('valid_from').notNull(),
  validUntil: date('valid_until'),
  sourceReference: text('source_reference'),
  confidence: numeric('confidence', { precision: 4, scale: 3 }),
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
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
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
  // numeric, not integer — a receipt line item sold by weight has a genuinely fractional quantity
  // (e.g. "KUŘE 0,582 kg"). `mode: 'number'` keeps every existing call site's `item.quantity` a
  // plain JS number, same as before, rather than requiring a `Number(...)` conversion everywhere.
  quantity: numeric('quantity', { mode: 'number' }).notNull().default(1),
  unit: itemUnitEnum('unit').notNull().default('ks'),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
})

// Household pantry ("spíž"): what the household believes it currently has at home. Populated by
// completePurchaseAction (a purchased item restocks or creates its pantry row) and periodically
// re-checked by the pantry-checkin cron, which asks "do you still have this?" per
// lib/pantry.ts's per-category interval (see docs/07_CHANGELOG.md for why category, not a single
// global interval — shelf life genuinely differs by category, but there's no per-product shelf-life
// data to be more precise than that yet).
export const pantryItems = pgTable('pantry_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  category: itemCategoryEnum('category').notNull().default('Ostatní'),
  // Where the item physically lives — defaults per-category/keyword-heuristic on first restock
  // (lib/pantry.ts's inferPantryLocation()), then only changes when the household moves it by
  // hand (e.g. freshly bought chilled meat into the freezer), never re-inferred on a later restock
  // of the same row — otherwise a manual move would silently get undone by the next purchase.
  location: pantryLocationEnum('location').notNull().default('Spíž'),
  // numeric, not integer — same reason as purchaseItems.quantity above: a restock from a
  // weight-sold receipt item (e.g. 0.582 kg of meat) must not be truncated to a whole number.
  quantity: numeric('quantity', { mode: 'number' }).notNull().default(1),
  unit: itemUnitEnum('unit').notNull().default('ks'),
  // Reset to now() whenever the item is restocked (another purchase) or the household confirms
  // "ještě mám" — the check-in interval counts from here, not from when the row was first created.
  addedAt: timestamp('added_at').notNull().defaultNow(),
  // When we last asked "do you still have this?". Null means never asked. Reset to null on
  // confirmation, so the next check-in interval starts counting from a fresh addedAt.
  askedAt: timestamp('asked_at'),
})

// Receipt import ("nahrávání nákupů přes účtenky"): prepares the ingestion path for a future OCR
// provider (lib/receipts.ts's ReceiptOcrProvider) without wiring one up yet, per CLAUDE.md section
// 30 (no AI/vision-model call before the AI phase). Every import today is `source: 'manual'` — a
// household types the receipt's line items by hand; `importReceiptAction` (app/actions/receipts.ts)
// turns them into a real purchase immediately. Kept as its own row (not just a purchases row) so a
// later OCR provider's raw output/confidence stays auditable and reprocessable, matching CLAUDE.md
// section 16's price/deal provenance rule extended to purchases.
export const receiptImports = pgTable('receipt_imports', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  status: receiptStatusEnum('status').notNull().default('pending_review'),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
  storeLocationId: uuid('store_location_id').references(() => storeLocations.id, { onDelete: 'set null' }),
  // Nullable now (was NOT NULL): at 'uploaded'/'ocr_processing' the date isn't known yet — OCR/
  // parsing hasn't run. A manual import still always sets it immediately, same as before.
  date: date('date'),
  // 'manual' (hand-typed today) or 'ocr' (docs/08_OCR_RECEIPT_PIPELINE.md pipeline).
  source: text('source').notNull().default('manual'),
  // Vercel Blob URL of the uploaded photo — private access, so only ever read back server-side.
  // Kept even after processing completes so a failed/reviewed import can be retried without
  // re-uploading (pipeline doc section 13).
  imageUrl: text('image_url'),
  // Which OCR engine produced rawOcrText. Null for manual imports or imports that never reached OCR.
  // This is audit metadata only; it does not affect parsing/validation.
  ocrProvider: text('ocr_provider'),
  // Raw OCR provider output, for reprocessing/debugging once a real provider exists. Null for a
  // manually-entered import — there is no OCR output yet.
  rawOcrText: text('raw_ocr_text'),
  receiptTime: text('receipt_time'),
  receiptNumber: text('receipt_number'),
  currency: text('currency').notNull().default('CZK'),
  subtotal: numeric('subtotal', { precision: 10, scale: 2 }),
  discountTotal: numeric('discount_total', { precision: 10, scale: 2 }),
  // The pipeline's own running total (parsed/validated), independent of purchases.total, which
  // only exists once a purchase is actually confirmed and created.
  total: numeric('total', { precision: 10, scale: 2 }),
  // Overall receipt confidence (0.000–1.000) from the AI parser — combined with, never a
  // substitute for, the mathematical consistency checks in lib/receipts.ts (pipeline doc section 8).
  confidence: numeric('confidence', { precision: 4, scale: 3 }),
  // Raw AI-parser JSON output before validation/human correction — distinct from `items` below,
  // which is the confirmed, final data. Kept for debugging a parser that got something wrong.
  parserResult: text('parser_result'),
  errorMessage: text('error_message'),
  // Nullable now (was NOT NULL): populated once parsing (or manual entry) actually produces line
  // items. JSON-serialized ReceiptLineItem[], confirmed by the household — hand-typed today for a
  // manual import; once OCR exists, this is its output after human review, never raw unverified
  // extraction.
  items: text('items'),
  purchaseId: uuid('purchase_id').references(() => purchases.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  processedAt: timestamp('processed_at'),
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
  pantryItems: many(pantryItems),
  receiptImports: many(receiptImports),
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
  store: one(stores, { fields: [prices.storeId], references: [stores.id] }),
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
  store: one(stores, { fields: [purchases.storeId], references: [stores.id] }),
  storeLocation: one(storeLocations, { fields: [purchases.storeLocationId], references: [storeLocations.id] }),
  items: many(purchaseItems),
}))

export const purchaseItemsRelations = relations(purchaseItems, ({ one }) => ({
  purchase: one(purchases, { fields: [purchaseItems.purchaseId], references: [purchases.id] }),
  product: one(products, { fields: [purchaseItems.productId], references: [products.id] }),
}))

export const pantryItemsRelations = relations(pantryItems, ({ one }) => ({
  household: one(households, { fields: [pantryItems.householdId], references: [households.id] }),
  product: one(products, { fields: [pantryItems.productId], references: [products.id] }),
}))

export const receiptImportsRelations = relations(receiptImports, ({ one }) => ({
  household: one(households, { fields: [receiptImports.householdId], references: [households.id] }),
  store: one(stores, { fields: [receiptImports.storeId], references: [stores.id] }),
  storeLocation: one(storeLocations, { fields: [receiptImports.storeLocationId], references: [storeLocations.id] }),
  purchase: one(purchases, { fields: [receiptImports.purchaseId], references: [purchases.id] }),
}))
