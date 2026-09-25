import { relations, sql } from 'drizzle-orm'
import { boolean, check, date, foreignKey, index, integer, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { SEARCH_ACCENTED, SEARCH_PLAIN } from '@/lib/product-search'

// --- Enums -----------------------------------------------------------------

export const memberRoleEnum = pgEnum('member_role', ['owner', 'member'])
export const priceSensitivityEnum = pgEnum('price_sensitivity', ['cheapest', 'balanced', 'quality_first'])
export const qualityPreferenceEnum = pgEnum('quality_preference', ['standard', 'premium'])
export const itemCategoryEnum = pgEnum('item_category', ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní'])
export const itemUnitEnum = pgEnum('item_unit', ['ks', 'kg', 'g', 'l', 'ml'])
export const itemPriorityEnum = pgEnum('item_priority', ['Nízká', 'Normální', 'Vysoká'])
export const invitationStatusEnum = pgEnum('invitation_status', ['pending', 'accepted', 'revoked'])
export const pantryLocationEnum = pgEnum('pantry_location', ['Spíž', 'Lednice', 'Mrazák', 'Domácnost', 'Lékárnička', 'Drogérka'])
// External price-ingestion sources (docs/32 "Internet Data Integration"). One entry per retailer
// connector actually implemented — starts with just Lidl.
export const productSourceEnum = pgEnum('product_source', ['lidl', 'billa', 'penny', 'dm', 'rohlik', 'kosik', 'globus'])
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
    // How far this user is willing to walk/travel for a shop, in km. Personal (each member has their
    // own), null until they set it. Stored now; applied to distances once branches have GPS — until
    // then the chosen stores (`member_stores`) decide what counts as nearby.
    maxDistanceKm: numeric('max_distance_km', { precision: 4, scale: 1 }),
    // How many different stores this user is willing to visit for one shop (1-6); the shopping planner
    // uses it as its limit. Null until they set it.
    maxShopStores: integer('max_shop_stores'),
  },
  // Looked up by userId on every authenticated request (lib/auth/authorize.ts's requireHousehold()) — the single hottest query in the app.
  // Unique: one account belongs to exactly one household (migration 0014). Concurrent first-login
  // renders raced past an application-level "no membership yet" check and created several
  // households; the database now decides the race. NULL user_ids (profile-only members) stay allowed.
  (table) => [
    uniqueIndex('household_members_user_id_unique').on(table.userId),
    check('household_members_max_distance_range', sql`${table.maxDistanceKm} IS NULL OR (${table.maxDistanceKm} > 0 AND ${table.maxDistanceKm} <= 50)`),
    check('household_members_max_shop_stores_range', sql`${table.maxShopStores} IS NULL OR (${table.maxShopStores} >= 1 AND ${table.maxShopStores} <= 6)`),
  ],
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
  // The name without diacritics, lower-cased ("Čerstvé mléko 1,5%" -> "cerstve mleko 1,5%"), kept by
  // the database itself so text search (lib/product-search.ts) is accent-insensitive. The character
  // map is shared with `normalizeSearchText()`, and a DB test checks the two agree.
  searchName: text('search_name').generatedAlwaysAs(sql`lower(translate(name, '${sql.raw(SEARCH_ACCENTED)}', '${sql.raw(SEARCH_PLAIN)}'))`),
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

// Links a catalog product to its identity on an external price source (docs/32 "Internet Data
// Integration"), e.g. Lidl's own stable `erpNumber`. Per docs/05_BUSINESS_RULES.md ("do not treat
// product names as sufficient identifiers") and section 34 ("use stable external IDs... unique
// constraints"): re-running ingestion for the same external product must find this row instead of
// re-matching by name (which could drift) or creating a duplicate product.
export const productExternalRefs = pgTable(
  'product_external_refs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    source: productSourceEnum('source').notNull(),
    externalId: text('external_id').notNull(),
    lastSeenAt: timestamp('last_seen_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('product_external_refs_source_external_id_idx').on(table.source, table.externalId)],
)

// A retail chain (brand), e.g. Lidl. First market: Česká republika, architecture allows more.
export const stores = pgTable('stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  chain: text('chain').notNull().unique(),
  // True for a retailer with no physical branches (delivery only, e.g. Rohlík). Such a chain has no
  // `store_locations` rows — inventing one would break "do not invent store locations" — so its prices
  // are chain-wide (CHAIN scope) and its deals carry `store_id` with no location.
  isOnline: boolean('is_online').notNull().default(false),
})

// A physical branch of a store chain.
export const storeLocations = pgTable('store_locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  country: text('country').notNull().default('Česká republika'),
  // OCR-created branches may not have coordinates or opening hours yet. These fields are enriched later
  // by the store-directory data source; never invent coordinates/hours from a receipt address.
  lat: numeric('lat', { precision: 9, scale: 6 }),
  lng: numeric('lng', { precision: 9, scale: 6 }),
  // Free-text opening hours of seeded and receipt-created branches ("Otevřeno do 21:00").
  hours: text('hours'),
  // Where an imported branch came from: 'osm' (OpenStreetMap, lib/stores/osm.ts) with that source's
  // own id ('node/123'), so a repeat import updates the branch instead of adding it again. Null for
  // seeded and receipt-created branches (an import may adopt one of them — see planStoreSync()).
  source: text('source'),
  externalId: text('external_id'),
  // Opening hours in OpenStreetMap's `opening_hours` syntax ("Mo-Sa 07:00-21:00; Su 08:00-20:00"),
  // kept machine-readable; the UI formats it (formatOpeningHours()) and prefers it over `hours`.
  openingHours: text('opening_hours'),
  // The last import that still found the branch in its source; a branch the source no longer lists
  // keeps an old date (it may have closed) instead of being deleted, since prices and purchases
  // point at it.
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
}, (table) => [
  // `id` is already unique on its own; this pair exists only so `member_stores` can carry a composite
  // foreign key (store_location_id, store_id) that makes the database itself refuse a branch that
  // belongs to a different chain than the row says.
  uniqueIndex('store_locations_id_store_id_unique').on(table.id, table.storeId),
  // One branch per source record: the idempotency key of the store import (CLAUDE.md section 34).
  uniqueIndex('store_locations_source_external_id_unique').on(table.source, table.externalId).where(sql`${table.externalId} IS NOT NULL`),
  check('store_locations_source_pair', sql`(${table.source} IS NULL) = (${table.externalId} IS NULL)`),
])

