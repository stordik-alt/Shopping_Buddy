import { relations, sql } from 'drizzle-orm'
import { boolean, check, date, foreignKey, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { EXPENSE_CATEGORY_NAMES } from '@/lib/expense-categories'
import { SEARCH_ACCENTED, SEARCH_PLAIN } from '@/lib/product-search'

// --- Enums -----------------------------------------------------------------

export const memberRoleEnum = pgEnum('member_role', ['owner', 'member'])
export const priceSensitivityEnum = pgEnum('price_sensitivity', ['cheapest', 'balanced', 'quality_first'])
export const qualityPreferenceEnum = pgEnum('quality_preference', ['standard', 'premium'])
export const itemCategoryEnum = pgEnum('item_category', ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní'])
// What an expense was for (lib/expense-categories.ts) — a wider list than the item categories above.
export const expenseCategoryEnum = pgEnum('expense_category', EXPENSE_CATEGORY_NAMES)
export const itemUnitEnum = pgEnum('item_unit', ['ks', 'kg', 'g', 'l', 'ml'])
// Universal PKD quantity vocabulary. This is deliberately broader than the legacy item_unit enum.
export const quantityDimensionEnum = pgEnum('quantity_dimension', ['count', 'mass', 'volume', 'length', 'area', 'unknown'])
export const quantityUnitEnum = pgEnum('quantity_unit', ['ks', 'g', 'kg', 'mg', 'ml', 'l', 'm', 'cm', 'mm', 'm2', 'cm2'])
export const conversionMethodEnum = pgEnum('conversion_method', ['direct_unit', 'declared_multipack', 'verified_attribute', 'package_structure', 'unknown'])
export const itemPriorityEnum = pgEnum('item_priority', ['Nízká', 'Normální', 'Vysoká'])
export const invitationStatusEnum = pgEnum('invitation_status', ['pending', 'accepted', 'revoked'])
export const pantryLocationEnum = pgEnum('pantry_location', ['Spíž', 'Lednice', 'Mrazák', 'Domácnost', 'Lékárnička', 'Drogérka'])
// The broader zone a pantry place belongs to (spec section 12: "Datový model nesmí být pevně omezen
// pouze na lednici, mrazák, spíž... Oblast → Místo"). Wider than `item_category` on purpose — a
// household stores things Zásoby never classified a *product* as (a car, a garage), so this is a
// deliberately separate system, the same way expense categories are already kept separate from item
// categories (lib/product-subcategories.ts's own comment explains that precedent).
export const pantryAreaEnum = pgEnum('pantry_area', ['Potraviny', 'Drogerie', 'Domácnost', 'Děti', 'Auto', 'Bydlení', 'Zvířata', 'Ostatní'])
// How closely the household wants a pantry item watched (lib/pantry.ts): 'normal' — estimated and
// checked as usual; 'rare' — no "asi došlo" estimate, a check-in only every few months (salt,
// spices, oil); 'off' — never estimated or asked about.
export const pantryTrackingEnum = pgEnum('pantry_tracking', ['normal', 'rare', 'off'])
// External price-ingestion sources (docs/32 "Internet Data Integration"). One entry per retailer
// connector actually implemented — starts with just Lidl.
export const productSourceEnum = pgEnum('product_source', ['lidl', 'billa', 'penny', 'dm', 'rohlik', 'kosik', 'globus', 'albert', 'penny_flyer', 'billa_flyer', 'lidl_flyer'])
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
  // Day of the month (1–28) the household's budget period starts on: 1 is the calendar month, 28 is
  // "28th to 27th of the next month" (lib/budget.ts). Capped at 28 so every month has that day.
  budgetPeriodStartDay: integer('budget_period_start_day').notNull().default(1),
  // Monthly savings goal (docs/15_BUDGET_PERIODS.md); 0 = none.
  savingsGoal: numeric('savings_goal', { precision: 10, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [check('households_budget_period_start_day_range', sql`${table.budgetPeriodStartDay} >= 1 AND ${table.budgetPeriodStartDay} <= 28`)])

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
    // The constraint is named `invitations_token_key` in the database (created by hand before the
    // Drizzle baseline, migration 0002); declared under that name so the schema matches it.
    token: text('token').notNull().unique('invitations_token_key'),
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
}, (table) => [
  index('children_household_idx').on(table.householdId),
])

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

// A fixed subcategory of an item_category (e.g. Potraviny ▸ "Mléčné výrobky") — one layer under the
// existing item_category enum, shared by products/purchase_items/pantry_items so expenses, the
// catalog and inventory all read the same value for a given product (lib/product-subcategories.ts
// is the single source of truth for the fixed name list per category; this table only stores which
// names exist, the same "enum backed by a lookup table" pattern product_categories already uses).
// Kept as its own table rather than a second pgEnum so a category's subcategory list can be
// inspected/extended without an enum-alteration migration for every tweak.
export const productSubcategories = pgTable('product_subcategories', {
  id: uuid('id').primaryKey().defaultRandom(),
  category: itemCategoryEnum('category').notNull(),
  name: text('name').notNull(),
}, (table) => [uniqueIndex('product_subcategories_category_name_unique').on(table.category, table.name)])

// Product types (druhy zboží, docs/12_PRODUCT_TYPES.md): one kind of goods a shopper treats as
// interchangeable apart from brand, size and price ("Máslo", "Kuřecí prsa"). The list and the rules
// that assign them are code (lib/product-types.ts); these rows give each type a stable id the catalog
// can point to. `key` is the code's identity and never changes; `unit` is the unit its unit prices are
// compared in.
export const productTypes = pgTable('product_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  category: itemCategoryEnum('category').notNull(),
  unit: itemUnitEnum('unit').notNull(),
})

// A Product Subtype is a reusable, reviewed classification within exactly one Product Type.
// It is not a concrete retailer product and must not encode a brand, package size or SKU.
export const productSubtypes = pgTable('product_subtypes', {
  id: uuid('id').primaryKey().defaultRandom(),
  productTypeId: uuid('product_type_id').notNull().references(() => productTypes.id, { onDelete: 'restrict' }),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('product_subtypes_type_name_unique').on(table.productTypeId, table.name),
  // Required for the composite product FK: a subtype can only be selected under its own parent type.
  uniqueIndex('product_subtypes_type_id_unique').on(table.productTypeId, table.id),
  index('product_subtypes_product_type_active_sort_idx').on(table.productTypeId, table.isActive, table.sortOrder, table.name),
])

// Unapproved proposals discovered from retailer feeds and external taxonomies. Candidates do not
// participate in product classification until reviewed and explicitly approved.
export const productSubtypeCandidates = pgTable('product_subtype_candidates', {
  id: uuid('id').primaryKey().defaultRandom(),
  parentProductTypeKey: text('parent_product_type_key').notNull(),
  parentProductTypeId: uuid('parent_product_type_id').references(() => productTypes.id, { onDelete: 'restrict' }),
  candidateKey: text('candidate_key').notNull().unique(),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  definition: text('definition').notNull().default(''),
  includes: jsonb('includes').$type<string[]>().notNull().default([]),
  excludes: jsonb('excludes').$type<string[]>().notNull().default([]),
  sourceType: text('source_type').notNull(),
  sourceName: text('source_name').notNull(),
  sourceVersion: text('source_version'),
  sourceRecordIds: jsonb('source_record_ids').$type<string[]>().notNull().default([]),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status').notNull().default('candidate'),
  reviewNote: text('review_note'),
  duplicateOfSubtypeId: uuid('duplicate_of_subtype_id').references(() => productSubtypes.id, { onDelete: 'restrict' }),
  approvedSubtypeId: uuid('approved_subtype_id').references(() => productSubtypes.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('product_subtype_candidates_parent_normalized_name_unique').on(table.parentProductTypeKey, table.normalizedName),
  index('product_subtype_candidates_status_created_idx').on(table.status, table.createdAt),
  index('product_subtype_candidates_parent_status_idx').on(table.parentProductTypeKey, table.status),
  check('product_subtype_candidates_source_type_valid', sql`${table.sourceType} IN ('retailer', 'gs1_gpc', 'open_food_facts', 'cz_cpa', 'ocr', 'manual')`),
  check('product_subtype_candidates_status_valid', sql`${table.status} IN ('candidate', 'approved', 'rejected', 'duplicate')`),
])

// Product Knowledge Dictionary (PKD): normalized knowledge about a product type, independent of
// retailer SKU/package identity. External source rows are versioned and mapped explicitly; they never
// become application Product Types automatically.
export const pkdSourceTypeEnum = pgEnum('pkd_source_type', ['gs1_gpc', 'open_food_facts', 'cz_cpa', 'seed_catalog', 'ocr', 'manual'])
export const pkdEntryStatusEnum = pgEnum('pkd_entry_status', ['candidate', 'approved', 'rejected', 'inactive'])
export const pkdMappingStatusEnum = pgEnum('pkd_mapping_status', ['unmapped', 'candidate', 'mapped', 'rejected'])

export const pkdSources = pgTable('pkd_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceType: pkdSourceTypeEnum('source_type').notNull(),
  sourceVersion: text('source_version').notNull(),
  acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
}, (table) => [uniqueIndex('pkd_sources_type_version_unique').on(table.sourceType, table.sourceVersion)])