// The stores a user has chosen as "in my area" (personal, per household member). A row with no
// `store_location_id` selects a whole chain; a row with one also names a specific branch of that
// chain. Until every branch has GPS this selection — not a computed distance — is what makes a store
// "nearby" for price comparison and shopping planning (lib/nearby-stores.ts). That a branch row's
// chain is also selected is kept by the application (a partial unique index cannot be referenced).
export const memberStores = pgTable(
  'member_stores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id').notNull().references(() => householdMembers.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    storeLocationId: uuid('store_location_id'),
    // A store the user prefers when the shopping planner has a choice. A property of the chain, so only
    // chain-level rows (no branch) can be priority.
    isPriority: boolean('is_priority').notNull().default(false),
  },
  (table) => [
    check('member_stores_priority_is_chain_level', sql`${table.isPriority} = false OR ${table.storeLocationId} IS NULL`),
    // Composite FK: when a branch is named, it must be a branch of `store_id`. MATCH SIMPLE — a NULL
    // `store_location_id` (a chain-level row) skips the check.
    foreignKey({ columns: [table.storeLocationId, table.storeId], foreignColumns: [storeLocations.id, storeLocations.storeId] }).onDelete('cascade'),
    // At most one chain-level row per member and chain, and one row per member and branch.
    uniqueIndex('member_stores_chain_unique').on(table.memberId, table.storeId).where(sql`${table.storeLocationId} IS NULL`),
    uniqueIndex('member_stores_branch_unique').on(table.memberId, table.storeLocationId).where(sql`${table.storeLocationId} IS NOT NULL`),
  ],
)

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
  // The latest date an OFFICIAL price was seen again unchanged. A re-read that finds the same price
  // confirms this row instead of inserting a new one, so `prices` grows with real price changes, not
  // with how often a catalog is read (the Neon free tier caps storage at 0.5 GB). Null until the
  // first confirmation; the price is then known to hold from `observed_at` to this date.
  lastConfirmedAt: date('last_confirmed_at'),
  sourceReference: text('source_reference'),
  confidence: numeric('confidence', { precision: 4, scale: 3 }),
}, (table) => [
  // At most one official (retailer-published) observation per product, store, retailer SKU and day:
  // a repeat ingestion run the same day refreshes that row instead of adding a duplicate (see
  // `recordOfficialPrice()`). Partial, so receipt-based observations — where several purchases of
  // the same product on one day are legitimate separate observations — are unaffected.
  uniqueIndex('prices_official_daily_unique')
    .on(table.productId, table.storeId, table.priceScope, table.sourceType, table.sourceReference, table.observedAt)
    .where(sql`${table.sourceType} = 'OFFICIAL' AND ${table.sourceReference} IS NOT NULL`),
])

// Where each store's rotating price refresh continues. A store's catalog is split into parts that
// each fit one cron run (PRICE_SOURCES in lib/ingestion/ingest.ts); every run refreshes the part
// named here and moves the cursor on, so repeated daily runs cover the whole catalog in turn.
export const ingestionCursors = pgTable('ingestion_cursors', {
  source: productSourceEnum('source').primaryKey(),
  nextPart: integer('next_part').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [check('ingestion_cursors_next_part_non_negative', sql`${table.nextPart} >= 0`)])

export const deals = pgTable('deals', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  // The chain the promotion belongs to. Always set; `storeLocationId` narrows it to a branch and is
  // null for an online-only chain, which has none.
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  storeLocationId: uuid('store_location_id').references(() => storeLocations.id, { onDelete: 'cascade' }),
  dealPrice: numeric('deal_price', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('CZK'),
  // The promotion's price per `unit` (Kč/kg, Kč/l, Kč/ks…) — what makes an offer comparable when the
  // chain publishes no regular price to derive it from (an offers-only source such as Penny). Nullable
  // because deals stored before these columns existed have none, and a unit price is never invented
  // for them; both columns are set together or not at all.
  unit: itemUnitEnum('unit'),
  unitPrice: numeric('unit_price', { precision: 10, scale: 2 }),
  validFrom: date('valid_from').notNull(),
  validUntil: date('valid_until').notNull(),
}, (table) => [
  check('deals_unit_price_pair', sql`(${table.unit} IS NULL AND ${table.unitPrice} IS NULL) OR (${table.unit} IS NOT NULL AND ${table.unitPrice} > 0)`),
  // Same guard as member_stores: when a branch is named it must be a branch of `store_id`. MATCH
  // SIMPLE — a NULL `store_location_id` (an online chain's deal) skips the check.
  foreignKey({ columns: [table.storeLocationId, table.storeId], foreignColumns: [storeLocations.id, storeLocations.storeId] }).onDelete('cascade'),
])

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
  // numeric, not integer — once a receipt has been matched to the item, this holds the quantity
  // actually bought, which for a weighed product is fractional (0.582 kg). Same reasoning and
  // `mode: 'number'` as purchaseItems.quantity.
  quantity: numeric('quantity', { precision: 10, scale: 3, mode: 'number' }).notNull().default(1),
  unit: itemUnitEnum('unit').notNull().default('ks'),
  category: itemCategoryEnum('category').notNull().default('Ostatní'),
  done: boolean('done').notNull().default(false),
  // The purchase (from an imported receipt) that ticked this item off. Null for an item the user
  // ticked by hand. completePurchaseAction skips items with this set, because the receipt already
  // created that purchase and restocked the pantry — turning them into a second purchase would
  // count the same shopping trip twice.
  checkedByPurchaseId: uuid('checked_by_purchase_id').references(() => purchases.id, { onDelete: 'set null' }),
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

// The specific product a user chose for a shopping list item at one chain — "for this milk, buy THIS
// one at Lidl". The shopping planner uses a pinned product at that chain instead of guessing by name;
// where nothing is pinned it picks automatically. One pin per item and chain.
export const shoppingListItemPins = pgTable(
  'shopping_list_item_pins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id').notNull().references(() => shoppingListItems.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('shopping_list_item_pins_item_store_unique').on(table.itemId, table.storeId)],
)

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
  quantity: numeric('quantity', { precision: 10, scale: 3, mode: 'number' }).notNull().default(1),
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
  quantity: numeric('quantity', { precision: 10, scale: 3, mode: 'number' }).notNull().default(1),
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
  // Storage reference of the uploaded photo (lib/storage): a private Vercel Blob URL for receipts
  // uploaded before the move to R2, `r2:receipts/…` for R2. Private either way — only ever read back
  // server-side. The column keeps its old name so the switch needed no migration.
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
  externalRefs: many(productExternalRefs),
}))

export const productExternalRefsRelations = relations(productExternalRefs, ({ one }) => ({
  product: one(products, { fields: [productExternalRefs.productId], references: [products.id] }),
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
  store: one(stores, { fields: [deals.storeId], references: [stores.id] }),
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