export const pkdEntries = pgTable('pkd_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  stableKey: text('stable_key').notNull().unique(),
  canonicalName: text('canonical_name').notNull(),
  language: text('language').notNull().default('cs'),
  category: itemCategoryEnum('category'),
  subcategory: text('subcategory'),
  physicalForm: text('physical_form'),
  processingState: text('processing_state'),
  comparisonUnit: itemUnitEnum('comparison_unit'),
  attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
  contains: text('contains').array().notNull().default([]),
  excludes: text('excludes').array().notNull().default([]),
  status: pkdEntryStatusEnum('status').notNull().default('candidate'),
  confidence: numeric('confidence', { precision: 4, scale: 3, mode: 'number' }),
  productTypeId: uuid('product_type_id').references(() => productTypes.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('pkd_entries_canonical_name_idx').on(table.canonicalName),
  index('pkd_entries_product_type_idx').on(table.productTypeId),
  check('pkd_entries_confidence_range', sql`${table.confidence} IS NULL OR (${table.confidence} >= 0 AND ${table.confidence} <= 1)`),
])

export const pkdSynonyms = pgTable('pkd_synonyms', {
  id: uuid('id').primaryKey().defaultRandom(),
  entryId: uuid('entry_id').notNull().references(() => pkdEntries.id, { onDelete: 'cascade' }),
  synonym: text('synonym').notNull(),
  language: text('language').notNull().default('cs'),
  normalized: text('normalized').notNull(),
}, (table) => [
  uniqueIndex('pkd_synonyms_entry_normalized_unique').on(table.entryId, table.normalized),
  index('pkd_synonyms_normalized_idx').on(table.normalized),
])

export const pkdNormalizationMethodEnum = pgEnum('pkd_normalization_method', ['unicode_fold', 'whitespace_fold', 'punctuation_fold', 'alias_fold'])
export const pkdDedupStatusEnum = pgEnum('pkd_dedup_status', ['candidate', 'accepted', 'rejected'])

export const pkdCandidateStatusEnum = pgEnum('pkd_candidate_status', ['candidate', 'accepted', 'rejected'])

export const pkdProductTypeMappingStatusEnum = pgEnum('pkd_product_type_mapping_status', ['candidate', 'accepted', 'rejected'])

export const pkdProductTypeMappingMethodEnum = pgEnum('pkd_product_type_mapping_method', ['exact_name', 'rule_match'])

export const pkdProductTypeMappingReviewDecisionEnum = pgEnum('pkd_product_type_mapping_review_decision', ['accepted', 'rejected'])

export const pkdProductTypeMappings = pgTable('pkd_product_type_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  pkdEntryId: uuid('pkd_entry_id').notNull().references(() => pkdEntries.id, { onDelete: 'cascade' }),
  productTypeId: uuid('product_type_id').notNull().references(() => productTypes.id, { onDelete: 'cascade' }),
  mappingVersion: text('mapping_version').notNull(),
  method: pkdProductTypeMappingMethodEnum('method').notNull(),
  confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull(),
  status: pkdProductTypeMappingStatusEnum('status').notNull().default('candidate'),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('pkd_product_type_mappings_entry_version_unique').on(table.pkdEntryId, table.mappingVersion),
  index('pkd_product_type_mappings_product_type_idx').on(table.productTypeId),
  index('pkd_product_type_mappings_status_idx').on(table.status),
  check('pkd_product_type_mappings_confidence_range', sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`),
])

export const pkdProductTypeMappingReviews = pgTable('pkd_product_type_mapping_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  mappingId: uuid('mapping_id').notNull().references(() => pkdProductTypeMappings.id, { onDelete: 'cascade' }),
  decision: pkdProductTypeMappingReviewDecisionEnum('decision').notNull(),
  reviewerId: uuid('reviewer_id'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('pkd_product_type_mapping_reviews_mapping_idx').on(table.mappingId),
  index('pkd_product_type_mapping_reviews_reviewer_idx').on(table.reviewerId),
])

export const pkdProductTypeCandidates = pgTable('pkd_product_type_candidates', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateKey: text('candidate_key').notNull(),
  canonicalName: text('canonical_name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  language: text('language').notNull(),
  category: itemCategoryEnum('category'),
  subcategory: text('subcategory'),
  physicalForm: text('physical_form'),
  processingState: text('processing_state'),
  comparisonUnit: itemUnitEnum('comparison_unit'),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
  sourceEntryIds: uuid('source_entry_ids').array().notNull().default([]),
  confidence: numeric('confidence', { precision: 4, scale: 3 }),
  status: pkdCandidateStatusEnum('status').notNull().default('candidate'),
  candidateVersion: text('candidate_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('pkd_product_type_candidates_key_version_unique').on(table.candidateKey, table.candidateVersion),
  index('pkd_product_type_candidates_normalized_idx').on(table.normalizedName),
  index('pkd_product_type_candidates_status_idx').on(table.status),
  check('pkd_product_type_candidates_confidence_range', sql`${table.confidence} IS NULL OR (${table.confidence} >= 0 AND ${table.confidence} <= 1)`),
])



export const pkdEntryNormalizations = pgTable('pkd_entry_normalizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  entryId: uuid('entry_id').notNull().references(() => pkdEntries.id, { onDelete: 'cascade' }),
  normalizationVersion: text('normalization_version').notNull(),
  normalizedName: text('normalized_name').notNull(),
  identityKey: text('identity_key').notNull(),
  methods: pkdNormalizationMethodEnum('methods').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('pkd_entry_normalizations_entry_version_unique').on(table.entryId, table.normalizationVersion),
  index('pkd_entry_normalizations_identity_idx').on(table.identityKey),
  index('pkd_entry_normalizations_name_idx').on(table.normalizedName),
])

export const pkdDedupCandidates = pgTable('pkd_dedup_candidates', {
  id: uuid('id').primaryKey().defaultRandom(),
  leftEntryId: uuid('left_entry_id').notNull().references(() => pkdEntries.id, { onDelete: 'cascade' }),
  rightEntryId: uuid('right_entry_id').notNull().references(() => pkdEntries.id, { onDelete: 'cascade' }),
  normalizationVersion: text('normalization_version').notNull(),
  reason: text('reason').notNull(),
  confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull(),
  status: pkdDedupStatusEnum('status').notNull().default('candidate'),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('pkd_dedup_candidates_pair_version_unique').on(table.leftEntryId, table.rightEntryId, table.normalizationVersion),
  index('pkd_dedup_candidates_right_idx').on(table.rightEntryId),
])

export const pkdExternalMappings = pgTable('pkd_external_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  entryId: uuid('entry_id').notNull().references(() => pkdEntries.id, { onDelete: 'cascade' }),
  sourceId: uuid('source_id').notNull().references(() => pkdSources.id, { onDelete: 'cascade' }),
  externalId: text('external_id').notNull(),
  externalParentId: text('external_parent_id'),
  mappingStatus: pkdMappingStatusEnum('mapping_status').notNull().default('candidate'),
  confidence: numeric('confidence', { precision: 4, scale: 3, mode: 'number' }),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
}, (table) => [
  uniqueIndex('pkd_external_mappings_source_external_unique').on(table.sourceId, table.externalId),
  index('pkd_external_mappings_entry_idx').on(table.entryId),
  check('pkd_external_mappings_confidence_range', sql`${table.confidence} IS NULL OR (${table.confidence} >= 0 AND ${table.confidence} <= 1)`),
])

// Universal quantity/packaging dictionary. It describes the vocabulary and safe conversion rules,
// independently from any concrete retailer product.
export const quantityUnits = pgTable('quantity_units', {
  id: uuid('id').primaryKey().defaultRandom(),
  unit: quantityUnitEnum('unit').notNull().unique(),
  dimension: quantityDimensionEnum('dimension').notNull(),
  canonicalUnit: quantityUnitEnum('canonical_unit').notNull(),
  multiplierToCanonical: numeric('multiplier_to_canonical', { precision: 20, scale: 9, mode: 'number' }).notNull(),
  allowsDecimal: boolean('allows_decimal').notNull().default(true),
}, (table) => [
  check('quantity_units_multiplier_positive', sql`${table.multiplierToCanonical} > 0`),
])

export const quantityConversions = pgTable('quantity_conversions', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromUnit: quantityUnitEnum('from_unit').notNull(),
  toUnit: quantityUnitEnum('to_unit').notNull(),
  multiplier: numeric('multiplier', { precision: 20, scale: 9, mode: 'number' }).notNull(),
  method: conversionMethodEnum('method').notNull(),
  source: text('source'),
  sourceVersion: text('source_version'),
  confidence: numeric('confidence', { precision: 4, scale: 3, mode: 'number' }),
  verified: boolean('verified').notNull().default(false),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
}, (table) => [
  uniqueIndex('quantity_conversions_from_to_unique').on(table.fromUnit, table.toUnit),
  check('quantity_conversions_multiplier_positive', sql`${table.multiplier} > 0`),
  check('quantity_conversions_confidence_range', sql`${table.confidence} IS NULL OR (${table.confidence} >= 0 AND ${table.confidence} <= 1)`),
])

export const packagingTypes = pgTable('packaging_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  countable: boolean('countable').notNull().default(false),
  requiresDeclaredContents: boolean('requires_declared_contents').notNull().default(true),
})
// A named set of types one list item can ask for at once ("Kuřecí maso" = every raw part of the
// chicken, owner decision 2026-10-03/04). A type may be in several groups ("Kuřecí mleté" is in
// "Kuřecí maso" and "Mleté maso").
export const productTypeGroups = pgTable('product_type_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
})

export const productTypeGroupMembers = pgTable('product_type_group_members', {
  groupId: uuid('group_id').notNull().references(() => productTypeGroups.id, { onDelete: 'cascade' }),
  typeId: uuid('type_id').notNull().references(() => productTypes.id, { onDelete: 'cascade' }),
}, (table) => [primaryKey({ columns: [table.groupId, table.typeId] })])

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  // Stable manufacturer/retailer brand identity when the source provides it. Nullable because many
  // existing receipt-created products are unbranded or not yet confidently identified.
  brand: text('brand'),
  // Variant/specification that differentiates otherwise identical product families (e.g. flavour,
  // fat percentage, formulation). Kept nullable under the same NEHÁDEJ rule as category fields.
  variant: text('variant'),
  // The name without diacritics, lower-cased ("Čerstvé mléko 1,5%" -> "cerstve mleko 1,5%"), kept by
  // the database itself so text search (lib/product-search.ts) is accent-insensitive. The character
  // map is shared with `normalizeSearchText()`, and a DB test checks the two agree.
  searchName: text('search_name').generatedAlwaysAs(sql`lower(translate(name, '${sql.raw(SEARCH_ACCENTED)}', '${sql.raw(SEARCH_PLAIN)}'))`),
  categoryId: uuid('category_id').notNull().references(() => productCategories.id),
  // Null until the categorization pipeline (lib/categorization.ts) or a household correction assigns
  // one confidently — never guessed just to fill the column (same "NEHÁDEJ" rule as defaultLocation
  // below). `set null` on delete: a subcategory is never removed by this app (the taxonomy is fixed
  // code, not user data), but the FK stays defensive rather than blocking a future one.
  subcategoryId: uuid('subcategory_id').references(() => productSubcategories.id, { onDelete: 'set null' }),
  // Tags a product as aimed at children (e.g. "Kubík") without changing its main category/subcategory
  // — spec: "Děti" must not silently replace "Potraviny ▸ Nápoje". Purely additive for reporting.
  isChildOriented: boolean('is_child_oriented').notNull().default(false),
  // Set once an administrator has decided a disputed category change of this product (approved or
  // rejected): the category is then final and no household or import can change it any more.
  categoryLocked: boolean('category_locked').notNull().default(false),
  // True for a disposable/service line that is a legitimate expense but must never become inventory
  // (a shopping bag, a bottle deposit) — set by lib/product-subcategories.ts's keyword detection or a
  // household correction, never auto-deleted (spec sections 14/15).
  isNonInventory: boolean('is_non_inventory').notNull().default(false),
  defaultUnit: itemUnitEnum('default_unit').notNull().default('ks'),
  // Where this product is remembered to live once a household has confirmed/corrected it at least
  // once (lib/db/queries.ts's upsertProductCatalogDefaults, called from a human-confirmed receipt
  // import — never from an unreviewed AI guess). Null until then, at which point
  // lib/pantry.ts's inferPantryLocation()'s keyword heuristic is used instead. Existing per the
  // owner's "BIO KUŘE" example: a correction made once must be remembered for every later receipt
  // of the same product, not re-guessed every time.
  defaultLocation: pantryLocationEnum('default_location'),
  // The product's type (druh zboží), or null when the rules find none or more than one — such a
  // product is never offered automatically for a type. `product_type_source` says who decided:
  // 'rule' (lib/product-types.ts, re-evaluated when the rules change), 'manual' (a person; never
  // overwritten by a rule) or 'alias' (taken over from a confirmed receipt match).
  productTypeId: uuid('product_type_id').references(() => productTypes.id, { onDelete: 'set null' }),
  productTypeSource: text('product_type_source'),
  // Nullable during the staged rollout: existing type assignments remain valid until subtypes are reviewed.
  productSubtypeId: uuid('product_subtype_id'),
  // Preserve classification provenance so later rules/PKD backfills can never overwrite a manual subtype choice.
  productSubtypeSource: text('product_subtype_source'),
}, (table) => [
  index('products_product_type_idx').on(table.productTypeId),
  foreignKey({
    name: 'products_product_subtype_same_type_fk',
    columns: [table.productTypeId, table.productSubtypeId],
    foreignColumns: [productSubtypes.productTypeId, productSubtypes.id],
  }).onDelete('restrict'),
  check('products_product_subtype_requires_type', sql`${table.productSubtypeId} IS NULL OR ${table.productTypeId} IS NOT NULL`),
  check('products_product_subtype_source_valid', sql`${table.productSubtypeSource} IS NULL OR ${table.productSubtypeSource} IN ('rule', 'manual', 'alias', 'pkd')`),
  check('products_product_subtype_source_matches_id', sql`(${table.productSubtypeId} IS NULL AND ${table.productSubtypeSource} IS NULL) OR (${table.productSubtypeId} IS NOT NULL AND ${table.productSubtypeSource} IS NOT NULL)`),
  check('products_product_type_source_valid', sql`${table.productTypeSource} IS NULL OR ${table.productTypeSource} IN ('rule', 'manual', 'alias')`),
  // Text search looks for a word anywhere in the name (`search_name LIKE '%mlek%'`,
  // lib/db/product-search.ts), which a plain index cannot serve: every search read all ~50,000
  // products. A trigram index can (extension pg_trgm, migration 0039).
  index('products_search_name_trgm_idx').using('gin', table.searchName.op('gin_trgm_ops')),
])


// A detected retail package size for a catalog product. Package size is canonicalized to kg/l/ks so
// the same physical size is not stored twice as "250 g" and "0.25 kg". Weight/volume packages are derived
// from reliable price observations; piece-count packages are persisted only when the product name explicitly
// confirms the count because a "ks" price alone cannot distinguish one piece from a multipack.
export const productPackages = pgTable('product_packages', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  quantity: numeric('quantity', { precision: 10, scale: 3, mode: 'number' }).notNull(),
  unit: itemUnitEnum('unit').notNull(),
  source: text('source').notNull().default('derived-from-price'),
  confidence: numeric('confidence', { precision: 4, scale: 3, mode: 'number' }).notNull().default(0.750),
  firstSeenAt: date('first_seen_at').notNull(),
  lastSeenAt: date('last_seen_at').notNull(),
  observationCount: integer('observation_count').notNull().default(1),
  // Optional richer retail-package metadata. `quantity` + `unit` remain the total consumer-package
  // comparison size; these fields preserve an inner unit/count such as 10 × 14 g without losing the
  // canonical total size used by price comparison. Existing derived packages leave them null.
  packageCount: integer('package_count'),
  packageUnitQuantity: numeric('package_unit_quantity', { precision: 10, scale: 3, mode: 'number' }),
  packageUnit: itemUnitEnum('package_unit'),
  packageType: text('package_type'),
  // Universal PKD normalization metadata. Null means the package has not been safely normalized.
  baseUnit: quantityUnitEnum('base_unit'),
  conversionMethod: conversionMethodEnum('conversion_method'),
  conversionConfidence: numeric('conversion_confidence', { precision: 4, scale: 3, mode: 'number' }),
  netQuantity: numeric('net_quantity', { precision: 20, scale: 9, mode: 'number' }),
  netUnit: quantityUnitEnum('net_unit'),
  drainedQuantity: numeric('drained_quantity', { precision: 20, scale: 9, mode: 'number' }),
  drainedUnit: quantityUnitEnum('drained_unit'),
}, (table) => [
  uniqueIndex('product_packages_product_size_unique').on(table.productId, table.quantity, table.unit),
  check('product_packages_quantity_positive', sql`${table.quantity} > 0`),
  check('product_packages_canonical_unit', sql`${table.unit} IN ('ks', 'kg', 'l')`),
  check('product_packages_package_count_positive', sql`${table.packageCount} IS NULL OR ${table.packageCount} > 0`),
  check('product_packages_package_unit_quantity_positive', sql`${table.packageUnitQuantity} IS NULL OR ${table.packageUnitQuantity} > 0`),
  check('product_packages_package_unit_pair', sql`(${table.packageUnitQuantity} IS NULL AND ${table.packageUnit} IS NULL) OR (${table.packageUnitQuantity} IS NOT NULL AND ${table.packageUnit} IS NOT NULL)`),
  check('product_packages_conversion_confidence_range', sql`${table.conversionConfidence} IS NULL OR (${table.conversionConfidence} >= 0 AND ${table.conversionConfidence} <= 1)`),
  check('product_packages_net_quantity_positive', sql`${table.netQuantity} IS NULL OR ${table.netQuantity} > 0`),
  check('product_packages_drained_quantity_positive', sql`${table.drainedQuantity} IS NULL OR ${table.drainedQuantity} > 0`),
])


// A reusable abbreviation/alias → product mapping (spec section 6), e.g. Lidl's "MAT 15" → Mattoni
// 1.5 l. Global (`storeId` null) or store-specific — different retailers can abbreviate the same
// product differently, so a store-specific row must be checked before falling back to a global one
// (lib/categorization.ts's matching priority). Seeded by user corrections during receipt review
// (`source: 'user_correction'`, confidence 1.0 — spec section 12, "corrections must teach the
// system") as well as, in principle, a curated seed list; nothing in this schema assumes one source
// over the other.
export const productAliases = pgTable('product_aliases', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'cascade' }),
  alias: text('alias').notNull(),
  // lib/product-normalize.ts's normalizeProductText(alias) — what matching actually compares against;
  // kept as its own column (not generated) so it can use the same normalization function the
  // matching code calls at read time, without duplicating the character-mapping logic in SQL.
  normalizedAlias: text('normalized_alias').notNull(),
  confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull().default('1.000'),
  // 'user_correction' | 'seed' | 'ai' — free text (not an enum) since new sources are expected as the
  // pipeline evolves and none of them affect matching behavior, only observability.
  source: text('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // The lookup matching actually runs: exact normalized alias, optionally narrowed to one store.
  // Not unique — the same normalized text can plausibly alias different products at different
  // stores (Lidl's "MAT 15" vs. a hypothetical different meaning at another store), but the same
  // (product, store, alias) combination should not be duplicated by repeated corrections.
  index('product_aliases_normalized_alias_idx').on(table.normalizedAlias, table.storeId),
  uniqueIndex('product_aliases_product_store_alias_unique').on(table.productId, table.storeId, table.normalizedAlias),
])

// Links a catalog product to its identity on an external price source (docs/32 "Internet Data
// Integration"), e.g. Lidl's own stable `erpNumber`. Per docs/05_BUSINESS_RULES.md ("do not treat
// product names as sufficient identifiers") and section 34 ("use stable external IDs... unique
// constraints"): re-running ingestion for the same external product must find this row instead of
// re-matching by name (which could drift) or creating a duplicate product.
export const productSeedRefs = pgTable('product_seed_refs', {
  id: uuid('id').primaryKey().defaultRandom(),
  seedId: text('seed_id').notNull(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  sourceDocument: text('source_document').notNull(),
  sourcePage: integer('source_page').notNull(),
  normalizationStatus: text('normalization_status').notNull(),
  importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('product_seed_refs_seed_id_unique').on(table.seedId),
  index('product_seed_refs_product_idx').on(table.productId),
])

// Seed package/reference data is deliberately separate from product_packages. A range such as
// "1–3 l" is reference evidence for OCR matching, not a sellable package and must never become one.
export const seedPackageReferences = pgTable('seed_package_references', {
  id: uuid('id').primaryKey().defaultRandom(),
  seedId: text('seed_id').notNull(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }),
  sourceDocument: text('source_document').notNull(),
  sourcePage: integer('source_page').notNull(),
  category: text('category').notNull(),
  subcategory: text('subcategory').notNull(),
  brand: text('brand'),
  productFamily: text('product_family').notNull(),
  resolution: text('resolution').notNull(),
  packageOptions: jsonb('package_options').notNull().default([]),
  normalizationStatus: text('normalization_status').notNull(),
  importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('seed_package_references_seed_id_unique').on(table.seedId),
  index('seed_package_references_product_idx').on(table.productId),
  index('seed_package_references_resolution_idx').on(table.resolution),
])

export const productExternalRefs = pgTable(
  'product_external_refs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    source: productSourceEnum('source').notNull(),
    externalId: text('external_id').notNull(),
    lastSeenAt: timestamp('last_seen_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('product_external_refs_source_external_id_idx').on(table.source, table.externalId),
    // Joins and cascading deletes from products look refs up by product.
    index('product_external_refs_product_idx').on(table.productId),
  ],
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
  // One branch per chain and address (migration 0011): repeated receipt imports of the same shop
  // converge on one branch instead of creating duplicates (app/actions/receipts.ts,
  // findOrCreateStoreLocation(), relies on it when two imports race). The expressions mirror the
  // application's normalization: trimmed, whitespace collapsed, case-insensitive.
  uniqueIndex('store_locations_store_address_city_unique_idx').on(
    table.storeId,
    sql`lower(regexp_replace(trim(${table.address}), '\\s+', ' ', 'g'))`,
    sql`lower(regexp_replace(trim(${table.city}), '\\s+', ' ', 'g'))`,
  ),
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
    // `store_location_id` (a chain-level row) skips the check. ON UPDATE CASCADE: a branch moved to
    // another chain (an Albert hypermarket, lib/stores/albert-formats.ts) takes its rows along.
    foreignKey({ columns: [table.storeLocationId, table.storeId], foreignColumns: [storeLocations.id, storeLocations.storeId] }).onDelete('cascade').onUpdate('cascade'),
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
  // The current price of a product in one context (product, chain, branch, scope) is its latest
  // observation (migration 0010): these serve the lookups of that latest row and a branch's history.
  index('prices_product_context_observed_idx').on(table.productId, table.storeId, table.storeLocationId, table.priceScope, table.observedAt),
  index('prices_store_location_observed_idx').on(table.storeLocationId, table.observedAt),
  // Ingestion loads the latest official chain price by store + retailer SKU; keep the index narrow and ordered for DISTINCT ON.
  index('prices_official_chain_ref_observed_idx')
    .on(table.storeId, table.sourceReference, table.observedAt.desc())
    .where(sql`${table.priceScope} = 'CHAIN' AND ${table.sourceType} = 'OFFICIAL' AND ${table.sourceReference} IS NOT NULL`),
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

// What a model read off one page of an image-only flyer (Albert: lib/ingestion/albert.ts) — the
// cached, reusable result of the only paid step of that import (CLAUDE.md section 31). A page is
// sent to the model once; every later run reads its offers from here. It is also the provenance of
// the deals made from it (CLAUDE.md section 16): which flyer, which page, when, by which model, at
// what token cost. `offers` is the model's raw output, validated again by the connector on every
// read, so a stricter validator applies to pages extracted earlier too.
export const flyerPages = pgTable('flyer_pages', {
  source: productSourceEnum('source').notNull(),
  /** The retailer's own flyer id (Albert: the Publitas publication id, e.g. "3370730"). */
  flyerId: text('flyer_id').notNull(),
  pageNumber: integer('page_number').notNull(),
  /** Which of the chain's store formats the flyer is for ("SUPERMARKET", "HYPERMARKET"). */
  locationType: text('location_type').notNull(),
  validFrom: date('valid_from').notNull(),
  validUntil: date('valid_until').notNull(),
  offers: jsonb('offers').notNull(),
  /** The page's OCR text, for a retailer whose own flyer data carries no usable text layer (Lidl). The
   *  validator checks the model's prices against it on every read, so it is kept with the page. */
  pageText: text('page_text'),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  extractedAt: timestamp('extracted_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.source, table.flyerId, table.pageNumber] }),
  check('flyer_pages_page_positive', sql`${table.pageNumber} >= 1`),
  check('flyer_pages_validity', sql`${table.validUntil} >= ${table.validFrom}`),
])

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
  // Deals are always looked up by product (and chain): a product's promotions on every page render,
  // "does it have a running promotion?" over the catalog, and the upsert of every ingested offer.
  // Without it each lookup read the whole table — 26 billion rows read by 2026-09-26, the largest
  // part of the database's compute (pg_stat_user_tables).
  index('deals_product_store_idx').on(table.productId, table.storeId),
  index('deals_validity_product_idx').on(table.validFrom, table.validUntil, table.productId),
  check('deals_unit_price_pair', sql`(${table.unit} IS NULL AND ${table.unitPrice} IS NULL) OR (${table.unit} IS NOT NULL AND ${table.unitPrice} > 0)`),
  // Same guard as member_stores: when a branch is named it must be a branch of `store_id`. MATCH
  // SIMPLE — a NULL `store_location_id` (an online chain's deal) skips the check. Cascades on update like
  // member_stores', so a branch moved to another chain keeps its deals consistent.
  foreignKey({ columns: [table.storeLocationId, table.storeId], foreignColumns: [storeLocations.id, storeLocations.storeId] }).onDelete('cascade').onUpdate('cascade'),
])

// --- Shopping lists ----------------------------------------------------------

export const shoppingLists = pgTable('shopping_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('shopping_lists_household_created_idx').on(table.householdId, table.createdAt),
])

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
  // The product types (lib/product-types.ts keys) the household chose for this item — a subset of a
  // group ("Kuřecí maso", but only breast and thighs) or a type picked by hand. Null: the types come
  // from the item's name (`resolveListItemTypes`), or none, and the planner searches by text.
  productTypes: text('product_types').array(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  // Set once a "shopping reminder" notification has covered this item (see the cron job at
  // app/api/cron/shopping-reminders). Null means never reminded yet. Prevents the same
  // still-undone item from generating a new reminder every day the job runs.
  remindedAt: timestamp('reminded_at'),
}, (table) => [
  index('shopping_list_items_list_created_idx').on(table.listId, table.createdAt),
  index('shopping_list_items_checked_purchase_idx').on(table.checkedByPurchaseId),
])

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
}, (table) => [
  index('purchases_household_date_idx').on(table.householdId, table.date),
])

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
  // The line's shopping category at the time of purchase (lib/purchase-expenses.ts's automatic
  // expense split reads this) — null for a row written before this column existed; that purchase's
  // split cannot be recomputed later since its per-line category was never kept, only used once and
  // discarded (CLAUDE.md section 5: never invent it after the fact).
  category: itemCategoryEnum('category'),
  // The line's subcategory within `category` (lib/product-subcategories.ts's fixed list) as decided
  // by the categorization pipeline or a household correction — null for a line categorization never
  // reached (e.g. rows written before this column existed, or a category so uncertain no subcategory
  // could be offered either). Kept alongside `category` for the same reason that column exists: so a
  // purchase's per-line classification survives independent of the product catalog changing later.
  subcategoryId: uuid('subcategory_id').references(() => productSubcategories.id, { onDelete: 'set null' }),
  // Superseded 2026-09-27 by `purchase_item_expense_splits` (a line can now split across more than
  // one expense target, e.g. clothing that was actually half adult, half a child's — a receipt often
  // doesn't say). No longer read or written; kept only so a running deployment mid-rollout of that
  // change still has a consistent schema. Drop in a later migration once nothing references it
  // (CLAUDE.md section 7: rename/drop only after no running code uses it).
  expenseCategory: expenseCategoryEnum('expense_category'),
  expenseSubcategory: text('expense_subcategory'),
}, (table) => [
  index('purchase_items_purchase_idx').on(table.purchaseId),
  index('purchase_items_product_idx').on(table.productId),
  check('purchase_items_expense_subcategory_needs_category', sql`${table.expenseSubcategory} IS NULL OR ${table.expenseCategory} IS NOT NULL`),
])

// A purchase-item's paid amount split across one or more expense targets — the household's own
// override of the automatic category mapping, e.g. a gift bought during a grocery trip (Ostatní ▸
// Dárky) or a "Oblečení" line that was actually half adult, half children's wear, which the receipt
// itself never distinguishes. No rows for an item means "use the automatic mapping" for its whole
// amount; one row means a plain reassignment; two or more means a genuine split. The rows' amounts
// must add up to exactly the item's own paid amount (`price × quantity`) — enforced by
// lib/db/purchase-items.ts, not by the database, since that check spans two tables.
export const purchaseItemExpenseSplits = pgTable('purchase_item_expense_splits', {
  id: uuid('id').primaryKey().defaultRandom(),
  purchaseItemId: uuid('purchase_item_id').notNull().references(() => purchaseItems.id, { onDelete: 'cascade' }),
  category: expenseCategoryEnum('category').notNull(),
  subcategory: text('subcategory'),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
}, (table) => [
  // A purchase-item's splits are always read and rewritten together.
  index('purchase_item_expense_splits_item_idx').on(table.purchaseItemId),
  check('purchase_item_expense_splits_amount_positive', sql`${table.amount} > 0`),
])

// Remembers a household's own expense-category choice for a product (owner request, 2026-09-27:
// "aplikace by se měla postupně učit a postupně přiřazovat kategorie a podkategorie sama ihned po
// importu účtenky") — so a plain, whole-item reassignment (not a multi-way split, which is treated
// as specific to that one purchase, not a repeating pattern) applies automatically to every later
// receipt of the same product, the same way `products.default_location` already does for pantry
// placement. Per-household, not on `products` itself: whether "Oblečení" means a child's or an
// adult's depends on the household, unlike where milk belongs in a kitchen.
export const householdProductExpenseDefaults = pgTable('household_product_expense_defaults', {
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  category: expenseCategoryEnum('category').notNull(),
  subcategory: text('subcategory'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.householdId, table.productId] })])

// A household's own override of how many days a pantry item of a category can go unconfirmed before
// being asked "do you still have this?" (spec section 13) — `lib/pantry.ts`'s
// `CHECKIN_DAYS_BY_CATEGORY` is the fixed default a category falls back to without one. Same
// "override table alongside a fixed default" shape as `expense_category_budgets`.
export const pantryCheckinIntervals = pgTable('pantry_checkin_intervals', {
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  category: itemCategoryEnum('category').notNull(),
  days: integer('days').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.householdId, table.category] }),
  check('pantry_checkin_intervals_days_positive', sql`${table.days} > 0`),
])

// The same override at subcategory level (Potraviny ▸ Pečivo keeps far shorter than Konzervy). A
// separate table rather than a wider key on `pantry_checkin_intervals`, so the migration only adds and
// the code still running during a deploy keeps working. The subcategory is one of the fixed names in
// lib/product-subcategories.ts, checked by the server.
export const pantryCheckinSubcategoryIntervals = pgTable('pantry_checkin_subcategory_intervals', {
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  category: itemCategoryEnum('category').notNull(),
  subcategory: text('subcategory').notNull(),
  days: integer('days').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ name: 'pantry_checkin_subcat_intervals_pk', columns: [table.householdId, table.category, table.subcategory] }),
  check('pantry_checkin_subcategory_intervals_days_positive', sql`${table.days} > 0`),
])

// A household's own storage place beyond the fixed `pantry_location` list (spec section 12: "Uživatel
// musí mít možnost vytvořit vlastní místo") — e.g. "Kufr auta" under the Auto area, or "Sklep" under
// Bydlení. The fixed locations (Spíž, Lednice, ...) stay a plain enum on `pantry_items.location`
// unchanged (zero migration risk to existing rows); a custom place is only ever referenced through
// `pantry_items.custom_place_id` below, which — when set — is what the household actually sees as the
// item's place, not `location` (kept at its harmless default in that case; see that column's comment).
export const pantryPlaces = pgTable('pantry_places', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  area: pantryAreaEnum('area').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [uniqueIndex('pantry_places_household_area_name_unique').on(table.householdId, table.area, table.name)])

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
  // Explicit manual selection of a generic product type; null for free text or a concrete product whose type is inferred from the product.
  productTypeId: uuid('product_type_id').references(() => productTypes.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  category: itemCategoryEnum('category').notNull().default('Ostatní'),
  // The item's subcategory within `category` (lib/product-subcategories.ts) — powers the Zásoby
  // location + subcategory filtering (spec sections 17-18: "Lednice ▸ Maso a uzeniny" instead of one
  // flat list). Null when the categorization pipeline could not place it confidently; such items
  // still show up under their location, just outside any subcategory folder.
  subcategoryId: uuid('subcategory_id').references(() => productSubcategories.id, { onDelete: 'set null' }),
  // Where the item physically lives — defaults per-category/keyword-heuristic on first restock
  // (lib/pantry.ts's inferPantryLocation()), then only changes when the household moves it by
  // hand (e.g. freshly bought chilled meat into the freezer), never re-inferred on a later restock
  // of the same row — otherwise a manual move would silently get undone by the next purchase.
  location: pantryLocationEnum('location').notNull().default('Spíž'),
  // A household-created place (pantry_places above) that overrides `location` for display/grouping
  // when set — `location` keeps whatever value it had (or the harmless default) and is simply
  // ignored, so no existing code path that only knows about `location` needs to change to stay
  // correct; only the Zásoby UI and its actions need to know about this column at all.
  customPlaceId: uuid('custom_place_id').references(() => pantryPlaces.id, { onDelete: 'set null' }),
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
  tracking: pantryTrackingEnum('tracking').notNull().default('normal'),
}, (table) => [
  index('pantry_items_household_product_idx').on(table.householdId, table.productId),
  index('pantry_items_product_type_idx').on(table.householdId, table.productTypeId),
])

// Receipt import ("nahrávání nákupů přes účtenky"): prepares the ingestion path for a future OCR
// provider (lib/receipts.ts's ReceiptOcrProvider) without wiring one up yet, per CLAUDE.md section
// 30 (no AI/vision-model call before the AI phase). Every import today is `source: 'manual'` — a
// household types the receipt's line items by hand; `importReceiptAction` (app/actions/receipts.ts)
// turns them into a real purchase immediately. Kept as its own row (not just a purchases row) so a
// later OCR provider's raw output/confidence stays auditable and reprocessable, matching CLAUDE.md
// section 16's price/deal provenance rule extended to purchases.
export const receiptOcrRateLimits = pgTable('receipt_ocr_rate_limits', {
  householdId: uuid('household_id').primaryKey().references(() => households.id, { onDelete: 'cascade' }),
  windowStartedAt: timestamp('window_started_at').notNull().defaultNow(),
  attempts: integer('attempts').notNull().default(0),
})

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
}, (table) => [
  index('receipt_imports_household_status_created_idx').on(table.householdId, table.status, table.createdAt),
  index('receipt_imports_purchase_idx').on(table.purchaseId),
])

// A budget period's own amount, keyed by the period's start date (`month`); a period without a row uses
// households.monthly_budget (docs/15_BUDGET_PERIODS.md, lib/budget.ts budgetForPeriod).
export const budgets = pgTable('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  month: date('month').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
}, (table) => [uniqueIndex('budgets_household_month_unique').on(table.householdId, table.month)])

export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  // Optional product identity selected through the shared manual autocomplete. Receipt-generated expenses remain unlinked.
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  // Explicit generic product type selection; mutually exclusive with productId at the application layer.
  productTypeId: uuid('product_type_id').references(() => productTypes.id, { onDelete: 'set null' }),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  note: text('note').notNull().default(''),
  category: expenseCategoryEnum('category').notNull().default('Ostatní'),
  // Optional, one of the category's subcategories (lib/expense-categories.ts); checked by the server.
  subcategory: text('subcategory'),
  date: date('date').notNull(),
  // Set when the expense is a receipt's purchase (lib/purchase-expenses.ts): one row per
  // (category, subcategory) of its items. Goes with the purchase — its rows are replaced wholesale
  // whenever the purchase's split changes, e.g. reassigning one item's category
  // (lib/db/purchase-items.ts's recomputePurchaseExpenses), never edited by hand directly.
  purchaseId: uuid('purchase_id').references(() => purchases.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  // The overview reads a household's expenses by date.
  index('expenses_household_date_idx').on(table.householdId, table.date),
  index('expenses_product_idx').on(table.householdId, table.productId),
  index('expenses_product_type_idx').on(table.householdId, table.productTypeId),
  // A purchase is counted once per (category, subcategory), whatever retries or races happen — the
  // subcategory joined in (migration 0042) so a household's own override (e.g. one gift item moved
  // to Ostatní ▸ Dárky) gets its own row instead of colliding with the purchase's other, unmodified
  // Ostatní items. `coalesce(…, '')`: a bare unique index treats every NULL subcategory as distinct
  // from every other, which would let a retry insert the same (purchase, category, NULL) row twice.
  uniqueIndex('expenses_purchase_category_subcategory_unique')
    .on(table.purchaseId, table.category, sql`coalesce(${table.subcategory}, '')`)
    .where(sql`${table.purchaseId} IS NOT NULL`),
])

// A household's monthly limit for one expense category ("Potraviny: 8 000 Kč"), next to the overall
// monthly budget on households. Optional: a category without a row has no limit. Crossing 80 % or
// 100 % of it notifies the household once, like the overall budget (lib/db/budget-notify.ts).
export const expenseCategoryBudgets = pgTable('expense_category_budgets', {
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  category: expenseCategoryEnum('category').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.householdId, table.category] }),
  check('expense_category_budgets_amount_positive', sql`${table.amount} > 0`),
])

// A payment the household makes regularly — rent, energy advances, insurance (lib/recurring-payments.ts).
// Entered once; each due date is confirmed (it becomes an expense) or skipped in
// recurring_payment_occurrences. Stopping a payment keeps its history (`active` false).
export const recurringPayments = pgTable('recurring_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: expenseCategoryEnum('category').notNull(),
  subcategory: text('subcategory'),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  intervalMonths: integer('interval_months').notNull(),
  // The first due date; its day of the month is kept for every later one.
  startDate: date('start_date').notNull(),
  active: boolean('active').notNull().default(true),
  // The due date the household was last reminded of, so the daily cron reminds once per due date.
  remindedDueDate: date('reminded_due_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('recurring_payments_household_idx').on(table.householdId),
  check('recurring_payments_amount_positive', sql`${table.amount} > 0`),
  check('recurring_payments_interval', sql`${table.intervalMonths} IN (1, 3, 6, 12)`),
])

// One due date of a recurring payment the household dealt with: paid (with the expense it became) or
// skipped. Deleting that expense deletes this row too, so the due date waits again.
export const recurringPaymentOccurrences = pgTable('recurring_payment_occurrences', {
  recurringPaymentId: uuid('recurring_payment_id').notNull().references(() => recurringPayments.id, { onDelete: 'cascade' }),
  dueDate: date('due_date').notNull(),
  status: text('status').notNull(),
  expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.recurringPaymentId, table.dueDate] }),
  check('recurring_payment_occurrences_status', sql`(${table.status} = 'paid' AND ${table.expenseId} IS NOT NULL) OR (${table.status} = 'skipped' AND ${table.expenseId} IS NULL)`),
])

// --- Recipes -----------------------------------------------------------------

// Household-owned recipe bookmarks. Only normalized recipe metadata is stored; the original cooking
// instructions remain on the source website (docs/10_RECIPES.md).
export const recipeFavorites = pgTable('recipe_favorites', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  sourceId: text('source_id').notNull(),
  sourceName: text('source_name').notNull(),
  sourceUrl: text('source_url').notNull(),
  canonicalUrl: text('canonical_url').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  servings: numeric('servings', { precision: 8, scale: 2 }),
  totalTimeMinutes: integer('total_time_minutes'),
  ratingValue: numeric('rating_value', { precision: 6, scale: 3 }),
  ratingScale: numeric('rating_scale', { precision: 6, scale: 3 }),
  ratingCount: integer('rating_count'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('recipe_favorites_household_canonical_unique').on(table.householdId, table.canonicalUrl),
  index('recipe_favorites_household_created_idx').on(table.householdId, table.createdAt),
])

// Last opened recipe per household. Re-opening updates the timestamp and count instead of storing
// an unbounded event stream. This is enough for the v1 "Historie" list while keeping the table small.
export const recipeHistory = pgTable('recipe_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  sourceId: text('source_id').notNull(),
  sourceName: text('source_name').notNull(),
  sourceUrl: text('source_url').notNull(),
  canonicalUrl: text('canonical_url').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  servings: numeric('servings', { precision: 8, scale: 2 }),
  totalTimeMinutes: integer('total_time_minutes'),
  ratingValue: numeric('rating_value', { precision: 6, scale: 3 }),
  ratingScale: numeric('rating_scale', { precision: 6, scale: 3 }),
  ratingCount: integer('rating_count'),
  firstViewedAt: timestamp('first_viewed_at', { withTimezone: true }).notNull().defaultNow(),
  lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }).notNull().defaultNow(),
  viewCount: integer('view_count').notNull().default(1),
}, (table) => [
  uniqueIndex('recipe_history_household_canonical_unique').on(table.householdId, table.canonicalUrl),
  index('recipe_history_household_last_viewed_idx').on(table.householdId, table.lastViewedAt),
])

// --- Meal plans & notifications ------------------------------------------------

// Persistent shared recipe catalog populated by the source importers. Unlike favorites/history,
// this table is global: it is not household-owned. Cooking instructions are intentionally not stored;
// users open sourceUrl for the full recipe (docs/10_RECIPES.md).
export const recipeCatalog = pgTable('recipe_catalog', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: text('source_id').notNull(),
  sourceName: text('source_name').notNull(),
  sourceUrl: text('source_url').notNull(),
  canonicalUrl: text('canonical_url').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  sourceImageUrl: text('source_image_url'),
  imageRef: text('image_ref'),
  servings: numeric('servings', { precision: 8, scale: 2 }),
  servingsText: text('servings_text'),
  prepTimeMinutes: integer('prep_time_minutes'),
  cookTimeMinutes: integer('cook_time_minutes'),
  totalTimeMinutes: integer('total_time_minutes'),
  category: text('category'),
  cuisine: text('cuisine'),
  ratingValue: numeric('rating_value', { precision: 6, scale: 3 }),
  ratingScale: numeric('rating_scale', { precision: 6, scale: 3 }),
  ratingCount: integer('rating_count'),
  ratingSource: text('rating_source'),
  ingredients: jsonb('ingredients').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
  parserVersion: integer('parser_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  searchText: text('search_text').notNull().default(''),
}, (table) => [
  uniqueIndex('recipe_catalog_canonical_url_unique').on(table.canonicalUrl),
  index('recipe_catalog_source_idx').on(table.sourceId, table.updatedAt),
  index('recipe_catalog_title_idx').on(table.title),
  index('recipe_catalog_search_text_trgm_idx').using('gin', table.searchText.op('gin_trgm_ops')),
])

export const mealPlans = pgTable('meal_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  weekStart: date('week_start').notNull(),
  budgetLimit: numeric('budget_limit', { precision: 10, scale: 2 }).notNull(),
  estimatedTotal: numeric('estimated_total', { precision: 10, scale: 2 }).notNull(),
  plan: text('plan').notNull(), // JSON-serialized WeeklyMealPlan snapshot
  generatedAt: timestamp('generated_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('meal_plans_household_week_unique_idx').on(table.householdId, table.weekStart),
])

// One row per chain and flyer start date announced as "Nové akce v <chain>" (docs/21_NEW_FLYER_NOTIFICATIONS.md),
// written before the notifications go out so a flyer is never announced twice.
export const dealAnnouncements = pgTable(
  'deal_announcements',
  {
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    validFrom: date('valid_from').notNull(),
    dealCount: integer('deal_count').notNull(),
    announcedAt: timestamp('announced_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.storeId, table.validFrom] }), check('deal_announcements_deal_count_check', sql`${table.dealCount} >= 0`)],
)

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  detail: text('detail').notNull(),
  unread: boolean('unread').notNull().default(true),
  // Which kind of message it is (lib/notification-kinds.ts); NULL for rows written before kinds existed.
  kind: text('kind'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('notifications_household_created_idx').on(table.householdId, table.createdAt),
])

// Kinds of notification a member switched off (docs/14_NOTIFICATION_PREFERENCES.md). Only "off" is
// stored; a missing row means the member gets that kind. Migration 0066 checks `kind` against the list.
// Each member's answers to the eating questionnaire (docs/17_DIET_PREFERENCES.md); no row = eats everything.
// The check constraints in migration 0068 list the same keys as lib/diet.ts.
export const memberDiets = pgTable('member_diets', {
  memberId: uuid('member_id').primaryKey().references(() => householdMembers.id, { onDelete: 'cascade' }),
  diet: text('diet').notNull().default('none'),
  avoids: text('avoids').array().notNull().default([]),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const memberNotificationSettings = pgTable(
  'member_notification_settings',
  {
    memberId: uuid('member_id').notNull().references(() => householdMembers.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.memberId, table.kind] })],
)

// One browser/phone that agreed to receive push notifications for a household member (Web Push,
// lib/push/). `endpoint` is the push service URL the browser created for this app and identifies the
// device, so it is unique: re-subscribing the same browser updates its row instead of adding another,
// and a browser handed to a different account moves with it. Deleted when the push service reports
// the subscription gone (404/410), when the member turns push off, or with the member/household.
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id').notNull().references(() => householdMembers.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    // The browser's ECDH public key and auth secret (base64url) that each message is encrypted for.
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    // Last time a push was accepted by the push service for this device.
    lastSuccessAt: timestamp('last_success_at'),
  },
  (table) => [
    uniqueIndex('push_subscriptions_endpoint_unique').on(table.endpoint),
    index('push_subscriptions_household_idx').on(table.householdId),
    check('push_subscriptions_endpoint_https', sql`${table.endpoint} LIKE 'https://%'`),
  ],
)

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
  pushSubscriptions: many(pushSubscriptions),
  invitations: many(invitations),
  pantryItems: many(pantryItems),
  pantryPlaces: many(pantryPlaces),
  pantryCheckinIntervals: many(pantryCheckinIntervals),
  receiptImports: many(receiptImports),
}))

export const pantryCheckinIntervalsRelations = relations(pantryCheckinIntervals, ({ one }) => ({
  household: one(households, { fields: [pantryCheckinIntervals.householdId], references: [households.id] }),
}))

export const pantryCheckinSubcategoryIntervalsRelations = relations(pantryCheckinSubcategoryIntervals, ({ one }) => ({
  household: one(households, { fields: [pantryCheckinSubcategoryIntervals.householdId], references: [households.id] }),
}))

export const pantryPlacesRelations = relations(pantryPlaces, ({ one }) => ({
  household: one(households, { fields: [pantryPlaces.householdId], references: [households.id] }),
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
  subcategory: one(productSubcategories, { fields: [products.subcategoryId], references: [productSubcategories.id] }),
  productType: one(productTypes, { fields: [products.productTypeId], references: [productTypes.id] }),
  productSubtype: one(productSubtypes, { fields: [products.productSubtypeId], references: [productSubtypes.id] }),
  prices: many(prices),
  deals: many(deals),
  externalRefs: many(productExternalRefs),
  aliases: many(productAliases),
  packages: many(productPackages),
}))

export const productSubcategoriesRelations = relations(productSubcategories, ({ many }) => ({
  products: many(products),
}))

export const productSubtypesRelations = relations(productSubtypes, ({ one, many }) => ({
  productType: one(productTypes, { fields: [productSubtypes.productTypeId], references: [productTypes.id] }),
  products: many(products),
}))

export const productTypesRelations = relations(productTypes, ({ many }) => ({
  products: many(products),
  subtypes: many(productSubtypes),
  groups: many(productTypeGroupMembers),
}))

export const pkdSourcesRelations = relations(pkdSources, ({ many }) => ({
  mappings: many(pkdExternalMappings),
}))

export const pkdProductTypeCandidatesRelations = relations(pkdProductTypeCandidates, () => ({}))

export const pkdEntriesRelations = relations(pkdEntries, ({ one, many }) => ({
  productType: one(productTypes, { fields: [pkdEntries.productTypeId], references: [productTypes.id] }),
  synonyms: many(pkdSynonyms),
  externalMappings: many(pkdExternalMappings),
}))

export const pkdSynonymsRelations = relations(pkdSynonyms, ({ one }) => ({
  entry: one(pkdEntries, { fields: [pkdSynonyms.entryId], references: [pkdEntries.id] }),
}))

export const pkdExternalMappingsRelations = relations(pkdExternalMappings, ({ one }) => ({
  entry: one(pkdEntries, { fields: [pkdExternalMappings.entryId], references: [pkdEntries.id] }),
  source: one(pkdSources, { fields: [pkdExternalMappings.sourceId], references: [pkdSources.id] }),
}))

export const productTypeGroupsRelations = relations(productTypeGroups, ({ many }) => ({
  members: many(productTypeGroupMembers),
}))

export const productTypeGroupMembersRelations = relations(productTypeGroupMembers, ({ one }) => ({
  group: one(productTypeGroups, { fields: [productTypeGroupMembers.groupId], references: [productTypeGroups.id] }),
  type: one(productTypes, { fields: [productTypeGroupMembers.typeId], references: [productTypes.id] }),
}))

export const productAliasesRelations = relations(productAliases, ({ one }) => ({
  product: one(products, { fields: [productAliases.productId], references: [products.id] }),
  store: one(stores, { fields: [productAliases.storeId], references: [stores.id] }),
}))

export const productExternalRefsRelations = relations(productExternalRefs, ({ one }) => ({
  product: one(products, { fields: [productExternalRefs.productId], references: [products.id] }),
}))

export const productPackagesRelations = relations(productPackages, ({ one }) => ({
  product: one(products, { fields: [productPackages.productId], references: [products.id] }),
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
  // `many` even though a receipt import points at a purchase one-to-one in practice — Drizzle needs
  // the plural relation to query in this direction; whether it's non-empty is what matters
  // (lib/db/queries.ts: a purchase with no completed shopping-list origin came from a receipt).
  receiptImports: many(receiptImports),
}))

export const purchaseItemsRelations = relations(purchaseItems, ({ one, many }) => ({
  purchase: one(purchases, { fields: [purchaseItems.purchaseId], references: [purchases.id] }),
  product: one(products, { fields: [purchaseItems.productId], references: [products.id] }),
  subcategory: one(productSubcategories, { fields: [purchaseItems.subcategoryId], references: [productSubcategories.id] }),
  expenseSplits: many(purchaseItemExpenseSplits),
}))

export const purchaseItemExpenseSplitsRelations = relations(purchaseItemExpenseSplits, ({ one }) => ({
  purchaseItem: one(purchaseItems, { fields: [purchaseItemExpenseSplits.purchaseItemId], references: [purchaseItems.id] }),
}))

export const householdProductExpenseDefaultsRelations = relations(householdProductExpenseDefaults, ({ one }) => ({
  household: one(households, { fields: [householdProductExpenseDefaults.householdId], references: [households.id] }),
  product: one(products, { fields: [householdProductExpenseDefaults.productId], references: [products.id] }),
}))

export const pantryItemsRelations = relations(pantryItems, ({ one }) => ({
  household: one(households, { fields: [pantryItems.householdId], references: [households.id] }),
  product: one(products, { fields: [pantryItems.productId], references: [products.id] }),
  subcategory: one(productSubcategories, { fields: [pantryItems.subcategoryId], references: [productSubcategories.id] }),
  customPlace: one(pantryPlaces, { fields: [pantryItems.customPlaceId], references: [pantryPlaces.id] }),
}))

export const receiptImportsRelations = relations(receiptImports, ({ one }) => ({
  household: one(households, { fields: [receiptImports.householdId], references: [households.id] }),
  store: one(stores, { fields: [receiptImports.storeId], references: [stores.id] }),
  storeLocation: one(storeLocations, { fields: [receiptImports.storeLocationId], references: [storeLocations.id] }),
  purchase: one(purchases, { fields: [receiptImports.purchaseId], references: [purchases.id] }),
}))

// Ideas for improving the app, sent by household members from the account menu ("Nápady pro
// zlepšení"). The owner of the project reads them, decides which are relevant and moves them through
// `status`; the household sees the status of its own ideas. Kept with the household so an idea lives
// and dies with it; `member_id` is only informational (who wrote it), so leaving does not erase it.
export const ideaStatusEnum = pgEnum('idea_status', ['new', 'planned', 'done', 'declined'])

export const featureIdeas = pgTable(
  'feature_ideas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id').references(() => householdMembers.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    details: text('details'),
    status: ideaStatusEnum('status').notNull().default('new'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The household's list is read newest first.
    index('feature_ideas_household_created_idx').on(table.householdId, table.createdAt),
    check('feature_ideas_title_length', sql`char_length(${table.title}) BETWEEN 1 AND 120`),
    check('feature_ideas_details_length', sql`${table.details} IS NULL OR char_length(${table.details}) <= 2000`),
  ],
)

// Accounts that administer the app itself (a role of the whole application, not of one household —
// unlike `household_members.role`). `user_id` is the Neon Auth user id; its foreign key to
// `neon_auth.user` is in the hand-written part of migration 0041 (Drizzle does not model that
// schema). Rows are added by the owner of the
// project with `pnpm db:set-admin <email>`; nothing in the app can grant it, so a request can never
// make itself an admin. Admins can review and manage everyone's improvement ideas.
export const appAdmins = pgTable('app_admins', {
  userId: uuid('user_id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Every change of a shared catalog product's subcategory that a household made by hand (from the
// pantry). The catalog is shared by all households, so a product moved back and forth is a sign of
// disagreement: the first few moves apply at once, later ones wait here as 'pending' until an
// administrator approves or rejects them (lib/product-subcategory-changes.ts). `from_subcategory_id`
// null means the product had none yet — that first placement is not counted as a move.
export const productSubcategoryChanges = pgTable(
  'product_subcategory_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    fromSubcategoryId: uuid('from_subcategory_id').references(() => productSubcategories.id, { onDelete: 'set null' }),
    toSubcategoryId: uuid('to_subcategory_id').notNull().references(() => productSubcategories.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('applied'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedBy: uuid('decided_by'),
  },
  (table) => [
    index('product_subcategory_changes_product_status_idx').on(table.productId, table.status),
    // One household cannot pile up the same waiting proposal twice.
    uniqueIndex('product_subcategory_changes_pending_unique')
      .on(table.productId, table.householdId, table.toSubcategoryId)
      .where(sql`${table.status} = 'pending'`),
    check('product_subcategory_changes_status_valid', sql`${table.status} IN ('applied', 'pending', 'approved', 'rejected')`),
  ],
)

// Households' hand-made category changes of a shared catalog product, mirroring
// product_subcategory_changes: the first few apply at once, a further one waits as 'pending' for an
// administrator, whose decision (either way) locks the product's category for good
// (`products.category_locked`, lib/product-subcategory-changes.ts).
export const productCategoryChanges = pgTable(
  'product_category_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    fromCategoryId: uuid('from_category_id').notNull().references(() => productCategories.id, { onDelete: 'cascade' }),
    toCategoryId: uuid('to_category_id').notNull().references(() => productCategories.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('applied'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedBy: uuid('decided_by'),
  },
  (table) => [
    index('product_category_changes_product_status_idx').on(table.productId, table.status),
    uniqueIndex('product_category_changes_pending_unique')
      .on(table.productId, table.householdId, table.toCategoryId)
      .where(sql`${table.status} = 'pending'`),
    check('product_category_changes_status_valid', sql`${table.status} IN ('applied', 'pending', 'approved', 'rejected')`),
  ],
)

export const productCategoryChangesRelations = relations(productCategoryChanges, ({ one }) => ({
  product: one(products, { fields: [productCategoryChanges.productId], references: [products.id] }),
  household: one(households, { fields: [productCategoryChanges.householdId], references: [households.id] }),
  from: one(productCategories, { fields: [productCategoryChanges.fromCategoryId], references: [productCategories.id] }),
  to: one(productCategories, { fields: [productCategoryChanges.toCategoryId], references: [productCategories.id] }),
}))

export const productSubcategoryChangesRelations = relations(productSubcategoryChanges, ({ one }) => ({
  product: one(products, { fields: [productSubcategoryChanges.productId], references: [products.id] }),
  household: one(households, { fields: [productSubcategoryChanges.householdId], references: [households.id] }),
  from: one(productSubcategories, { fields: [productSubcategoryChanges.fromSubcategoryId], references: [productSubcategories.id] }),
  to: one(productSubcategories, { fields: [productSubcategoryChanges.toSubcategoryId], references: [productSubcategories.id] }),
}))
