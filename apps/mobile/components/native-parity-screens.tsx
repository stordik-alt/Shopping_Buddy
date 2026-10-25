import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { ArrowDown, ArrowRight, Bell, ChevronDown, CookingPot, House, MapPin, MoreHorizontal, Package, Pencil, PiggyBank, Plus, Repeat, ReceiptText, Search, ShoppingBag, ShoppingCart, Sparkles, Star, Store, Tag, Trash2, TrendingUp, Users, WalletCards, X } from 'lucide-react-native'
import * as SecureStore from 'expo-secure-store'
import { useMobileTheme, type ThemePreference } from '../lib/theme'
import { addHouseholdChild, addHouseholdMember, createHouseholdInvitation, createMobileManualPurchase, deleteMobileAccount, deleteMobilePurchase, dismissNotification, dismissRestockSuggestion, getDashboardSummary, getDealsPage, getHouseholdAuditLog, getHouseholdInvitations, getMealPlan, getNotificationPreferences, getNotifications, getPantrySettings, getPurchaseHistory, getStoreBranches, getStoreChains, getStorePreferences, MobileApiError, recordMobilePurchaseExpenses, removeHouseholdChild, removeHouseholdMember, resetHouseholdData, revokeHouseholdInvitation, sendTestPushNotification, updateHouseholdMemberDiet, updateHouseholdPreferences, updateHouseholdProfile, updateMobilePurchaseItemExpenseSplits, updateNotificationPreference, updatePantrySettings, updateStorePreferences, type MobileAuditEntry, type MobileBranchPage, type MobileChainTile, type MobileDashboardSummary, type MobileDealCategory, type MobileDealsPage, type MobileDealSort, type MobileDietAvoid, type MobileDietKey, type MobileHouseholdChild, type MobileHouseholdInvitation, type MobileHouseholdMember, type MobileHouseholdPreferences, type MobileHouseholdProfileData, type MobileMemberDiet, type MobileMealPlan, type MobileNotification, type MobileNotificationPreference, type MobilePantrySettings, type MobilePantryStockLevel, type MobilePurchase, type MobileStoreSelection } from '../lib/shopping-list-api'
import { dismissalKey } from '../../../lib/pantry-restock'
import { assessDealQuality, dealDiscount, effectivePrice } from '../../../lib/prices'
import { DIET_AVOIDS, DIETS, dietLabels } from '../../../lib/diet'
import { CHECKIN_DAYS_BY_CATEGORY, CHECKIN_DAYS_BY_SUBCATEGORY, PANTRY_AREAS, PANTRY_LOCATIONS, checkinSubcategoryKey } from '../../../lib/pantry'
import { EXPENSE_CATEGORY_NAMES, subcategoriesOf, type ExpenseCategory } from '../../../lib/expense-categories'
import { subcategoriesOfItem } from '../../../lib/product-subcategories'
import { automaticExpenseCategory, type ExpenseSplitPart } from '../../../lib/purchase-expenses'
import { PRODUCT_TYPES } from '../../../lib/product-types'
import { DOSE_TYPE_KEYS } from '../../../lib/units'
import { ITEM_UNITS, unitLabel, type ItemUnit } from '@anitka/shared/units'
import { MAX_DISTANCE_KM, MAX_SHOP_STORES, normalizeDistanceKm, parseDistanceInput } from '../../../lib/nearby-stores'
import { BRANCH_PAGE_SIZE } from '../../../lib/stores/branch-search'
import { chainFamily } from '../../../lib/stores/chain-family'
import { disableDevicePush, enableDevicePush, readDevicePushState, type DevicePushState } from '../lib/push-notifications'
import { expenseCategoryColor } from '../lib/chart-colors'
import { currentWeekStart, DAYS } from '../../../lib/meal-plans'
import { auditDetailText, auditLabel } from '../../../lib/audit'
import { confirmsHouseholdName, DATA_RESET_GROUPS, DATA_RESET_LABELS, type DataResetGroup } from '../../../lib/data-reset'
import { averageMonthlySpend, favoriteStores, mostBoughtProducts, repeatPurchases } from '../../../lib/purchase-history'
import { todayInPrague } from '../../../lib/today'
import type { ItemCategory, ManualPurchaseInput } from '../../../lib/types'
import { confirmsEmail } from '../../../lib/account-deletion'
import { deleteSignedInUser } from '../lib/auth'

export type NativeTab = 'home' | 'shopping' | 'pantry' | 'budget' | 'deals' | 'stores' | 'recipes' | 'profile'
type TabLabel = NativeTab

const navItems: { key: NativeTab | 'more'; label: string; Icon: typeof House }[] = [
  { key: 'home', label: 'Domů', Icon: House },
  { key: 'shopping', label: 'Nákup', Icon: ShoppingCart },
  { key: 'pantry', label: 'Zásoby', Icon: Package },
  { key: 'budget', label: 'Rozpočet', Icon: WalletCards },
  { key: 'more', label: 'Více', Icon: MoreHorizontal },
]
const moreItems: { key: TabLabel; label: string; Icon: typeof House }[] = [
  { key: 'deals', label: 'Akce', Icon: Tag },
  { key: 'stores', label: 'Obchody', Icon: Store },
  { key: 'recipes', label: 'Recepty', Icon: CookingPot },
  { key: 'profile', label: 'Profil', Icon: Users },
]

const retailerLogos: Record<string, number> = {
  Lidl: require('../assets/retailer-logos/lidl.png'),
  Kaufland: require('../assets/retailer-logos/kaufland.png'),
  Billa: require('../assets/retailer-logos/billa.png'),
  Penny: require('../assets/retailer-logos/penny.png'),
}
const retailerFallbacks: Record<string, string> = { Albert: '#f4b183', JIP: '#c9b8ef' }
const RECOMMENDATIONS_COLLAPSED_KEY = 'anitka.recommendations.collapsed'

function NativeStoreMark({ chain }: { chain: string }) {
  const family = chainFamily(chain)
  const source = retailerLogos[family]
  const styles = useStyles()
  if (source) return <View style={styles.storeLogo}><Image accessibilityElementsHidden resizeMode="contain" source={source} style={styles.storeLogoImage} /></View>
  return <View accessibilityElementsHidden style={[styles.storeLogo, { backgroundColor: retailerFallbacks[family] ?? '#e8e8e4' }]}><Text style={styles.storeLogoText}>{family.slice(0, 3)}</Text></View>
}

export function NativeBottomNav({ active, onSelect }: { active: NativeTab; onSelect: (tab: NativeTab) => void }) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = moreItems.some((item) => item.key === active)
  return (
    <>
      <View accessibilityRole="tablist" style={styles.tabBar}>
        {navItems.map(({ key, label, Icon }) => {
          const selected = key === 'more' ? moreActive : active === key
          return (
            <Pressable accessibilityRole="tab" accessibilityState={{ selected }} key={key} onPress={() => key === 'more' ? setMoreOpen(true) : onSelect(key)} style={styles.tabButton}>
              <View style={[styles.tabIcon, selected && styles.tabIconActive]}><Icon color={selected ? colors.accentText : colors.mutedText} size={20} /></View>
              <Text numberOfLines={1} style={[styles.tabLabel, selected && styles.tabLabelActive]}>{label}</Text>
            </Pressable>
          )
        })}
      </View>
      <Modal animationType="slide" onRequestClose={() => setMoreOpen(false)} transparent visible={moreOpen}>
        <Pressable accessibilityLabel="Zavřít nabídku" onPress={() => setMoreOpen(false)} style={styles.modalScrim}>
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.moreSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Další sekce</Text>
            {moreItems.map(({ key, label, Icon }) => (
              <Pressable accessibilityRole="button" key={key} onPress={() => { setMoreOpen(false); onSelect(key) }} style={styles.moreItem}>
                <View style={styles.moreItemIcon}><Icon color={colors.primary} size={20} /></View>
                <Text style={styles.moreItemText}>{label}</Text>
                <ArrowRight color={colors.mutedText} size={18} />
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

export function NativeHomeScreen({ name, onSelect, onAddToShopping, onOpenReceipts, onQuickExpense, onCheckPantry, hasPreferences }: { name: string; onSelect: (tab: NativeTab) => void; onAddToShopping: (name: string, quantity?: number, unit?: ItemUnit) => void; onOpenReceipts: (receiptId?: string) => void; onQuickExpense: () => void; onCheckPantry: () => void; hasPreferences: boolean }) {
  const { colors, theme } = useMobileTheme()
  const styles = useStyles()
  const [dashboard, setDashboard] = useState<MobileDashboardSummary | null>(null)
  const [restockDismissed, setRestockDismissed] = useState<string[]>([])
  const [pantryItemCount, setPantryItemCount] = useState(0)
  const [mealPlan, setMealPlan] = useState<MobileMealPlan | null>(null)
  const [preferredDeals, setPreferredDeals] = useState<MobileDealsPage | null>(null)
  const [recommendationsCollapsed, setRecommendationsCollapsed] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getDashboardSummary().then((result) => {
      if (cancelled) return
      setDashboard(result)
      setRestockDismissed(result.restockDismissed)
      setPantryItemCount(result.pantryItemCount)
    }).catch(() => {
      if (!cancelled) setError('Přehled se nepodařilo načíst. Zkuste obnovit připojení.')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    getMealPlan().then(({ plan }) => { if (!cancelled) setMealPlan(plan) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let active = true
    SecureStore.getItemAsync(RECOMMENDATIONS_COLLAPSED_KEY)
      .then((value) => { if (active) setRecommendationsCollapsed(value === '1') })
      .catch(() => { if (active) setRecommendationsCollapsed(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (recommendationsCollapsed !== false || !hasPreferences) { setPreferredDeals(null); return }
    let cancelled = false
    getDealsPage({ forMe: true, page: 1, sort: 'discount' }).then((page) => { if (!cancelled) setPreferredDeals(page) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [hasPreferences, recommendationsCollapsed])

  const todayIso = dashboard?.today ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`
  const today = new Date(`${todayIso}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })
  const budget = dashboard?.budget ?? null
  const dashboardCategories = budget?.categories.slice().sort((a, b) => b.total - a.total) ?? []
  const dashboardCategoryMax = dashboardCategories[0]?.total ?? 1
  const shopping = dashboard?.list ?? null
  const todayDay = DAYS[(new Date().getDay() + 6) % 7]
  const todayMeals = mealPlan?.weekStart === currentWeekStart(todayIso) ? mealPlan.days.find((day) => day.day === todayDay)?.meals ?? [] : []
  const preferredDealRows = preferredDeals ? [
    ...preferredDeals.deals.map(({ product, price }) => ({ name: product.productName, store: price.store, price: price.dealPrice ?? price.regularPrice, until: price.dealValidUntil })),
    ...preferredDeals.offers.map((offer) => ({ name: offer.productName, store: offer.store, price: offer.dealPrice, until: offer.validUntil })),
  ].slice(0, 3) : []
  const attention = dashboard?.attention ?? []
  const restock = (dashboard?.restockSuggestions ?? []).filter((suggestion) => !restockDismissed.includes(dismissalKey(suggestion.productTypeKey, suggestion.offer.productId, suggestion.offer.validUntil))).slice(0, 3)
  const listDealRows = dashboard ? assessDealQuality(dashboard.productPrices, todayIso).slice(0, 3) : []
  const listOfferRows = dashboard?.offers.slice(0, Math.max(0, 3 - listDealRows.length)) ?? []

  async function dismissRestock(suggestion: (typeof restock)[number]) {
    const key = dismissalKey(suggestion.productTypeKey, suggestion.offer.productId, suggestion.offer.validUntil)
    setRestockDismissed((current) => current.includes(key) ? current : [...current, key])
    try {
      const result = await dismissRestockSuggestion({ productTypeKey: suggestion.productTypeKey, productId: suggestion.offer.productId, validUntil: suggestion.offer.validUntil })
      setRestockDismissed(result.dismissed)
    } catch {
      setRestockDismissed((current) => current.filter((entry) => entry !== key))
      setError('Návrh se nepodařilo skrýt. Zkuste to znovu.')
    }
  }

  async function toggleRecommendations() {
    const next = !(recommendationsCollapsed ?? false)
    setRecommendationsCollapsed(next)
    try {
      await SecureStore.setItemAsync(RECOMMENDATIONS_COLLAPSED_KEY, next ? '1' : '0')
    } catch {
      // The recommendations still collapse for this visit if device storage is unavailable.
    }
  }

  const hasRecommendations = restock.length > 0 || Boolean(shopping?.remaining) || hasPreferences
  return (
    <ScrollView contentContainerStyle={styles.screenContent}>
      <View style={styles.homeIntro}>
        <Text style={styles.dateText}>{today}</Text>
        <Text style={styles.greeting}>Ahoj, {name.split(' ')[0] || 'vítáme vás'}</Text>
        <Text style={styles.bodyText}>Tady je přehled vaší domácnosti.</Text>
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {attention.map((item) => <Pressable key={item.id} accessibilityRole="button" onPress={() => item.kind === 'receipt' ? onOpenReceipts(item.focus?.kind === 'receipt' ? item.focus.id : undefined) : onSelect('shopping')} style={styles.attentionCard}><Bell color={colors.warning} size={20} /><Text style={styles.attentionText}>{item.text}</Text><ArrowRight color={colors.mutedText} size={18} /></Pressable>)}
      {loading ? <ActivityIndicator color={colors.primary} size="large" style={styles.loader} /> : null}
      <Pressable onPress={() => onSelect('budget')} style={styles.dashboardCard}>
        <View style={[styles.cardIcon, styles.cardIconAccent]}><WalletCards color={colors.accentText} size={21} /></View>
        <View style={styles.dashboardText}>
          <Text style={styles.cardEyebrow}>ROZPOČET DOMÁCNOSTI</Text>
          <Text style={styles.dashboardValue}>{budget ? `Zbývá ${money(Math.max(0, budget.remaining), budget.currency)}` : 'Zobrazit rozpočet'}</Text>
          {budget ? <Text style={styles.bodyText}>Utraceno {money(budget.spent, budget.currency)} z {money(budget.budget, budget.currency)}</Text> : null}
          {budget && budget.budget > 0 ? <View accessibilityLabel={`Vyčerpáno ${Math.min(100, Math.max(0, (budget.spent / budget.budget) * 100)).toFixed(0)} procent rozpočtu`} style={styles.budgetTrack}><View style={[styles.budgetFill, budget.remaining < 0 && styles.budgetFillOver, { width: `${Math.min(100, Math.max(0, (budget.spent / budget.budget) * 100))}%` }]} /></View> : null}
        </View>
        <ArrowRight color={colors.mutedText} size={20} />
      </Pressable>
      <Pressable onPress={() => onSelect('shopping')} style={styles.dashboardCard}>
        <View style={styles.cardIcon}><ShoppingCart color={colors.primary} size={21} /></View>
        <View style={styles.dashboardText}>
          <Text style={styles.cardEyebrow}>NÁKUPNÍ SEZNAM</Text>
          <Text style={styles.dashboardValue}>{shopping ? `${shopping.remaining} k nákupu` : 'Otevřít seznam'}</Text>
          {shopping ? <Text style={styles.bodyText}>{shopping.completed} položek hotovo</Text> : null}
          {shopping?.pendingNames.map((item) => <Text key={item} numberOfLines={1} style={styles.noteText}>•  {item}</Text>)}
        </View>
        <ArrowRight color={colors.mutedText} size={20} />
      </Pressable>
      {dashboard?.weeklyAllowance != null ? <View style={styles.insightCard}><View style={styles.cardIcon}><WalletCards color={colors.primary} size={21} /></View><View style={styles.dashboardText}><Text style={styles.cardTitle}>Kolik můžete utratit tento týden</Text><Text style={styles.bodyText}>Přibližně {money(dashboard.weeklyAllowance, budget?.currency ?? 'CZK')}, aby rozpočet vystačil do konce období.</Text></View></View> : null}
      {budget?.categories.length ? <View style={styles.chartCard}>
        <Text style={styles.cardTitle}>Výdaje podle kategorií</Text>
        {dashboardCategories.map((category) => (
          <View key={category.category} style={styles.chartRow}>
            <View style={styles.chartLabelRow}><Text style={styles.bodyText}>{category.category}</Text><Text style={styles.bodyText}>{money(category.total, budget.currency)}</Text></View>
            <View style={styles.chartTrack}><View style={[styles.chartFill, { backgroundColor: expenseCategoryColor(category.category, theme), width: `${dashboardCategoryMax > 0 ? Math.min(100, category.total / dashboardCategoryMax * 100) : 0}%` }]} /></View>
          </View>
        ))}
      </View> : null}
      {pantryItemCount > 0 && (
        <Pressable onPress={onCheckPantry} style={styles.dashboardCard}>
          <View style={styles.cardIcon}><Package color={colors.primary} size={21} /></View>
          <View style={styles.dashboardText}>
            <Text style={styles.cardEyebrow}>DOMÁCÍ ZÁSOBY</Text>
            <Text style={styles.dashboardValue}>{dashboard?.pantryToCheck ? `${dashboard.pantryToCheck} položek ke kontrole` : 'Nic ke kontrole'}</Text>
            <Text style={styles.bodyText}>{pantryItemCount} uložených položek · otevřít zásoby</Text>
          </View>
          <ArrowRight color={colors.mutedText} size={20} />
        </Pressable>
      )}
      {todayMeals.length > 0 ? <View style={styles.chartCard}>
        <Pressable accessibilityRole="button" onPress={() => onSelect('recipes')} style={styles.mealCardHeading}><CookingPot color={colors.accentText} size={19} /><Text style={styles.cardTitle}>Dnes vaříme</Text><Text style={styles.mealCardLink}>Jídelníček →</Text></Pressable>
        {todayMeals.map((meal) => <Pressable key={meal.mealType} accessibilityRole="button" onPress={() => onSelect('recipes')} style={styles.mealRow}><Text style={styles.mealType}>{meal.mealType}</Text><Text numberOfLines={1} style={[styles.mealName, meal.cooked && styles.mealDone]}>{meal.recipe.name}</Text><ArrowRight color={colors.mutedText} size={16} /></Pressable>)}
      </View> : null}
      {hasRecommendations ? <View style={styles.recommendations}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: recommendationsCollapsed === false }} onPress={() => void toggleRecommendations()} style={styles.recommendationsHeader}>
          <Sparkles color={colors.accentText} size={20} />
          <View style={styles.recommendationsTitleWrap}><Text style={styles.cardTitle}>Doporučení ANITKY</Text>{recommendationsCollapsed && restock.length > 0 ? <Text style={styles.noteText}>Doplnění zásob: {restock.length}. Rozbalte pro návrhy a akce.</Text> : null}{recommendationsCollapsed && restock.length === 0 ? <Text style={styles.noteText}>Rozbalte pro návrhy a akce.</Text> : null}</View>
          <ChevronDown color={colors.mutedText} size={20} style={recommendationsCollapsed === false ? { transform: [{ rotate: '180deg' }] } : undefined} />
        </Pressable>
        {recommendationsCollapsed === false ? <View style={styles.recommendationsContent}>
          {restock.length > 0 ? <View style={styles.chartCard}>
            <View style={styles.mealCardHeading}><Package color={colors.accentText} size={19} /><Text style={styles.cardTitle}>Je dobrá doba doplnit zásobu</Text></View>
            {restock.map((suggestion) => <View key={suggestion.levelId} style={styles.restockRow}>
              <View style={styles.dashboardText}><Text style={styles.dealName}>{suggestion.typeName}</Text><Text style={styles.noteText}>Zbývá {suggestion.quantity} {unitLabel(suggestion.quantity, suggestion.unit)} · doplnit {suggestion.buyQuantity} {unitLabel(suggestion.buyQuantity, suggestion.unit)}</Text><Text style={styles.noteText}>{suggestion.offer.chain} · {money(suggestion.offer.dealPrice, budget?.currency ?? 'CZK')} · do {suggestion.offer.validUntil}</Text><Text style={styles.noteText}>Nejlevnější: {suggestion.offer.productName}</Text></View>
              <View style={styles.restockActions}><Pressable accessibilityRole="button" accessibilityLabel={`Odmítnout návrh ${suggestion.typeName}`} onPress={() => void dismissRestock(suggestion)} style={styles.iconAction}><X color={colors.mutedText} size={17} /></Pressable><Pressable accessibilityRole="button" disabled={shopping?.pendingNames.some((name) => name.toLocaleLowerCase() === suggestion.offer.productName.toLocaleLowerCase())} onPress={() => onAddToShopping(suggestion.offer.productName, suggestion.buyQuantity, suggestion.unit)} style={styles.restockAdd}><Text style={styles.restockAddText}>Přidat</Text></Pressable></View>
            </View>)}
          </View> : null}
          {preferredDealRows.length > 0 ? <View style={styles.chartCard}>
            <Pressable accessibilityRole="button" onPress={() => onSelect('deals')} style={styles.mealCardHeading}><Tag color={colors.accentText} size={19} /><Text style={styles.cardTitle}>Akce na vaše oblíbené</Text><Text style={styles.mealCardLink}>Všechny →</Text></Pressable>
            {preferredDealRows.map((deal) => <View key={`${deal.name}-${deal.store}`} style={styles.homeDealRow}><View style={styles.dashboardText}><Text numberOfLines={1} style={styles.dealName}>{deal.name}</Text><Text style={styles.noteText}>{deal.store}{deal.until ? ` · do ${deal.until}` : ''}</Text></View><Text style={styles.homeDealPrice}>{money(deal.price, 'CZK')}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Přidat ${deal.name} na seznam`} onPress={() => onAddToShopping(deal.name)} style={styles.homeDealAdd}><Text style={styles.homeDealAddText}>+</Text></Pressable></View>)}
          </View> : null}
          {listDealRows.length + listOfferRows.length > 0 ? <View style={styles.chartCard}>
            <Pressable accessibilityRole="button" onPress={() => onSelect('deals')} style={styles.mealCardHeading}><Tag color={colors.accentText} size={19} /><Text style={styles.cardTitle}>Akce k vašim položkám</Text><Text style={styles.mealCardLink}>Všechny →</Text></Pressable>
            {listDealRows.map(({ product, price, isBestPrice }) => <View key={`${product.productName}-${price.store}`} style={styles.homeDealRow}><View style={styles.dashboardText}><Text numberOfLines={1} style={styles.dealName}>{product.productName}</Text><Text style={styles.noteText}>{price.store}{price.dealValidUntil ? ` · do ${price.dealValidUntil}` : ''}{isBestPrice ? ' · nejlepší známá cena' : ''}</Text></View><View style={styles.dealPriceColumn}><Text style={styles.homeDealPrice}>{money(effectivePrice(price), budget?.currency ?? 'CZK')}</Text>{price.dealPrice != null ? <Text style={styles.noteText}>−{Math.round(dealDiscount(price) * 100)} %</Text> : null}</View><Pressable accessibilityRole="button" accessibilityLabel={`Přidat ${product.productName} na seznam`} onPress={() => onAddToShopping(product.productName)} style={styles.homeDealAdd}><Text style={styles.homeDealAddText}>+</Text></Pressable></View>)}
            {listOfferRows.map((offer) => <View key={`${offer.productName}-${offer.store}`} style={styles.homeDealRow}><View style={styles.dashboardText}><Text numberOfLines={1} style={styles.dealName}>{offer.productName}</Text><Text style={styles.noteText}>{offer.store} · do {offer.validUntil}</Text></View><Text style={styles.homeDealPrice}>{money(offer.dealPrice, budget?.currency ?? 'CZK')}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Přidat ${offer.productName} na seznam`} onPress={() => onAddToShopping(offer.productName)} style={styles.homeDealAdd}><Text style={styles.homeDealAddText}>+</Text></Pressable></View>)}
          </View> : shopping && shopping.remaining > 0 ? <View style={styles.emptyCard}><Text style={styles.cardTitle}>Akce k vašim položkám</Text><Text style={styles.bodyText}>Na seznamu teď nemáte žádnou položku v akci.</Text><Pressable accessibilityRole="button" onPress={() => onSelect('deals')}><Text style={styles.chatLinkText}>Procházet všechny akce →</Text></Pressable></View> : null}
        </View> : null}
      </View> : null}
      <Text style={styles.sectionHeading}>Rychlé akce</Text>
      <View style={styles.quickActions}>
        {[
          { label: 'Do nákupu', Icon: Plus, action: () => onSelect('shopping') },
          { label: 'Výdaj', Icon: WalletCards, action: onQuickExpense },
          { label: 'Účtenka', Icon: ReceiptText, action: () => onOpenReceipts() },
          { label: 'Obchody', Icon: MapPin, action: () => onSelect('stores') },
        ].map(({ label, Icon, action }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={label} key={label} onPress={action} style={styles.quickAction}>
            <Icon color={colors.primary} size={21} />
            <Text style={styles.quickActionLabel}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  )
}

export function NativeDealsScreen({ listNames, onAdd }: { listNames: string[]; onAdd: (name: string) => void }) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [result, setResult] = useState<MobileDealsPage | null>(null)
  const [category, setCategory] = useState<MobileDealCategory | 'all'>('all')
  const [sort, setSort] = useState<MobileDealSort>('discount')
  const [query, setQuery] = useState('')
  const [chain, setChain] = useState<string | null>(null)
  const [forMe, setForMe] = useState(false)
  const [chainNames, setChainNames] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getStoreChains().then(({ chains }) => { if (!cancelled) setChainNames(chains.map((entry) => entry.chain)) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getDealsPage({ category, chain, sort, query, page, forMe }).then((data) => {
      if (!cancelled) { setResult(data); setPage(data.page) }
    }).catch((caught: unknown) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : 'Akce se nepodařilo načíst.')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [category, chain, sort, query, page, forMe])

  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / 6))
  return (
    <ScrollView contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.bodyText}>Dnešní akce v Česku. Hledejte podle názvu a kategorie.</Text>
      <View style={styles.searchBox}><Search color={colors.mutedText} size={18} /><TextInput accessibilityLabel="Hledat v akcích" onChangeText={(value) => { setQuery(value.slice(0, 80)); setPage(1) }} placeholder="Maso, vejce, máslo…" placeholderTextColor={colors.mutedText} style={styles.searchInput} value={query} />{query ? <Pressable accessibilityLabel="Vymazat hledání" onPress={() => setQuery('')}><X color={colors.mutedText} size={18} /></Pressable> : null}</View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {(['all', 'Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní'] as (MobileDealCategory | 'all')[]).map((value) => (
          <Pressable key={value} onPress={() => { setCategory(value); setPage(1) }} style={[styles.chip, category === value && styles.chipActive]}>
            <Text style={[styles.chipText, category === value && styles.chipTextActive]}>{value === 'all' ? 'Vše' : value}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {result?.hasPreferences ? <Pressable accessibilityRole="switch" accessibilityState={{ checked: forMe }} onPress={() => { setForMe((value) => !value); setPage(1) }} style={[styles.preferenceToggle, forMe && styles.preferenceToggleActive]}><Text style={[styles.preferenceToggleText, forMe && styles.preferenceToggleTextActive]}>{forMe ? '♥  Akce pro mě zapnuté' : '♡  Jen oblíbené produkty a značky'}</Text></Pressable> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {[{ chain: null, label: 'Všechny obchody' }, ...chainNames.map((value) => ({ chain: value, label: value }))].map((item) => <Pressable key={item.label} onPress={() => { setChain(item.chain); setPage(1) }} style={[styles.chip, chain === item.chain && styles.chipActive]}><Text style={[styles.chipText, chain === item.chain && styles.chipTextActive]}>{item.label}</Text></Pressable>)}
      </ScrollView>
      <View style={styles.sortRow}>
        <Text style={styles.bodyText}>{result ? `${result.total} akcí` : 'Akční nabídky'}</Text>
        <View style={styles.sortButtons}>
          {([{ value: 'discount', label: 'Sleva' }, { value: 'price', label: 'Cena' }, { value: 'name', label: 'Název' }, { value: 'store', label: 'Obchod' }] as const).map((item) => (
            <Pressable key={item.value} onPress={() => { setSort(item.value); setPage(1) }} style={[styles.sortButton, sort === item.value && styles.sortButtonActive]}><Text style={[styles.sortText, sort === item.value && styles.sortTextActive]}>{item.label}</Text></Pressable>
          ))}
        </View>
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {loading && !result ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
      {result?.deals.map(({ product, price, isBestPrice, cheapestAlternative, recentLow }) => {
        const onList = listNames.some((name) => name.toLocaleLowerCase('cs') === product.productName.toLocaleLowerCase('cs'))
        return <View key={`${product.productName}-${price.store}-${price.dealValidUntil}`} style={styles.dealCard}>
          <View style={styles.dealTop}><View style={styles.dashboardText}><Text style={styles.dealName}>{product.productName}</Text><Text style={styles.bodyText}>{price.store} · akce do {price.dealValidUntil}</Text></View><Text style={styles.discountBadge}>−{Math.round(price.regularPrice > 0 ? (1 - (price.dealPrice ?? price.regularPrice) / price.regularPrice) * 100 : 0)} %</Text></View>
          <View style={styles.dealBottom}><View><Text style={styles.dealPrice}>{money(price.dealPrice ?? price.regularPrice, 'CZK')}</Text><Text style={styles.bodyText}>běžně {money(price.regularPrice, 'CZK')}</Text></View><Pressable disabled={onList} onPress={() => onAdd(product.productName)} style={[styles.addDealButton, onList && styles.addDealDone]}><Text style={styles.addDealText}>{onList ? 'Na seznamu' : '+ Na seznam'}</Text></Pressable></View>
          {!isBestPrice && cheapestAlternative ? <Text style={styles.noteText}>Levněji bez akce v {cheapestAlternative.store} za {money(cheapestAlternative.price, 'CZK')}.</Text> : null}
          {recentLow?.status === 'at-low' ? <Text style={styles.noteText}>Aktuálně nejnižší cena za posledních 30 dní.</Text> : null}
        </View>
      })}
      {result?.offers.map((offer) => <View key={`${offer.productName}-${offer.storeId}`} style={styles.dealCard}>
        <View style={styles.dealTop}><View style={styles.dashboardText}><Text style={styles.dealName}>{offer.productName}</Text><Text style={styles.bodyText}>{offer.store} · nabídka do {offer.validUntil}</Text></View><Tag color={colors.accentText} size={20} /></View>
        <View style={styles.dealBottom}><Text style={styles.dealPrice}>{money(offer.dealPrice, 'CZK')}</Text><Pressable onPress={() => onAdd(offer.productName)} style={styles.addDealButton}><Text style={styles.addDealText}>+ Na seznam</Text></Pressable></View>
      </View>)}
      {result && result.total === 0 ? <View style={styles.emptyCard}><Text style={styles.cardTitle}>Žádné odpovídající akce</Text><Text style={styles.bodyText}>Změňte hledání nebo vybranou kategorii.</Text></View> : null}
      {result && totalPages > 1 ? <View style={styles.pagination}><Pressable disabled={page <= 1} onPress={() => setPage((current) => Math.max(1, current - 1))} style={styles.pageButton}><Text style={styles.pageText}>Předchozí</Text></Pressable><Text style={styles.bodyText}>{page} / {totalPages}</Text><Pressable disabled={page >= totalPages} onPress={() => setPage((current) => Math.min(totalPages, current + 1))} style={styles.pageButton}><Text style={styles.pageText}>Další</Text></Pressable></View> : null}
    </ScrollView>
  )
}

export function NativeStoresScreen() {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [city, setCity] = useState('')
  const [chains, setChains] = useState<MobileChainTile[]>([])
  const [selected, setSelected] = useState<MobileChainTile | null>(null)
  const [branches, setBranches] = useState<MobileBranchPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      getStoreChains(city).then(({ chains: data }) => { if (!cancelled) { setChains(data); setSelected(null); setBranches(null) } }).catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Obchody se nepodařilo načíst.') }).finally(() => { if (!cancelled) setLoading(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [city])
  async function openChain(chain: MobileChainTile) {
    setSelected(chain); setBranches(null); setLoading(true); setError(null)
    try { setBranches(await getStoreBranches(city, chain.storeId)) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Prodejny se nepodařilo načíst.') } finally { setLoading(false) }
  }
  return <ScrollView contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
    <Text style={styles.bodyText}>Najděte obchody a prodejny ve svém okolí.</Text>
    <View style={styles.searchBox}><MapPin color={colors.mutedText} size={18} /><TextInput accessibilityLabel="Město nebo obec" onChangeText={setCity} placeholder="Město nebo obec" placeholderTextColor={colors.mutedText} style={styles.searchInput} value={city} /></View>
    {selected ? <Pressable onPress={() => { setSelected(null); setBranches(null) }} style={styles.backButton}><Text style={styles.pageText}>‹  Všechny řetězce</Text></Pressable> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
    {!selected ? chains.map((chain) => <Pressable key={chain.storeId} onPress={() => void openChain(chain)} style={styles.storeCard}>
      <NativeStoreMark chain={chain.chain} /><View style={styles.dashboardText}><Text style={styles.cardTitle}>{chain.chain}</Text><Text style={styles.bodyText}>{chain.branchCount} prodejen · {chain.dealsCount} dnešních akcí</Text></View><ArrowRight color={colors.mutedText} size={19} />
    </Pressable>) : <>
      <Text style={styles.sectionHeading}>{selected.chain} · {branches?.total ?? 0} prodejen</Text>
      {branches?.rows.map((branch) => <View key={branch.id} style={styles.branchCard}><NativeStoreMark chain={branch.chain} /><View style={styles.dashboardText}><Text style={styles.cardTitle}>{branch.name}</Text><Text style={styles.bodyText}>{branch.address}, {branch.city}</Text>{branch.hours ? <Text style={styles.noteText}>{branch.hours}</Text> : null}</View></View>)}
      {branches?.total === 0 ? <View style={styles.emptyCard}><Text style={styles.bodyText}>Pro tento řetězec zde nejsou evidované prodejny.</Text></View> : null}
    </>}
    {!loading && !selected && chains.length === 0 ? <View style={styles.emptyCard}><Text style={styles.bodyText}>Pro toto místo se nepodařilo najít obchody.</Text></View> : null}
  </ScrollView>
}

export function NativeAssistantModal({ visible, onClose, onShopping }: { visible: boolean; onClose: () => void; onShopping: () => void }) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [draft, setDraft] = useState('')
  const [sent, setSent] = useState<string[]>([])
  const suggestions = ['Nákup na týden do 2 500 Kč', 'Kde ušetřím na seznamu?', 'Rozděl nákup mezi obchody']
  function send(value = draft) { const message = value.trim(); if (!message) return; setSent((current) => [...current, message]); setDraft('') }
  return <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
    <View style={styles.assistantScrim}>
      <View style={styles.assistantSheet}>
        <View style={styles.assistantHeader}><View style={styles.assistantIdentity}><View style={styles.assistantAvatar}><Image resizeMode="contain" source={require('../assets/anitka-guide-front.webp')} style={styles.assistantMascot} /></View><View><Text style={styles.cardTitle}>Anitka</Text><Text style={styles.noteText}>AI asistent zatím není připojený</Text></View></View><Pressable accessibilityLabel="Zavřít chat" onPress={onClose} style={styles.closeButton}><X color={colors.secondaryText} size={20} /></Pressable></View>
        <ScrollView contentContainerStyle={styles.chatMessages}>
          <View style={styles.assistantBubble}><Text style={styles.chatText}>Ahoj, jsem Anitka. Chat je připravený, ale AI asistent zatím není připojený, takže teď dotazy neumím zpracovat.</Text></View>
          {sent.map((message, index) => <View key={`${index}-${message}`}><View style={styles.userBubble}><Text style={styles.userChatText}>{message}</Text></View><View style={styles.assistantBubble}><Text style={styles.chatText}>AI asistent zatím není zapojený, takže na dotazy neodpovídá. Porovnání cen, akce a plán nákupu podle rozpočtu najdete v nákupním seznamu.</Text><Pressable onPress={() => { onClose(); onShopping() }} style={styles.chatLink}><Text style={styles.chatLinkText}>Otevřít nákupní seznam →</Text></Pressable></View></View>)}
          {sent.length === 0 ? <View style={styles.suggestionList}>{suggestions.map((suggestion) => <Pressable key={suggestion} onPress={() => send(suggestion)} style={styles.suggestion}><Text style={styles.suggestionText}>{suggestion}</Text></Pressable>)}</View> : null}
        </ScrollView>
        <View style={styles.composer}><TextInput accessibilityLabel="Napište Anitce" onChangeText={setDraft} onSubmitEditing={() => send()} placeholder="Napište Anitce…" placeholderTextColor={colors.mutedText} returnKeyType="send" style={styles.composerInput} value={draft} /><Pressable accessibilityLabel="Odeslat zprávu" disabled={!draft.trim()} onPress={() => send()} style={[styles.sendButton, !draft.trim() && styles.disabled]}><ArrowRight color={colors.primaryForeground} size={20} /></Pressable></View>
        <Text style={styles.footerNote}>Zprávy se zatím nezpracovávají umělou inteligencí.</Text>
      </View>
    </View>
  </Modal>
}

export function NativeNotificationsModal({ visible, onClose, onUnreadCount }: { visible: boolean; onClose: () => void; onUnreadCount: (count: number) => void }) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [notifications, setNotifications] = useState<MobileNotification[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setLoading(true); setError(null)
    getNotifications().then(({ notifications: rows }) => { if (!cancelled) { setNotifications(rows); onUnreadCount(rows.filter((notification) => notification.unread).length) } }).catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Upozornění se nepodařilo načíst.') }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [onUnreadCount, visible])
  async function dismiss(id?: string) {
    const before = notifications
    const next = id ? before.filter((notification) => notification.id !== id) : []
    setNotifications(next)
    onUnreadCount(next.filter((notification) => notification.unread).length)
    try { await dismissNotification(id) } catch (caught) { setNotifications(before); onUnreadCount(before.filter((notification) => notification.unread).length); setError(caught instanceof Error ? caught.message : 'Upozornění se nepodařilo aktualizovat.') }
  }
  return <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
    <Pressable onPress={onClose} style={styles.modalScrim}>
      <Pressable onPress={(event) => event.stopPropagation()} style={styles.notificationSheet}>
        <View style={styles.assistantHeader}><View><Text style={styles.cardTitle}>Upozornění</Text><Text style={styles.noteText}>{notifications.filter((notification) => notification.unread).length ? `${notifications.filter((notification) => notification.unread).length} nepřečtených` : 'Vše přečteno'}</Text></View><View style={styles.notificationActions}>{notifications.some((notification) => notification.unread) ? <Pressable onPress={() => void dismiss()}><Text style={styles.chatLinkText}>Označit vše</Text></Pressable> : null}<Pressable accessibilityLabel="Zavřít upozornění" onPress={onClose} style={styles.closeButton}><X color={colors.secondaryText} size={20} /></Pressable></View></View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
        <ScrollView contentContainerStyle={styles.notificationList}>
          {notifications.map((notification) => <Pressable key={notification.id} onPress={() => void dismiss(notification.id)} style={styles.notificationRow}><View style={[styles.notificationDot, notification.unread && styles.notificationDotUnread]} /><View style={styles.dashboardText}><Text style={styles.cardTitle}>{notification.title}</Text><Text style={styles.bodyText}>{notification.detail}</Text></View></Pressable>)}
          {!loading && notifications.length === 0 ? <View style={styles.emptyCard}><Bell color={colors.mutedText} size={20} /><Text style={styles.bodyText}>Žádná upozornění. Ozveme se, až bude něco potřeba.</Text></View> : null}
        </ScrollView>
      </Pressable>
    </Pressable>
  </Modal>
}

type ManualPurchaseLine = { name: string; quantity: string; unit: ItemUnit; price: string; category: ItemCategory; subcategory: string }
const MANUAL_ITEM_CATEGORIES: ItemCategory[] = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní']

export function NativeManualPurchaseForm({ chains, onClose, onSave }: { chains: MobileChainTile[]; onClose: () => void; onSave: (input: ManualPurchaseInput) => Promise<void> }) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [date, setDate] = useState(todayInPrague())
  const [storeChain, setStoreChain] = useState('')
  const [discount, setDiscount] = useState('')
  const [lines, setLines] = useState<ManualPurchaseLine[]>([{ name: '', quantity: '1', unit: 'ks', price: '', category: 'Potraviny', subcategory: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      const items = lines.filter((line) => line.name.trim()).map((line) => ({
        name: line.name.trim(), quantity: Number(line.quantity.replace(',', '.')), unit: line.unit,
        price: Number(line.price.replace(',', '.')), category: line.category, subcategory: line.subcategory || null,
      }))
      if (items.length === 0) throw new Error('Přidejte alespoň jednu pojmenovanou položku.')
      if (items.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.price) || item.price < 0)) {
        throw new Error('Zkontrolujte množství a cenu položek.')
      }
      await onSave({ date, storeChain: storeChain || null, discount: discount ? Number(discount.replace(',', '.')) : null, items })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nákup se nepodařilo uložit.')
    } finally { setSaving(false) }
  }

  function updateLine(index: number, changes: Partial<ManualPurchaseLine>) {
    setLines((current) => current.map((line, row) => row === index ? { ...line, ...changes } : line))
  }

  return <Modal animationType="slide" onRequestClose={onClose} transparent visible>
    <View style={styles.manualModalOverlay}>
      <View style={styles.manualModal}>
        <View style={styles.sectionHeader}><View style={styles.preferenceDescription}><Text style={styles.sheetTitle}>Zadat nákup ručně</Text><Text style={styles.noteText}>Po uložení se započítá do rozpočtu a doplní zásoby.</Text></View><Pressable accessibilityLabel="Zavřít ruční zadání nákupu" onPress={onClose} style={styles.closeButton}><X color={colors.foreground} size={20} /></Pressable></View>
        <ScrollView contentContainerStyle={styles.manualFormContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.profileFieldLabel}>Datum nákupu</Text>
          <TextInput accessibilityLabel="Datum nákupu" onChangeText={setDate} placeholder="RRRR-MM-DD" placeholderTextColor={colors.mutedText} style={styles.profileInput} value={date} />
          <Text style={styles.profileFieldLabel}>Obchod</Text>
          <TextInput accessibilityLabel="Obchod nákupu" onChangeText={setStoreChain} placeholder="Např. Lidl" placeholderTextColor={colors.mutedText} style={styles.profileInput} value={storeChain} />
          {chains.length > 0 ? <ScrollView horizontal contentContainerStyle={styles.chipRow} showsHorizontalScrollIndicator={false}>{chains.map((chain) => <Pressable key={chain.storeId} onPress={() => setStoreChain(chain.chain)} style={[styles.themeChoice, storeChain === chain.chain && styles.themeChoiceSelected]}><Text style={[styles.themeChoiceText, storeChain === chain.chain && styles.themeChoiceTextSelected]}>{chain.chain}</Text></Pressable>)}</ScrollView> : null}
          <Text style={styles.profileFieldLabel}>Celková sleva</Text>
          <TextInput accessibilityLabel="Sleva z nákupu" keyboardType="decimal-pad" onChangeText={setDiscount} placeholder="0 Kč" placeholderTextColor={colors.mutedText} style={styles.profileInput} value={discount} />
          {lines.map((line, index) => <View key={index} style={styles.manualLineCard}>
            <View style={styles.sectionHeader}><Text style={styles.cardTitle}>Položka {index + 1}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Odebrat položku ${index + 1}`} disabled={lines.length === 1} onPress={() => setLines((current) => current.filter((_, row) => row !== index))}><Trash2 color={lines.length === 1 ? colors.mutedText : colors.destructive} size={17} /></Pressable></View>
            <TextInput accessibilityLabel={`Název položky ${index + 1}`} onChangeText={(name) => updateLine(index, { name })} placeholder="Název produktu" placeholderTextColor={colors.mutedText} style={styles.profileInput} value={line.name} />
            <View style={styles.rowFields}><TextInput accessibilityLabel={`Množství položky ${index + 1}`} keyboardType="decimal-pad" onChangeText={(quantity) => updateLine(index, { quantity })} placeholder="Množství" placeholderTextColor={colors.mutedText} style={[styles.profileInput, styles.manualSmallInput]} value={line.quantity} /><TextInput accessibilityLabel={`Cena za jednotku položky ${index + 1}`} keyboardType="decimal-pad" onChangeText={(price) => updateLine(index, { price })} placeholder="Cena / jednotku" placeholderTextColor={colors.mutedText} style={[styles.profileInput, styles.manualSmallInput]} value={line.price} /></View>
            <Text style={styles.profileFieldLabel}>Jednotka</Text>
            <ScrollView horizontal contentContainerStyle={styles.chipRow} showsHorizontalScrollIndicator={false}>{ITEM_UNITS.map((unit) => <Pressable key={unit} accessibilityRole="button" accessibilityState={{ selected: line.unit === unit }} onPress={() => updateLine(index, { unit })} style={[styles.themeChoice, line.unit === unit && styles.themeChoiceSelected]}><Text style={[styles.themeChoiceText, line.unit === unit && styles.themeChoiceTextSelected]}>{unitLabel(1, unit)}</Text></Pressable>)}</ScrollView>
            <Text style={styles.profileFieldLabel}>Kategorie</Text>
            <ScrollView horizontal contentContainerStyle={styles.chipRow} showsHorizontalScrollIndicator={false}>{MANUAL_ITEM_CATEGORIES.map((category) => <Pressable key={category} accessibilityRole="button" accessibilityState={{ selected: line.category === category }} onPress={() => updateLine(index, { category, subcategory: '' })} style={[styles.themeChoice, line.category === category && styles.themeChoiceSelected]}><Text style={[styles.themeChoiceText, line.category === category && styles.themeChoiceTextSelected]}>{category}</Text></Pressable>)}</ScrollView>
            <Text style={styles.profileFieldLabel}>Podkategorie</Text>
            <ScrollView horizontal contentContainerStyle={styles.chipRow} showsHorizontalScrollIndicator={false}><Pressable onPress={() => updateLine(index, { subcategory: '' })} style={[styles.themeChoice, !line.subcategory && styles.themeChoiceSelected]}><Text style={[styles.themeChoiceText, !line.subcategory && styles.themeChoiceTextSelected]}>Bez podkategorie</Text></Pressable>{subcategoriesOfItem(line.category).map((subcategory) => <Pressable key={subcategory} onPress={() => updateLine(index, { subcategory })} style={[styles.themeChoice, line.subcategory === subcategory && styles.themeChoiceSelected]}><Text style={[styles.themeChoiceText, line.subcategory === subcategory && styles.themeChoiceTextSelected]}>{subcategory}</Text></Pressable>)}</ScrollView>
          </View>)}
          <Pressable accessibilityRole="button" onPress={() => setLines((current) => [...current, { name: '', quantity: '1', unit: 'ks', price: '', category: 'Potraviny', subcategory: '' }])} style={styles.purchaseShowAll}><Plus color={colors.accentText} size={17} /><Text style={styles.purchaseActionText}>Přidat položku</Text></Pressable>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => void submit()} style={[styles.profileSaveButton, saving && styles.disabled]}><Text style={styles.profileSaveText}>{saving ? 'Ukládám…' : 'Uložit nákup'}</Text></Pressable>
        </ScrollView>
      </View>
    </View>
  </Modal>
}

function NativePurchaseSplitModal({ item, onClose, onSave }: { item: MobilePurchase['items'][number] & { id: string; category: NonNullable<MobilePurchase['items'][number]['category']> }; onClose: () => void; onSave: (splits: ExpenseSplitPart[]) => Promise<void> }) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const total = item.price * item.quantity
  const totalCents = Math.round(total * 100)
  const [rows, setRows] = useState<Array<{ category: ExpenseCategory; subcategory: string | null; amount: string }>>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const existing = item.expenseSplits ?? []
    setRows(existing.length ? existing.map((part) => ({ ...part, amount: part.amount.toFixed(2) })) : [{ category: automaticExpenseCategory(item.category), subcategory: null, amount: total.toFixed(2) }])
    setError(null)
  }, [item, total])

  const amounts = rows.map((row) => Number(row.amount.replace(',', '.')))
  const remaining = totalCents - amounts.reduce((sum, value) => sum + (Number.isFinite(value) ? Math.round(value * 100) : 0), 0)
  const canSave = rows.length > 0 && amounts.every((amount) => Number.isFinite(amount) && amount > 0) && remaining === 0 && !saving

  async function save(splits: ExpenseSplitPart[]) {
    setSaving(true)
    setError(null)
    try { await onSave(splits); onClose() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Rozdělení výdaje se nepodařilo uložit.') }
    finally { setSaving(false) }
  }

  return <Modal animationType="slide" onRequestClose={onClose} transparent visible>
    <View style={styles.manualModalOverlay}><View style={styles.manualModal}>
      <View style={styles.sectionHeader}><View style={styles.preferenceDescription}><Text style={styles.sheetTitle}>{item.name}</Text><Text style={styles.noteText}>Celkem {money(total, 'CZK')}</Text></View><Pressable accessibilityLabel="Zavřít rozdělení výdaje" onPress={onClose} style={styles.closeButton}><X color={colors.foreground} size={20} /></Pressable></View>
      <ScrollView contentContainerStyle={styles.manualFormContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.bodyText}>Rozdělte částku podle skutečnosti; součet musí odpovídat celé položce.</Text>
        {rows.map((row, index) => <View key={index} style={styles.manualLineCard}>
          <View style={styles.sectionHeader}><Text style={styles.cardTitle}>Část {index + 1}</Text>{rows.length > 1 ? <Pressable accessibilityRole="button" accessibilityLabel={`Odebrat část ${index + 1}`} onPress={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}><Trash2 color={colors.destructive} size={17} /></Pressable> : null}</View>
          <ScrollView horizontal contentContainerStyle={styles.chipRow} showsHorizontalScrollIndicator={false}>{EXPENSE_CATEGORY_NAMES.map((category) => <Pressable key={category} accessibilityState={{ selected: category === row.category }} onPress={() => setRows((current) => current.map((part, rowIndex) => rowIndex === index ? { ...part, category, subcategory: null } : part))} style={[styles.themeChoice, category === row.category && styles.themeChoiceSelected]}><Text style={[styles.themeChoiceText, category === row.category && styles.themeChoiceTextSelected]}>{category}</Text></Pressable>)}</ScrollView>
          <ScrollView horizontal contentContainerStyle={styles.chipRow} showsHorizontalScrollIndicator={false}><Pressable onPress={() => setRows((current) => current.map((part, rowIndex) => rowIndex === index ? { ...part, subcategory: null } : part))} style={[styles.themeChoice, !row.subcategory && styles.themeChoiceSelected]}><Text style={[styles.themeChoiceText, !row.subcategory && styles.themeChoiceTextSelected]}>Bez podkategorie</Text></Pressable>{subcategoriesOf(row.category).map((subcategory) => <Pressable key={subcategory} onPress={() => setRows((current) => current.map((part, rowIndex) => rowIndex === index ? { ...part, subcategory } : part))} style={[styles.themeChoice, row.subcategory === subcategory && styles.themeChoiceSelected]}><Text style={[styles.themeChoiceText, row.subcategory === subcategory && styles.themeChoiceTextSelected]}>{subcategory}</Text></Pressable>)}</ScrollView>
          <TextInput accessibilityLabel={`Částka části ${index + 1}`} keyboardType="decimal-pad" onChangeText={(amount) => setRows((current) => current.map((part, rowIndex) => rowIndex === index ? { ...part, amount } : part))} placeholder="Částka" placeholderTextColor={colors.mutedText} style={styles.profileInput} value={row.amount} />
        </View>)}
        <Text style={[styles.noteText, { color: remaining === 0 ? colors.success : colors.destructive }]}>{remaining === 0 ? 'Součet odpovídá celé částce.' : `Zbývá rozdělit: ${money(remaining / 100, 'CZK')}`}</Text>
        <Pressable accessibilityRole="button" onPress={() => setRows((current) => [...current, { category: automaticExpenseCategory(item.category), subcategory: null, amount: '0' }])} style={styles.purchaseShowAll}><Plus color={colors.accentText} size={17} /><Text style={styles.purchaseActionText}>Přidat část</Text></Pressable>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <View style={styles.rowActions}><Pressable accessibilityRole="button" disabled={!canSave} onPress={() => void save(rows.map((row, index) => ({ category: row.category, subcategory: row.subcategory, amount: amounts[index] })))} style={[styles.profileSaveButton, styles.flexText, !canSave && styles.disabled]}><Text style={styles.profileSaveText}>{saving ? 'Ukládám…' : 'Uložit rozdělení'}</Text></Pressable>{item.expenseSplits?.length ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save([])} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Automaticky</Text></Pressable> : null}</View>
      </ScrollView>
    </View></View>
  </Modal>
}

export function NativePurchasesScreen() {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [purchases, setPurchases] = useState<MobilePurchase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [busyPurchaseId, setBusyPurchaseId] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<(MobilePurchase['items'][number] & { id: string; category: NonNullable<MobilePurchase['items'][number]['category']> }) | null>(null)
  const [storeChains, setStoreChains] = useState<MobileChainTile[]>([])
  useEffect(() => {
    let cancelled = false
    getPurchaseHistory().then(({ purchases: rows }) => { if (!cancelled) setPurchases(rows) }).catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Historii nákupů se nepodařilo načíst.') }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    let cancelled = false
    getStoreChains().then(({ chains }) => { if (!cancelled) setStoreChains(chains) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])
  const newestFirst = purchases.slice().reverse()
  const shownPurchases = showAll ? newestFirst : newestFirst.slice(0, 5)
  const topStore = favoriteStores(purchases)[0]
  const topProduct = mostBoughtProducts(purchases, 1)[0]
  const repeats = repeatPurchases(purchases)

  async function recordExpenses(purchase: MobilePurchase) {
    setBusyPurchaseId(purchase.id)
    setError(null)
    try {
      await recordMobilePurchaseExpenses(purchase.id)
      setPurchases((current) => current.map((row) => row.id === purchase.id ? { ...row, needsBudgetRecording: false } : row))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nákup se nepodařilo zapsat do rozpočtu.')
    } finally { setBusyPurchaseId(null) }
  }

  function confirmDelete(purchase: MobilePurchase) {
    Alert.alert(
      'Odstranit tento nákup?',
      'Zmizí z historie i z výdajů, smaže se jeho účtenka a ze zásob se odečte, co přidal. Položky odškrtnuté účtenkou budou zase k nákupu. Nejde to vrátit.',
      [
        { text: 'Zrušit', style: 'cancel' },
        { text: 'Odstranit', style: 'destructive', onPress: () => { void removePurchase(purchase) } },
      ],
    )
  }

  async function removePurchase(purchase: MobilePurchase) {
    setBusyPurchaseId(purchase.id)
    setError(null)
    try {
      await deleteMobilePurchase(purchase.id)
      setPurchases((current) => current.filter((row) => row.id !== purchase.id))
      if (expandedId === purchase.id) setExpandedId(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nákup se nepodařilo odstranit.')
    } finally { setBusyPurchaseId(null) }
  }

  async function saveManualPurchase(input: ManualPurchaseInput) {
    const { purchase } = await createMobileManualPurchase(input)
    setPurchases((current) => [...current, purchase])
    setManualOpen(false)
  }

  async function saveItemSplits(itemId: string, splits: ExpenseSplitPart[]) {
    await updateMobilePurchaseItemExpenseSplits(itemId, splits)
    setPurchases((current) => current.map((purchase) => ({
      ...purchase,
      items: purchase.items.map((item) => item.id === itemId ? { ...item, expenseSplits: splits } : item),
    })))
  }

  return <ScrollView contentContainerStyle={styles.screenContent}>
    <View style={styles.sectionHeader}><View style={styles.preferenceDescription}><Text style={styles.cardTitle}>Historie nákupů</Text><Text style={styles.bodyText}>Dlouhodobé statistiky z uskutečněných nákupů domácnosti.</Text></View><Pressable accessibilityRole="button" onPress={() => setManualOpen(true)} style={styles.purchaseAction}><Plus color={colors.accentText} size={16} /><Text style={styles.purchaseActionText}>Zadat ručně</Text></Pressable></View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
    <View style={styles.purchaseStats}>
      <View style={styles.purchaseStat}><TrendingUp color={colors.primary} size={17} /><Text style={styles.noteText}>Běžná měsíční útrata</Text><Text style={styles.cardTitle}>{money(averageMonthlySpend(purchases), 'CZK')}</Text></View>
      <View style={styles.purchaseStat}><Star color={colors.primary} size={17} /><Text style={styles.noteText}>Oblíbený obchod</Text><Text numberOfLines={1} style={styles.cardTitle}>{topStore ? `${topStore.store} (${topStore.count}×)` : '—'}</Text></View>
      <View style={styles.purchaseStat}><ShoppingBag color={colors.primary} size={17} /><Text style={styles.noteText}>Nejčastěji kupované</Text><Text numberOfLines={1} style={styles.cardTitle}>{topProduct ? `${topProduct.name} (${topProduct.count}×)` : '—'}</Text></View>
    </View>
    {repeats.length > 0 ? <View style={styles.chartCard}><Text style={styles.noteText}><Repeat color={colors.mutedText} size={14} />  Opakované nákupy</Text><ScrollView horizontal contentContainerStyle={styles.chipRow} showsHorizontalScrollIndicator={false}>{repeats.map((item) => <View key={item.name} style={styles.purchaseRepeatChip}><Text style={styles.preferenceToggleText}>{item.name} · {item.count}×</Text></View>)}</ScrollView></View> : null}
    {shownPurchases.map((purchase) => {
      const expanded = expandedId === purchase.id
      return <View key={purchase.id} style={styles.purchaseCard}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpandedId((current) => current === purchase.id ? null : purchase.id)} style={styles.dealTop}>
          <View style={styles.dashboardText}><Text style={styles.cardTitle}>{purchase.store || 'Neurčený obchod'}</Text><Text style={styles.bodyText}>{new Date(`${purchase.date}T12:00:00`).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })} · {purchase.items.length} položek{purchase.discount ? ` · sleva ${money(purchase.discount, 'CZK')}` : ''}</Text></View>
          <View style={styles.purchaseHeaderRight}><Text style={styles.purchaseTotal}>{money(purchase.total, 'CZK')}</Text><ArrowDown color={colors.mutedText} size={18} style={expanded ? { transform: [{ rotate: '180deg' }] } : undefined} /></View>
        </Pressable>
        {purchase.needsBudgetRecording ? <View style={styles.purchasePendingRow}><Text style={styles.pendingPurchase}>Tento nákup zatím není v rozpočtu.</Text><Pressable accessibilityRole="button" disabled={busyPurchaseId === purchase.id} onPress={() => void recordExpenses(purchase)} style={styles.purchaseAction}><PiggyBank color={colors.accentText} size={16} /><Text style={styles.purchaseActionText}>{busyPurchaseId === purchase.id ? 'Ukládám…' : 'Zařadit do výdajů'}</Text></Pressable></View> : null}
        {expanded ? <>
          <View style={styles.purchaseDivider} />
          {purchase.items.map((item, index) => <View key={item.id ?? `${item.name}-${index}`} style={styles.purchaseItem}>
            <View style={styles.purchaseLineText}><Text numberOfLines={1} style={styles.purchaseItemName}>{item.name} · {item.quantity} {item.unit}</Text>{item.expenseSplits?.length === 1 ? <Text style={styles.noteText}>{item.expenseSplits[0].category}{item.expenseSplits[0].subcategory ? ` ▸ ${item.expenseSplits[0].subcategory}` : ''}</Text> : item.expenseSplits && item.expenseSplits.length > 1 ? <Text style={styles.noteText}>Rozděleno na {item.expenseSplits.length} částí</Text> : null}</View>
            <View style={styles.purchaseHeaderRight}><Text style={styles.purchaseItemPrice}>{money(item.price * item.quantity, 'CZK')}</Text>{item.id && item.category ? <Pressable accessibilityRole="button" accessibilityLabel={`Upravit rozdělení výdaje pro ${item.name}`} onPress={() => setEditingItem(item as MobilePurchase['items'][number] & { id: string; category: NonNullable<MobilePurchase['items'][number]['category']> })} style={styles.iconButton}><Pencil color={colors.primary} size={16} /></Pressable> : null}</View>
          </View>)}
          <View style={styles.purchaseDivider} />
          <Pressable accessibilityRole="button" disabled={busyPurchaseId === purchase.id} onPress={() => confirmDelete(purchase)} style={styles.purchaseDeleteButton}><Trash2 color={colors.destructive} size={16} /><Text style={styles.purchaseDeleteText}>{busyPurchaseId === purchase.id ? 'Zpracovávám…' : 'Odstranit nákup'}</Text></Pressable>
        </> : null}
      </View>
    })}
    {!loading && purchases.length > 5 ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAll }} onPress={() => setShowAll((current) => !current)} style={styles.purchaseShowAll}><Text style={styles.purchaseActionText}>{showAll ? 'Zobrazit méně' : `Zobrazit všechny nákupy (${purchases.length})`}</Text><ArrowDown color={colors.accentText} size={16} style={showAll ? { transform: [{ rotate: '180deg' }] } : undefined} /></Pressable> : null}
    {!loading && purchases.length === 0 ? <View style={styles.emptyCard}><Text style={styles.cardTitle}>Zatím žádné nákupy</Text><Text style={styles.bodyText}>Nahrajte účtenku; nákup se objeví v historii.</Text></View> : null}
    {manualOpen ? <NativeManualPurchaseForm chains={storeChains} onClose={() => setManualOpen(false)} onSave={saveManualPurchase} /> : null}
    {editingItem ? <NativePurchaseSplitModal item={editingItem} onClose={() => setEditingItem(null)} onSave={(splits) => saveItemSplits(editingItem.id, splits)} /> : null}
  </ScrollView>
}

function NativeDevicePushSetting({ onAuthExpired }: { onAuthExpired: () => void }) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [state, setState] = useState<DevicePushState>({ permissionGranted: false, registered: false, token: null })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    readDevicePushState().then((next) => { if (active) setState(next) }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : 'Stav upozornění se nepodařilo ověřit.')
      if (active && caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [onAuthExpired])

  async function toggle(enabled: boolean) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      if (enabled) setState(await enableDevicePush())
      else if (state.token) {
        await disableDevicePush(state.token)
        setState((current) => ({ ...current, registered: false }))
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nastavení upozornění se nepodařilo změnit.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally { setBusy(false) }
  }

  async function sendTest() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await sendTestPushNotification()
      setMessage('Zkušební upozornění je na cestě.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Zkušební upozornění se nepodařilo odeslat.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally { setBusy(false) }
  }

  return <View style={styles.devicePushCard}>
    <View style={styles.sectionHeader}><View style={styles.preferenceDescription}><Text style={styles.cardTitle}>Upozornění na tomto zařízení</Text><Text style={styles.noteText}>{loading ? 'Ověřuji nastavení zařízení…' : state.registered ? 'Toto zařízení dostává push upozornění.' : state.permissionGranted ? 'Povolení zařízení je zapnuté, odběr aplikace je vypnutý.' : 'Zapněte upozornění pro tuto instalaci aplikace.'}</Text></View>
    <Switch accessibilityLabel="Push upozornění na tomto zařízení" value={state.registered} disabled={loading || busy} onValueChange={(enabled) => void toggle(enabled)} trackColor={{ false: colors.border, true: colors.accent }} thumbColor={colors.card} /></View>
    {state.registered ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void sendTest()} style={styles.pushTestButton}><Text style={styles.profileSmallActionText}>{busy ? 'Odesílám…' : 'Poslat zkušební upozornění'}</Text></Pressable> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {message ? <Text accessibilityRole="text" style={styles.success}>{message}</Text> : null}
  </View>
}

export function NativeProfileScreen({ name, email, householdRole, householdName, householdBudget, householdCurrency, profile, onUpdateHousehold, onProfileUpdate, onAuthExpired, onSignOut, onReload, onOpenGuide }: {
  name: string
  email: string
  householdRole: string
  householdName: string
  householdBudget: number
  householdCurrency: string
  profile: MobileHouseholdProfileData | null
  onUpdateHousehold: (changes: { name: string; monthlyBudget: number }) => void
  onProfileUpdate: (profile: MobileHouseholdProfileData) => void
  onAuthExpired: () => void
  onSignOut: () => void
  onReload: () => Promise<void>
  onOpenGuide: () => void
}) {
  const { colors, preference, setPreference } = useMobileTheme()
  const styles = useStyles()
  const [nameDraft, setNameDraft] = useState(householdName)
  const [budgetDraft, setBudgetDraft] = useState(String(householdBudget).replace('.', ','))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preferences, setPreferences] = useState<MobileNotificationPreference[]>([])
  const [invitations, setInvitations] = useState<MobileHouseholdInvitation[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [auditEntries, setAuditEntries] = useState<MobileAuditEntry[] | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetGroups, setResetGroups] = useState<DataResetGroup[]>([])
  const [resetName, setResetName] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false)
  const [deleteAccountEmail, setDeleteAccountEmail] = useState('')
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false)
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null)
  const [preferencesError, setPreferencesError] = useState<string | null>(null)
  const [profileSection, setProfileSection] = useState<'household' | 'shopping' | 'pantry' | 'appearance' | 'notifications'>('household')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileBusy, setProfileBusy] = useState(false)
  const [memberFormOpen, setMemberFormOpen] = useState(false)
  const [memberName, setMemberName] = useState('')
  const [memberAge, setMemberAge] = useState('')
  const [memberFavorites, setMemberFavorites] = useState('')
  const [memberDislikes, setMemberDislikes] = useState('')
  const [memberAllergies, setMemberAllergies] = useState('')
  const [childFormOpen, setChildFormOpen] = useState(false)
  const [childName, setChildName] = useState('')
  const [childAge, setChildAge] = useState('')
  const [childPreferences, setChildPreferences] = useState('')
  const [childSpecialNeeds, setChildSpecialNeeds] = useState('')
  const [editingDietMember, setEditingDietMember] = useState<MobileHouseholdMember | null>(null)
  const [dietDraft, setDietDraft] = useState<MobileMemberDiet>({ diet: 'none', avoids: [] })
  const [preferenceLists, setPreferenceLists] = useState({ preferredBrands: '', preferredStores: '', preferredProducts: '', excludedProducts: '' })
  const [priceSensitivity, setPriceSensitivity] = useState<MobileHouseholdPreferences['priceSensitivity']>('balanced')
  const [qualityPreference, setQualityPreference] = useState<MobileHouseholdPreferences['qualityPreference']>('standard')
  const [preferCzechProducts, setPreferCzechProducts] = useState(false)
  const [storeSelection, setStoreSelection] = useState<MobileStoreSelection | null>(null)
  const [storeChains, setStoreChains] = useState<{ id: string; chain: string; isOnline: boolean }[]>([])
  const [storeChainIds, setStoreChainIds] = useState<string[]>([])
  const [storePriorityIds, setStorePriorityIds] = useState<string[]>([])
  const [storeLocationIds, setStoreLocationIds] = useState<string[]>([])
  const [storeDistance, setStoreDistance] = useState('')
  const [storeMaxCount, setStoreMaxCount] = useState('')
  const [storeLoading, setStoreLoading] = useState(true)
  const [storeSaving, setStoreSaving] = useState(false)
  const [storeError, setStoreError] = useState<string | null>(null)
  const [branchChainId, setBranchChainId] = useState('')
  const [branchCity, setBranchCity] = useState('')
  const [branchPage, setBranchPage] = useState<MobileBranchPage | null>(null)
  const [branchPageNumber, setBranchPageNumber] = useState(1)
  const [branchLoading, setBranchLoading] = useState(false)
  const [pantrySettings, setPantrySettings] = useState<MobilePantrySettings | null>(null)
  const [pantryLoading, setPantryLoading] = useState(true)
  const [pantryLoadError, setPantryLoadError] = useState<string | null>(null)
  const [placeArea, setPlaceArea] = useState<(typeof PANTRY_AREAS)[number]>('Auto')
  const [placeName, setPlaceName] = useState('')
  const [removingLocation, setRemovingLocation] = useState<string | null>(null)
  const [locationTarget, setLocationTarget] = useState('')
  const [stockTypeQuery, setStockTypeQuery] = useState('')
  const [stockTypeKey, setStockTypeKey] = useState('')
  const [stockMinimum, setStockMinimum] = useState('')
  const [stockMaximum, setStockMaximum] = useState('')
  const [stockUnit, setStockUnit] = useState<ItemUnit>('ks')
  const [checkinDrafts, setCheckinDrafts] = useState<Record<string, string>>({})
  useEffect(() => {
    setNameDraft(householdName)
    setBudgetDraft(String(householdBudget).replace('.', ','))
  }, [householdName, householdBudget])

  useEffect(() => {
    if (!householdRole) return
    let active = true
    getHouseholdInvitations().then(({ invitations: rows }) => { if (active) setInvitations(rows) }).catch((caught: unknown) => {
      if (!active) return
      setInviteError(caught instanceof Error ? caught.message : 'Pozvánky se nepodařilo načíst.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    })
    return () => { active = false }
  }, [householdRole, onAuthExpired])

  useEffect(() => {
    if (!profile) return
    setPreferenceLists({
      preferredBrands: profile.preferences.preferredBrands.join(', '),
      preferredStores: profile.preferences.preferredStores.join(', '),
      preferredProducts: profile.preferences.preferredProducts.join(', '),
      excludedProducts: profile.preferences.excludedProducts.join(', '),
    })
    setPriceSensitivity(profile.preferences.priceSensitivity)
    setQualityPreference(profile.preferences.qualityPreference)
    setPreferCzechProducts(profile.preferences.preferCzechProducts)
  }, [profile])

  useEffect(() => {
    let active = true
    getPantrySettings().then((settings) => { if (active) setPantrySettings(settings) }).catch((caught: unknown) => {
      if (!active) return
      setPantryLoadError(caught instanceof Error ? caught.message : 'Nastavení zásob se nepodařilo načíst.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    }).finally(() => { if (active) setPantryLoading(false) })
    return () => { active = false }
  }, [onAuthExpired])

  useEffect(() => {
    let active = true
    getStorePreferences().then(({ selection, chains }) => {
      if (!active) return
      setStoreSelection(selection)
      setStoreChains(chains)
      setStoreChainIds(selection.chainIds)
      setStorePriorityIds(selection.priorityChainIds)
      setStoreLocationIds(selection.branches.map((branch) => branch.storeLocationId))
      setStoreDistance(selection.maxDistanceKm == null ? '' : String(selection.maxDistanceKm).replace('.', ','))
      setStoreMaxCount(selection.maxShopStores == null ? '' : String(selection.maxShopStores))
    }).catch((caught: unknown) => {
      if (!active) return
      setStoreError(caught instanceof Error ? caught.message : 'Nastavení obchodů se nepodařilo načíst.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    }).finally(() => { if (active) setStoreLoading(false) })
    return () => { active = false }
  }, [onAuthExpired])

  function publishProfile(next: MobileHouseholdProfileData) {
    onProfileUpdate(next)
    setProfileError(null)
  }

  async function mutatePantrySettings(change: Record<string, unknown>) {
    setProfileBusy(true)
    setProfileError(null)
    try {
      const next = await updatePantrySettings(change)
      setPantrySettings(next)
      setPantryLoadError(null)
      return true
    } catch (caught) {
      setProfileError(caught instanceof Error ? caught.message : 'Nastavení zásob se nepodařilo uložit.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
      return false
    } finally { setProfileBusy(false) }
  }

  async function addPantryPlace() {
    if (!placeName.trim()) return
    if (await mutatePantrySettings({ action: 'add-place', area: placeArea, name: placeName.trim() })) setPlaceName('')
  }

  function confirmRemovePantryPlace(place: { id: string; name: string }) {
    Alert.alert('Odebrat vlastní místo?', place.name, [
      { text: 'Zrušit', style: 'cancel' },
      { text: 'Odebrat', style: 'destructive', onPress: () => { void mutatePantrySettings({ action: 'remove-place', placeId: place.id }) } },
    ])
  }

  async function removePantryLocation(location: string) {
    const count = pantrySettings?.locationCounts[location] ?? 0
    if (count > 0 && !locationTarget) {
      setProfileError('Vyberte, kam přesunout položky z tohoto místa.')
      return
    }
    if (await mutatePantrySettings({ action: 'remove-location', location, ...(count > 0 ? { targetKey: locationTarget } : {}) })) {
      setRemovingLocation(null)
      setLocationTarget('')
    }
  }

  function chooseStockType(productTypeKey: string) {
    const type = PRODUCT_TYPES.find((candidate) => candidate.key === productTypeKey)
    if (!type) return
    const existing = pantrySettings?.stockLevels.find((level) => level.productTypeKey === type.key)
    setStockTypeKey(type.key)
    setStockTypeQuery(type.name)
    setStockMinimum(existing ? String(existing.minQuantity) : '')
    setStockMaximum(existing ? String(existing.maxQuantity) : '')
    setStockUnit(existing?.unit ?? (DOSE_TYPE_KEYS.has(type.key) ? 'dávka' : type.unit))
  }

  async function saveStockLevel() {
    const minimum = Number(stockMinimum.replace(',', '.'))
    const maximum = Number(stockMaximum.replace(',', '.'))
    if (!stockTypeKey || !Number.isFinite(minimum) || !Number.isFinite(maximum)) {
      setProfileError('Vyberte druh zboží a vyplňte minimum i maximum.')
      return
    }
    if (await mutatePantrySettings({ action: 'set-stock-level', productTypeKey: stockTypeKey, minQuantity: minimum, maxQuantity: maximum, unit: stockUnit })) {
      setStockTypeQuery(''); setStockTypeKey(''); setStockMinimum(''); setStockMaximum('')
    }
  }

  async function saveCheckin(key: string, category: string, subcategory: string | undefined, defaultDays: number) {
    const raw = checkinDrafts[key] ?? String(subcategory ? pantrySettings?.subcategoryCheckinDays[key] ?? defaultDays : pantrySettings?.checkinDays[category as keyof MobilePantrySettings['checkinDays']] ?? defaultDays)
    const days = raw.trim() === '' || Number(raw) === defaultDays ? null : Number(raw)
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365)) {
      setProfileError('Počet dní musí být celé číslo mezi 1 a 365.')
      return
    }
    if (await mutatePantrySettings({ action: 'set-checkin', category, ...(subcategory ? { subcategory } : {}), days })) {
      setCheckinDrafts((current) => { const next = { ...current }; delete next[key]; return next })
    }
  }

  function toggleStoreChain(id: string) {
    const selected = storeChainIds.includes(id)
    const nextIds = selected ? storeChainIds.filter((value) => value !== id) : [...storeChainIds, id]
    setStoreChainIds(nextIds)
    if (selected) {
      setStorePriorityIds((values) => values.filter((value) => value !== id))
      const removedBranches = new Set([
        ...(storeSelection?.branches.filter((branch) => branch.storeId === id).map((branch) => branch.storeLocationId) ?? []),
        ...(branchPage?.rows.filter((branch) => branch.storeId === id).map((branch) => branch.id) ?? []),
      ])
      setStoreLocationIds((values) => values.filter((value) => !removedBranches.has(value)))
      if (branchChainId === id) { setBranchChainId(''); setBranchPage(null) }
    }
    setStoreError(null)
  }

  async function loadPreferenceBranches(chainId = branchChainId, page = 1) {
    if (!chainId) return
    setBranchLoading(true)
    setStoreError(null)
    try {
      const result = await getStoreBranches(branchCity.trim(), chainId, page)
      setBranchPage(result)
      setBranchPageNumber(result.page)
      setBranchChainId(chainId)
    } catch (caught) {
      setStoreError(caught instanceof Error ? caught.message : 'Prodejny se nepodařilo načíst.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally { setBranchLoading(false) }
  }

  async function saveStorePreferences() {
    const distanceValue = parseDistanceInput(storeDistance)
    const maxDistanceKm = distanceValue === null ? null : normalizeDistanceKm(distanceValue)
    const maxShopStores = storeMaxCount === '' ? null : Number(storeMaxCount)
    if ((distanceValue !== null && (Number.isNaN(distanceValue) || maxDistanceKm === null)) || (maxShopStores !== null && (!Number.isInteger(maxShopStores) || maxShopStores < 1 || maxShopStores > MAX_SHOP_STORES))) {
      setStoreError(`Vzdálenost musí být mezi 0,1 a ${MAX_DISTANCE_KM} km a počet obchodů 1 až ${MAX_SHOP_STORES}.`)
      return
    }
    setStoreSaving(true)
    setStoreError(null)
    try {
      const { selection: saved } = await updateStorePreferences({
        chainIds: storeChainIds,
        priorityChainIds: storePriorityIds.filter((id) => storeChainIds.includes(id)),
        locationIds: storeLocationIds,
        maxDistanceKm,
        maxShopStores,
      })
      setStoreSelection(saved)
      setStoreChainIds(saved.chainIds)
      setStorePriorityIds(saved.priorityChainIds)
      setStoreLocationIds(saved.branches.map((branch) => branch.storeLocationId))
      setStoreDistance(saved.maxDistanceKm == null ? '' : String(saved.maxDistanceKm).replace('.', ','))
      setStoreMaxCount(saved.maxShopStores == null ? '' : String(saved.maxShopStores))
      setMessage('Moje obchody byly uloženy.')
    } catch (caught) {
      setStoreError(caught instanceof Error ? caught.message : 'Nastavení obchodů se nepodařilo uložit.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally { setStoreSaving(false) }
  }

  function renderCheckinRow(key: string, label: string, category: keyof typeof CHECKIN_DAYS_BY_CATEGORY, subcategory: string | undefined, defaultDays: number) {
    const saved = subcategory ? pantrySettings?.subcategoryCheckinDays[key] : pantrySettings?.checkinDays[category]
    const value = checkinDrafts[key] ?? String(saved ?? defaultDays)
    return <View key={key} style={styles.pantrySettingRow}>
      <View style={styles.preferenceDescription}><Text style={styles.bodyText}>{label}</Text><Text style={styles.noteText}>{saved != null ? 'Vlastní hodnota' : `Výchozí: ${defaultDays} dní`}</Text></View>
      <TextInput accessibilityLabel={`Počet dní: ${label}`} keyboardType="number-pad" onChangeText={(text) => setCheckinDrafts((current) => ({ ...current, [key]: text }))} style={styles.checkinInput} value={value} />
      <Pressable accessibilityRole="button" disabled={profileBusy} onPress={() => void saveCheckin(key, category, subcategory, defaultDays)} style={styles.profileSmallAction}><Text style={styles.profileSmallActionText}>Uložit</Text></Pressable>
    </View>
  }

  async function createMember() {
    const age = Number(memberAge)
    if (!memberName.trim() || !Number.isInteger(age) || age < 0 || age > 120) {
      setProfileError('Zadejte jméno a věk člena od 0 do 120 let.')
      return
    }
    setProfileBusy(true)
    setProfileError(null)
    try {
      const splitList = (value: string) => value.split(',').map((part) => part.trim()).filter(Boolean)
      const { member } = await addHouseholdMember({ name: memberName.trim(), age, favoriteFoods: splitList(memberFavorites), dislikedFoods: splitList(memberDislikes), allergies: splitList(memberAllergies) })
      if (profile) publishProfile({ ...profile, members: [...profile.members, member] })
      setMemberName(''); setMemberAge(''); setMemberFavorites(''); setMemberDislikes(''); setMemberAllergies(''); setMemberFormOpen(false)
    } catch (caught) {
      setProfileError(caught instanceof Error ? caught.message : 'Člena domácnosti se nepodařilo přidat.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally { setProfileBusy(false) }
  }

  async function deleteMember(member: MobileHouseholdMember) {
    Alert.alert('Odebrat člena domácnosti?', member.name, [
      { text: 'Zrušit', style: 'cancel' },
      { text: 'Odebrat', style: 'destructive', onPress: () => { void (async () => {
        if (!profile) return
        setProfileBusy(true); setProfileError(null)
        try { await removeHouseholdMember(member.id); publishProfile({ ...profile, members: profile.members.filter((row) => row.id !== member.id) }) }
        catch (caught) { setProfileError(caught instanceof Error ? caught.message : 'Člena se nepodařilo odebrat.'); if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired() }
        finally { setProfileBusy(false) }
      })() } },
    ])
  }

  async function saveMemberDiet() {
    if (!editingDietMember || !profile) return
    setProfileBusy(true); setProfileError(null)
    try {
      const { diet } = await updateHouseholdMemberDiet(editingDietMember.id, dietDraft)
      publishProfile({ ...profile, members: profile.members.map((member) => member.id === editingDietMember.id ? { ...member, diet } : member) })
      setEditingDietMember(null)
    } catch (caught) { setProfileError(caught instanceof Error ? caught.message : 'Stravování se nepodařilo uložit.'); if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired() }
    finally { setProfileBusy(false) }
  }

  async function createChild() {
    const age = Number(childAge)
    if (!childName.trim() || !Number.isInteger(age) || age < 0 || age > 21 || !childPreferences.trim()) {
      setProfileError('Zadejte jméno, věk do 21 let a nákupní či stravovací preference dítěte.')
      return
    }
    setProfileBusy(true); setProfileError(null)
    try {
      const { child } = await addHouseholdChild({ name: childName.trim(), age, preferences: childPreferences.trim(), specialNeeds: childSpecialNeeds.trim() || undefined })
      if (profile) publishProfile({ ...profile, children: [...profile.children, child] })
      setChildName(''); setChildAge(''); setChildPreferences(''); setChildSpecialNeeds(''); setChildFormOpen(false)
    } catch (caught) { setProfileError(caught instanceof Error ? caught.message : 'Dítě se nepodařilo přidat.'); if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired() }
    finally { setProfileBusy(false) }
  }

  async function deleteChild(child: MobileHouseholdChild) {
    Alert.alert('Odebrat dítě?', child.name, [
      { text: 'Zrušit', style: 'cancel' },
      { text: 'Odebrat', style: 'destructive', onPress: () => { void (async () => {
        if (!profile) return
        setProfileBusy(true); setProfileError(null)
        try { await removeHouseholdChild(child.id); publishProfile({ ...profile, children: profile.children.filter((row) => row.id !== child.id) }) }
        catch (caught) { setProfileError(caught instanceof Error ? caught.message : 'Dítě se nepodařilo odebrat.'); if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired() }
        finally { setProfileBusy(false) }
      })() } },
    ])
  }

  async function saveShoppingPreferences() {
    setProfileBusy(true); setProfileError(null)
    try {
      const { preferences: saved } = await updateHouseholdPreferences({
        preferredBrands: preferenceLists.preferredBrands.split(',').map((value) => value.trim()).filter(Boolean),
        preferredStores: preferenceLists.preferredStores.split(',').map((value) => value.trim()).filter(Boolean),
        preferredProducts: preferenceLists.preferredProducts.split(',').map((value) => value.trim()).filter(Boolean),
        excludedProducts: preferenceLists.excludedProducts.split(',').map((value) => value.trim()).filter(Boolean),
        priceSensitivity, qualityPreference, preferCzechProducts,
      })
      if (profile) publishProfile({ ...profile, preferences: saved })
    } catch (caught) { setProfileError(caught instanceof Error ? caught.message : 'Nákupní preference se nepodařilo uložit.'); if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired() }
    finally { setProfileBusy(false) }
  }

  useEffect(() => {
    let active = true
    getNotificationPreferences().then(({ preferences: rows }) => { if (active) setPreferences(rows) }).catch((caught: unknown) => {
      if (active) {
        setPreferencesError(caught instanceof Error ? caught.message : 'Nastavení upozornění se nepodařilo načíst.')
        if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
      }
    })
    return () => { active = false }
  }, [onAuthExpired])

  async function togglePreference(key: string, enabled: boolean) {
    const before = preferences
    setPreferences(before.map((item) => item.key === key ? { ...item, enabled } : item))
    try { await updateNotificationPreference(key, enabled) } catch (caught) {
      setPreferences(before)
      setPreferencesError(caught instanceof Error ? caught.message : 'Nastavení upozornění se nepodařilo uložit.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    }
  }

  async function sendHouseholdInvite() {
    const email = inviteEmail.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteError('Zadejte platnou e-mailovou adresu.')
      return
    }
    setInviteBusy(true)
    setInviteError(null)
    try {
      const result = await createHouseholdInvitation(email)
      setInvitations((current) => [result.invitation, ...current.filter((item) => item.id !== result.invitation.id)])
      setInviteUrl(result.url)
      setInviteEmail('')
    } catch (caught) {
      setInviteError(caught instanceof Error ? caught.message : 'Pozvánku se nepodařilo vytvořit.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally { setInviteBusy(false) }
  }

  async function shareHouseholdInvite() {
    if (!inviteUrl) return
    try { await Share.share({ message: `Pozvánka do domácnosti ${householdName}: ${inviteUrl}` }) }
    catch (caught) { setInviteError(caught instanceof Error ? caught.message : 'Pozvánku se nepodařilo sdílet.') }
  }

  async function revokeInvitation(invitation: MobileHouseholdInvitation) {
    setInviteBusy(true)
    setInviteError(null)
    try {
      await revokeHouseholdInvitation(invitation.id)
      setInvitations((current) => current.filter((item) => item.id !== invitation.id))
    } catch (caught) {
      setInviteError(caught instanceof Error ? caught.message : 'Pozvánku se nepodařilo zrušit.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally { setInviteBusy(false) }
  }

  async function loadAuditLog() {
    setAuditLoading(true)
    setAuditError(null)
    try { setAuditEntries((await getHouseholdAuditLog()).entries) }
    catch (caught) {
      setAuditError(caught instanceof Error ? caught.message : 'Historii změn se nepodařilo načíst.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally { setAuditLoading(false) }
  }

  async function confirmDataReset() {
    setResetBusy(true)
    setResetError(null)
    try {
      const result = await resetHouseholdData(resetGroups, resetName)
      setResetOpen(false)
      setResetGroups([])
      setResetName('')
      await onReload()
      if (result.photosFailed > 0) Alert.alert('Data smazána', `Některé fotografie účtenek se nepodařilo odstranit (${result.photosFailed}).`)
    } catch (caught) {
      setResetError(caught instanceof Error ? caught.message : 'Data se nepodařilo smazat.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally { setResetBusy(false) }
  }

  async function confirmAccountDeletion() {
    setDeleteAccountBusy(true)
    setDeleteAccountError(null)
    try {
      const result = await deleteMobileAccount(deleteAccountEmail)
      try {
        await deleteSignedInUser()
      } catch (caught) {
        setDeleteAccountError(`Data jsou smazaná, ale přihlašovací účet se nepodařilo odstranit: ${caught instanceof Error ? caught.message : 'neznámá chyba'}. Napište správci aplikace.`)
        return
      }
      setDeleteAccountOpen(false)
      void onSignOut()
      if (result.photosFailed > 0) Alert.alert('Účet smazán', `Některé fotografie účtenek se nepodařilo odstranit (${result.photosFailed}).`)
    } catch (caught) {
      setDeleteAccountError(caught instanceof Error ? caught.message : 'Účet se nepodařilo smazat.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally { setDeleteAccountBusy(false) }
  }

  async function saveHousehold() {
    const monthlyBudget = Number(budgetDraft.replace(/[\s ]/g, '').replace(',', '.'))
    if (!Number.isFinite(monthlyBudget) || monthlyBudget < 0) {
      setError('Zadejte platný rozpočet od 0 výše.')
      return
    }
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const { household } = await updateHouseholdProfile({ name: nameDraft, monthlyBudget })
      onUpdateHousehold({ name: household.name, monthlyBudget: household.monthlyBudget })
      setMessage('Nastavení domácnosti bylo uloženo.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nastavení se nepodařilo uložit.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally {
      setSaving(false)
    }
  }

  const sections = [
    ['household', 'Domácnost'],
    ['shopping', 'Nákup'],
    ['pantry', 'Zásoby'],
    ['appearance', 'Vzhled'],
    ['notifications', 'Upozornění'],
  ] as const
  const preferenceFields = [
    ['preferredBrands', 'Preferované značky', 'Např. Milka'],
    ['preferredStores', 'Preferované obchody', 'Např. Lidl'],
    ['preferredProducts', 'Preferované produkty', 'Např. ovesné vločky'],
    ['excludedProducts', 'Produkty, které nekupovat', 'Např. energetické nápoje'],
  ] as const
  return <ScrollView contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
    <View style={styles.profileCard}><View style={styles.profileAvatar}><Text style={styles.profileInitials}>{name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</Text></View><Text style={styles.profileName}>{name}</Text><Text style={styles.bodyText}>{email}</Text><Pressable accessibilityRole="button" onPress={onOpenGuide} style={styles.profileSmallAction}><Text style={styles.profileSmallActionText}>Otevřít průvodce aplikací</Text></Pressable></View>
    <ScrollView horizontal contentContainerStyle={styles.profileSections} showsHorizontalScrollIndicator={false}>
      {sections.map(([key, label]) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: profileSection === key }} onPress={() => setProfileSection(key)} style={[styles.profileSectionButton, profileSection === key && styles.profileSectionButtonActive]}><Text style={[styles.profileSectionText, profileSection === key && styles.profileSectionTextActive]}>{label}</Text></Pressable>)}
    </ScrollView>

    {profileSection === 'household' ? <>
      <View style={styles.preferenceCard}>
        <Text style={styles.cardEyebrow}>DOMÁCNOST</Text><Text style={styles.cardTitle}>{householdName || 'Sdílená domácnost'}</Text>
        <Text style={styles.bodyText}>{householdRole ? `Vaše role: ${householdRole === 'owner' ? 'správce' : 'člen'}` : 'Účet zatím není připojený k domácnosti.'}</Text>
        {householdRole === 'owner' ? <>
          <Text style={styles.profileFieldLabel}>Název domácnosti</Text>
          <TextInput accessibilityLabel="Název domácnosti" onChangeText={setNameDraft} style={styles.profileInput} value={nameDraft} />
          <Text style={styles.profileFieldLabel}>Výchozí rozpočet za období ({householdCurrency})</Text>
          <TextInput accessibilityLabel="Výchozí rozpočet" keyboardType="decimal-pad" onChangeText={setBudgetDraft} style={styles.profileInput} value={budgetDraft} />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {message ? <Text style={styles.success}>{message}</Text> : null}
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveHousehold()} style={[styles.profileSaveButton, saving && styles.disabled]}><Text style={styles.profileSaveText}>{saving ? 'Ukládám…' : 'Uložit nastavení'}</Text></Pressable>
        </> : null}
      </View>
      {profile ? <>
        <View style={styles.preferenceCard}>
          <View style={styles.sectionHeader}><View style={styles.preferenceDescription}><Text style={styles.cardTitle}>Členové domácnosti</Text><Text style={styles.noteText}>Profil pomáhá přizpůsobit nákupy a jídelníček.</Text></View><Pressable accessibilityRole="button" onPress={() => setMemberFormOpen((open) => !open)} style={styles.inlineAction}><Text style={styles.inlineActionText}>{memberFormOpen ? 'Zavřít' : '+ Přidat'}</Text></Pressable></View>
          {profile.members.map((member) => <View key={member.id} style={styles.memberCard}>
            <View style={styles.sectionHeader}><View style={styles.memberAvatar}><Text style={styles.memberAvatarText}>{member.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</Text></View><View style={styles.memberInfo}><Text style={styles.cardTitle}>{member.name}</Text><Text style={styles.noteText}>{member.role === 'owner' ? 'Správce' : 'Člen'} · {member.age} let</Text></View>{member.removable ? <Pressable accessibilityLabel={`Odebrat člena ${member.name}`} accessibilityRole="button" disabled={profileBusy} onPress={() => deleteMember(member)} style={styles.removeIconButton}><Text style={styles.removeIconText}>×</Text></Pressable> : null}</View>
            {member.favoriteFoods.length || member.dislikedFoods.length || member.allergies.length ? <Text style={styles.noteText}>{[...member.favoriteFoods.map((value) => `Oblíbené: ${value}`), ...member.dislikedFoods.map((value) => `Nechce: ${value}`), ...member.allergies.map((value) => `Alergie: ${value}`)].join(' · ')}</Text> : null}
            {dietLabels(member.diet).length ? <Text style={styles.dietSummary}>{dietLabels(member.diet).join(' · ')}</Text> : null}
            <View style={styles.rowActions}><Pressable accessibilityRole="button" onPress={() => { setEditingDietMember(member); setDietDraft(member.diet) }} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>{dietLabels(member.diet).length ? 'Upravit stravování' : 'Vyplnit stravování'}</Text></Pressable></View>
          </View>)}
          {memberFormOpen ? <View style={styles.formPanel}>
            <TextInput accessibilityLabel="Jméno člena" onChangeText={setMemberName} placeholder="Jméno" placeholderTextColor={colors.mutedText} style={styles.profileInput} value={memberName} />
            <TextInput accessibilityLabel="Věk člena" keyboardType="number-pad" onChangeText={setMemberAge} placeholder="Věk" placeholderTextColor={colors.mutedText} style={styles.profileInput} value={memberAge} />
            <TextInput accessibilityLabel="Oblíbené potraviny" onChangeText={setMemberFavorites} placeholder="Oblíbené potraviny (oddělit čárkou)" placeholderTextColor={colors.mutedText} style={styles.profileInput} value={memberFavorites} />
            <TextInput accessibilityLabel="Nechce potraviny" onChangeText={setMemberDislikes} placeholder="Nechce (oddělit čárkou)" placeholderTextColor={colors.mutedText} style={styles.profileInput} value={memberDislikes} />
            <TextInput accessibilityLabel="Alergie a intolerance" onChangeText={setMemberAllergies} placeholder="Alergie / intolerance (oddělit čárkou)" placeholderTextColor={colors.mutedText} style={styles.profileInput} value={memberAllergies} />
            <Pressable accessibilityRole="button" disabled={profileBusy} onPress={() => void createMember()} style={[styles.profileSaveButton, profileBusy && styles.disabled]}><Text style={styles.profileSaveText}>{profileBusy ? 'Ukládám…' : 'Přidat člena domácnosti'}</Text></Pressable>
          </View> : null}
        </View>
        <View style={styles.preferenceCard}>
          <View style={styles.sectionHeader}><View style={styles.preferenceDescription}><Text style={styles.cardTitle}>Děti</Text><Text style={styles.noteText}>Preference a zvláštní potřeby pro plánování nákupů.</Text></View><Pressable accessibilityRole="button" onPress={() => setChildFormOpen((open) => !open)} style={styles.inlineAction}><Text style={styles.inlineActionText}>{childFormOpen ? 'Zavřít' : '+ Přidat'}</Text></Pressable></View>
          {profile.children.map((child) => <View key={child.id} style={styles.memberCard}><View style={styles.sectionHeader}><View style={styles.memberInfo}><Text style={styles.cardTitle}>{child.name}</Text><Text style={styles.noteText}>{child.age} let</Text></View><Pressable accessibilityLabel={`Odebrat dítě ${child.name}`} accessibilityRole="button" disabled={profileBusy} onPress={() => deleteChild(child)} style={styles.removeIconButton}><Text style={styles.removeIconText}>×</Text></Pressable></View>{child.preferences ? <Text style={styles.noteText}>Preference: {child.preferences}</Text> : null}{child.specialNeeds ? <Text style={styles.childNeeds}>Specifické potřeby: {child.specialNeeds}</Text> : null}</View>)}
          {childFormOpen ? <View style={styles.formPanel}>
            <TextInput accessibilityLabel="Jméno dítěte" onChangeText={setChildName} placeholder="Jméno" placeholderTextColor={colors.mutedText} style={styles.profileInput} value={childName} />
            <TextInput accessibilityLabel="Věk dítěte" keyboardType="number-pad" onChangeText={setChildAge} placeholder="Věk" placeholderTextColor={colors.mutedText} style={styles.profileInput} value={childAge} />
            <TextInput accessibilityLabel="Preference dítěte" onChangeText={setChildPreferences} placeholder="Nákupní nebo stravovací preference" placeholderTextColor={colors.mutedText} style={styles.profileInput} value={childPreferences} />
            <TextInput accessibilityLabel="Specifické potřeby dítěte" onChangeText={setChildSpecialNeeds} placeholder="Specifické potřeby (volitelné)" placeholderTextColor={colors.mutedText} style={styles.profileInput} value={childSpecialNeeds} />
            <Pressable accessibilityRole="button" disabled={profileBusy} onPress={() => void createChild()} style={[styles.profileSaveButton, profileBusy && styles.disabled]}><Text style={styles.profileSaveText}>{profileBusy ? 'Ukládám…' : 'Přidat dítě'}</Text></Pressable>
          </View> : null}
        </View>
      </> : <View style={styles.emptyCard}><Text style={styles.cardTitle}>Profil domácnosti se nepodařilo načíst</Text><Text style={styles.bodyText}>Obnovte účet nebo zkuste načíst profil znovu.</Text></View>}
      {householdRole === 'owner' ? <View style={styles.preferenceCard}>
        <Text style={styles.cardEyebrow}>ČLENSTVÍ V DOMÁCNOSTI</Text><Text style={styles.cardTitle}>Pozvat člena</Text><Text style={styles.bodyText}>Pozvánka platí 7 dní. Odkaz můžete poslat přes systémové sdílení telefonu.</Text>
        <View style={styles.rowFields}><TextInput accessibilityLabel="E-mail člena domácnosti" autoCapitalize="none" keyboardType="email-address" onChangeText={setInviteEmail} onSubmitEditing={() => void sendHouseholdInvite()} placeholder="email@rodina.cz" placeholderTextColor={colors.mutedText} style={[styles.profileInput, styles.flexInput]} value={inviteEmail} /><Pressable accessibilityRole="button" disabled={inviteBusy} onPress={() => void sendHouseholdInvite()} style={[styles.inlineAction, inviteBusy && styles.disabled]}><Text style={styles.inlineActionText}>{inviteBusy ? 'Vytvářím…' : 'Pozvat'}</Text></Pressable></View>
        {inviteUrl ? <Pressable accessibilityRole="button" onPress={() => void shareHouseholdInvite()} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Sdílet pozvánku</Text></Pressable> : null}
        {invitations.map((invitation) => <View key={invitation.id} style={styles.pantrySettingRow}><View style={styles.preferenceDescription}><Text style={styles.bodyText}>{invitation.email}</Text><Text style={styles.noteText}>Pozvánka čeká · platí do {new Date(invitation.expiresAt).toLocaleDateString('cs-CZ')}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Zrušit pozvánku pro ${invitation.email}`} disabled={inviteBusy} onPress={() => void revokeInvitation(invitation)} style={styles.removeIconButton}><Text style={styles.removeIconText}>×</Text></Pressable></View>)}
        {inviteError ? <Text accessibilityRole="alert" style={styles.error}>{inviteError}</Text> : null}
      </View> : invitations.length > 0 ? <View style={styles.preferenceCard}><Text style={styles.cardTitle}>Čekající pozvánky</Text>{invitations.map((invitation) => <Text key={invitation.id} style={styles.bodyText}>{invitation.email} · platí do {new Date(invitation.expiresAt).toLocaleDateString('cs-CZ')}</Text>)}</View> : null}
      {householdRole === 'owner' ? <View style={styles.preferenceCard}>
        <Text style={styles.cardEyebrow}>DOMÁCNOST</Text><Text style={styles.cardTitle}>Historie změn</Text><Text style={styles.bodyText}>Kdo upravil rozpočet, výdaje, příjmy a členy domácnosti.</Text>
        {auditEntries === null ? <Pressable accessibilityRole="button" disabled={auditLoading} onPress={() => void loadAuditLog()} style={[styles.secondaryAction, auditLoading && styles.disabled]}><Text style={styles.secondaryActionText}>{auditLoading ? 'Načítám historii…' : 'Zobrazit historii'}</Text></Pressable> : auditEntries.length === 0 ? <Text style={styles.noteText}>Zatím tu není žádná zaznamenaná změna. Historie se uchovává jeden rok.</Text> : auditEntries.map((entry) => <View key={entry.id} style={styles.auditRow}><Text style={styles.bodyText}>{entry.actor ?? 'Bývalý člen'} · {auditLabel(entry.action)}</Text><Text style={styles.noteText}>{new Date(entry.createdAt).toLocaleString('cs-CZ')}{auditDetailText(entry.detail) ? ` · ${auditDetailText(entry.detail)}` : ''}</Text></View>)}
        {auditError ? <Text accessibilityRole="alert" style={styles.error}>{auditError}</Text> : null}
      </View> : null}
      {householdRole === 'owner' ? <View style={styles.preferenceCard}>
        <Text style={styles.cardEyebrow}>DOMÁCNOST</Text><Text style={styles.cardTitle}>Smazání dat</Text>
        <Text style={styles.bodyText}>Nevratně smaže vybraná data pro celou domácnost. Profil, členové, preference a nastavení zůstanou.</Text>
        <Pressable accessibilityRole="button" onPress={() => { setResetGroups([]); setResetName(''); setResetError(null); setResetOpen(true) }} style={styles.dangerAction}><Text style={styles.dangerActionText}>Smazat data…</Text></Pressable>
      </View> : null}
      {profileError ? <Text accessibilityRole="alert" style={styles.error}>{profileError}</Text> : null}
    </> : null}

    {profileSection === 'shopping' ? <>
      <View style={styles.preferenceCard}>
        <Text style={styles.cardEyebrow}>MŮJ NÁKUP · OBCHODY</Text><Text style={styles.cardTitle}>Moje obchody v okolí</Text><Text style={styles.bodyText}>Výběr je osobní. Akce a ceny se přizpůsobí obchodům, kam běžně chodíte.</Text>
        {storeLoading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : <>
          <Text style={styles.profileFieldLabel}>Obchodní řetězce</Text>
          <View style={styles.themeChoices}>{storeChains.map((chain) => {
            const selected = storeChainIds.includes(chain.id)
            return <Pressable key={chain.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => toggleStoreChain(chain.id)} style={[styles.themeChoice, selected && styles.themeChoiceSelected]}><Text style={[styles.themeChoiceText, selected && styles.themeChoiceTextSelected]}>{selected ? '✓  ' : ''}{chain.chain}{chain.isOnline ? ' · online' : ''}</Text></Pressable>
          })}</View>
          {storeChains.length === 0 ? <Text style={styles.noteText}>Obchody nejsou dostupné.</Text> : null}
          {storeChainIds.length === 0 && storeChains.length > 0 ? <Text style={styles.noteText}>Bez výběru se zobrazují ceny ze všech obchodů.</Text> : null}
          {storeChainIds.length > 0 ? <>
            <Text style={styles.profileFieldLabel}>Prioritní obchody</Text><Text style={styles.noteText}>Plán nákupu je upřednostní, pokud jejich cena není výrazně vyšší.</Text>
            <View style={styles.themeChoices}>{storeChains.filter((chain) => storeChainIds.includes(chain.id)).map((chain) => {
              const selected = storePriorityIds.includes(chain.id)
              return <Pressable key={chain.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => setStorePriorityIds((current) => selected ? current.filter((id) => id !== chain.id) : [...current, chain.id])} style={[styles.themeChoice, selected && styles.themeChoiceSelected]}><Text style={[styles.themeChoiceText, selected && styles.themeChoiceTextSelected]}>{selected ? '★  ' : '☆  '}{chain.chain}</Text></Pressable>
            })}</View>
            <Text style={styles.profileFieldLabel}>Konkrétní prodejny (volitelné)</Text><Text style={styles.noteText}>Bez výběru se počítá celý řetězec. Vybráno: {storeLocationIds.length} prodejen.</Text>
            <View style={styles.themeChoices}>{storeChains.filter((chain) => storeChainIds.includes(chain.id) && !chain.isOnline).map((chain) => <Pressable key={chain.id} accessibilityRole="button" accessibilityState={{ expanded: branchChainId === chain.id }} onPress={() => { setBranchChainId(branchChainId === chain.id ? '' : chain.id); setBranchPage(null); setBranchCity('') }} style={[styles.themeChoice, branchChainId === chain.id && styles.themeChoiceSelected]}><Text style={[styles.themeChoiceText, branchChainId === chain.id && styles.themeChoiceTextSelected]}>{chain.chain} · {storeSelection?.branches.filter((branch) => branch.storeId === chain.id).length ?? 0}</Text></Pressable>)}</View>
            {branchChainId ? <View style={styles.branchPicker}>
              <Text style={styles.noteText}>Vybrat prodejny · {storeChains.find((chain) => chain.id === branchChainId)?.chain}</Text>
              <View style={styles.searchBox}><MapPin color={colors.mutedText} size={18} /><TextInput accessibilityLabel="Město nebo ulice pro prodejnu" onChangeText={setBranchCity} onSubmitEditing={() => void loadPreferenceBranches(branchChainId)} placeholder="Město nebo ulice" placeholderTextColor={colors.mutedText} style={styles.searchInput} value={branchCity} /><Pressable accessibilityRole="button" disabled={branchLoading} onPress={() => void loadPreferenceBranches(branchChainId)}><Search color={colors.accentText} size={19} /></Pressable></View>
              {branchLoading ? <ActivityIndicator color={colors.primary} /> : null}
              {branchPage?.rows.map((branch) => {
                const selected = storeLocationIds.includes(branch.id)
                return <Pressable key={branch.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => setStoreLocationIds((current) => selected ? current.filter((id) => id !== branch.id) : [...current, branch.id])} style={styles.branchChoice}><View style={[styles.branchCheckbox, selected && styles.branchCheckboxSelected]}><Text style={styles.branchCheckmark}>{selected ? '✓' : ''}</Text></View><View style={styles.preferenceDescription}><Text style={styles.bodyText}>{branch.name}</Text><Text style={styles.noteText}>{[branch.address, branch.city].filter(Boolean).join(', ')}</Text></View></Pressable>
              })}
              {branchPage && branchPage.total > 0 ? <View style={styles.pagination}><Pressable accessibilityRole="button" disabled={branchPageNumber <= 1 || branchLoading} onPress={() => void loadPreferenceBranches(branchChainId, branchPageNumber - 1)} style={styles.pageButton}><Text style={styles.pageText}>Předchozí</Text></Pressable><Text style={styles.noteText}>{branchPageNumber} · {Math.ceil(branchPage.total / BRANCH_PAGE_SIZE)}</Text><Pressable accessibilityRole="button" disabled={branchPageNumber >= Math.ceil(branchPage.total / BRANCH_PAGE_SIZE) || branchLoading} onPress={() => void loadPreferenceBranches(branchChainId, branchPageNumber + 1)} style={styles.pageButton}><Text style={styles.pageText}>Další</Text></Pressable></View> : null}
              {branchPage?.total === 0 ? <Text style={styles.noteText}>Prodejny nebyly nalezeny.</Text> : null}
            </View> : null}
          </> : null}
          <Text style={styles.profileFieldLabel}>Kolik obchodů maximálně navštívím při jednom nákupu</Text>
          <View style={styles.themeChoices}>{['', ...Array.from({ length: MAX_SHOP_STORES }, (_, index) => String(index + 1))].map((value) => <Pressable key={value || 'unset'} accessibilityRole="radio" accessibilityState={{ checked: storeMaxCount === value }} onPress={() => setStoreMaxCount(value)} style={[styles.themeChoice, storeMaxCount === value && styles.themeChoiceSelected]}><Text style={[styles.themeChoiceText, storeMaxCount === value && styles.themeChoiceTextSelected]}>{value || 'Bez limitu'}</Text></Pressable>)}</View>
          <Text style={styles.profileFieldLabel}>Kolik km jsem ochoten dojet kvůli nákupu</Text>
          <View style={styles.rowFields}><TextInput accessibilityLabel="Maximální vzdálenost v kilometrech" keyboardType="decimal-pad" onChangeText={setStoreDistance} placeholder="Např. 2" placeholderTextColor={colors.mutedText} style={[styles.profileInput, styles.distanceInput]} value={storeDistance} /><Text style={styles.bodyText}>km · nejvýše {MAX_DISTANCE_KM} km</Text></View>
          {storeError ? <Text accessibilityRole="alert" style={styles.error}>{storeError}</Text> : null}
          <Pressable accessibilityRole="button" disabled={storeSaving || storeLoading || !storeSelection} onPress={() => void saveStorePreferences()} style={[styles.profileSaveButton, (storeSaving || storeLoading || !storeSelection) && styles.disabled]}><Text style={styles.profileSaveText}>{storeSaving ? 'Ukládám…' : 'Uložit obchody'}</Text></Pressable>
        </>}
      </View>
      <View style={styles.preferenceCard}>
      <Text style={styles.cardEyebrow}>NÁKUP A OBCHODY</Text><Text style={styles.cardTitle}>Nákupní preference domácnosti</Text><Text style={styles.bodyText}>Nastavení pomáhá vybírat produkty, obchody a ceny.</Text>
      {profile ? <>
        {preferenceFields.map(([key, label, placeholder]) => <View key={key}><Text style={styles.profileFieldLabel}>{label}</Text><TextInput accessibilityLabel={label} onChangeText={(value) => setPreferenceLists((current) => ({ ...current, [key]: value }))} placeholder={placeholder} placeholderTextColor={colors.mutedText} style={styles.profileInput} value={preferenceLists[key]} /></View>)}
        <Text style={styles.profileFieldLabel}>Cenová preference</Text><View style={styles.themeChoices}>{([['cheapest', 'Nejlevnější'], ['balanced', 'Vyvážené'], ['quality_first', 'Kvalita především']] as [MobileHouseholdPreferences['priceSensitivity'], string][]).map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: priceSensitivity === value }} onPress={() => setPriceSensitivity(value)} style={[styles.themeChoice, priceSensitivity === value && styles.themeChoiceSelected]}><Text style={[styles.themeChoiceText, priceSensitivity === value && styles.themeChoiceTextSelected]}>{label}</Text></Pressable>)}</View>
        <Text style={styles.profileFieldLabel}>Preference kvality</Text><View style={styles.themeChoices}>{([['standard', 'Standardní'], ['premium', 'Prémiová']] as [MobileHouseholdPreferences['qualityPreference'], string][]).map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: qualityPreference === value }} onPress={() => setQualityPreference(value)} style={[styles.themeChoice, qualityPreference === value && styles.themeChoiceSelected]}><Text style={[styles.themeChoiceText, qualityPreference === value && styles.themeChoiceTextSelected]}>{label}</Text></Pressable>)}</View>
        <View style={styles.preferenceRow}><Text style={[styles.cardTitle, styles.flexText]}>Preferovat české výrobky</Text><Switch accessibilityLabel="Preferovat české výrobky" value={preferCzechProducts} onValueChange={setPreferCzechProducts} trackColor={{ false: colors.border, true: colors.accent }} thumbColor={colors.card} /></View>
        {profileError ? <Text accessibilityRole="alert" style={styles.error}>{profileError}</Text> : null}
        <Pressable accessibilityRole="button" disabled={profileBusy} onPress={() => void saveShoppingPreferences()} style={[styles.profileSaveButton, profileBusy && styles.disabled]}><Text style={styles.profileSaveText}>{profileBusy ? 'Ukládám…' : 'Uložit nákupní preference'}</Text></Pressable>
      </> : <Text style={styles.bodyText}>Nákupní preference domácnosti nejsou dostupné.</Text>}
      </View>
    </> : null}

    {profileSection === 'pantry' ? <>
      {pantryLoading ? <View style={styles.emptyCard}><ActivityIndicator color={colors.primary} /><Text style={styles.bodyText}>Načítám nastavení zásob…</Text></View> : pantryLoadError ? <Text accessibilityRole="alert" style={styles.error}>{pantryLoadError}</Text> : pantrySettings ? <>
        <View style={styles.preferenceCard}>
          <Text style={styles.cardEyebrow}>ZÁSOBY · MÍSTA</Text><Text style={styles.cardTitle}>Vlastní místa</Text><Text style={styles.bodyText}>Přidejte domácí úložná místa nebo upravte výchozí místa.</Text>
          <Text style={styles.profileFieldLabel}>Oblast</Text><View style={styles.themeChoices}>{PANTRY_AREAS.map((area) => <Pressable key={area} accessibilityRole="button" accessibilityState={{ selected: placeArea === area }} onPress={() => setPlaceArea(area)} style={[styles.themeChoice, placeArea === area && styles.themeChoiceSelected]}><Text style={[styles.themeChoiceText, placeArea === area && styles.themeChoiceTextSelected]}>{area}</Text></Pressable>)}</View>
          <TextInput accessibilityLabel="Název vlastního místa" onChangeText={setPlaceName} placeholder="Např. Sklep nebo kufr auta" placeholderTextColor={colors.mutedText} style={styles.profileInput} value={placeName} />
          <Pressable accessibilityRole="button" disabled={profileBusy || !placeName.trim()} onPress={() => void addPantryPlace()} style={[styles.profileSaveButton, (profileBusy || !placeName.trim()) && styles.disabled]}><Text style={styles.profileSaveText}>Přidat místo</Text></Pressable>
          {pantrySettings.customPlaces.map((place) => <View key={place.id} style={styles.pantrySettingRow}><View style={styles.preferenceDescription}><Text style={styles.cardTitle}>{place.name}</Text><Text style={styles.noteText}>{place.area}</Text></View><Pressable accessibilityLabel={`Odebrat místo ${place.name}`} accessibilityRole="button" disabled={profileBusy} onPress={() => confirmRemovePantryPlace(place)} style={styles.removeIconButton}><Text style={styles.removeIconText}>×</Text></Pressable></View>)}
          <Text style={styles.profileFieldLabel}>Výchozí místa</Text>
          {PANTRY_LOCATIONS.map((location) => {
            const hidden = pantrySettings.hiddenLocations.includes(location)
            const count = pantrySettings.locationCounts[location] ?? 0
            const removing = removingLocation === location
            const targets = pantrySettings.placeOptions.filter((place) => place.key !== location)
            return <View key={location} style={styles.pantrySettingRow}>
              <View style={styles.preferenceDescription}><Text style={[styles.bodyText, hidden && styles.hiddenLocation]}>{location}</Text><Text style={styles.noteText}>{count} položek</Text></View>
              {hidden ? <Pressable accessibilityRole="button" disabled={profileBusy} onPress={() => void mutatePantrySettings({ action: 'restore-location', location })} style={styles.profileSmallAction}><Text style={styles.profileSmallActionText}>Obnovit</Text></Pressable> : <Pressable accessibilityRole="button" disabled={profileBusy} onPress={() => { setRemovingLocation(removing ? null : location); setLocationTarget(''); setProfileError(null) }} style={styles.removeIconButton}><Text style={styles.removeIconText}>{removing ? '×' : '−'}</Text></Pressable>}
              {removing ? <View style={styles.pantrySubform}>
                {count > 0 ? <><Text style={styles.noteText}>Přesuňte {count} položek do:</Text><View style={styles.themeChoices}>{targets.map((target) => <Pressable key={target.key} accessibilityRole="button" accessibilityState={{ selected: locationTarget === target.key }} onPress={() => setLocationTarget(target.key)} style={[styles.themeChoice, locationTarget === target.key && styles.themeChoiceSelected]}><Text style={[styles.themeChoiceText, locationTarget === target.key && styles.themeChoiceTextSelected]}>{target.name}</Text></Pressable>)}</View></> : <Text style={styles.noteText}>Místo neobsahuje žádné položky.</Text>}
                <Pressable accessibilityRole="button" disabled={profileBusy || (count > 0 && !locationTarget)} onPress={() => void removePantryLocation(location)} style={[styles.dangerAction, (profileBusy || (count > 0 && !locationTarget)) && styles.disabled]}><Text style={styles.dangerActionText}>Odebrat výchozí místo</Text></Pressable>
              </View> : null}
            </View>
          })}
        </View>

        <View style={styles.preferenceCard}>
          <Text style={styles.cardEyebrow}>ZÁSOBY · HLÍDÁNÍ</Text><Text style={styles.cardTitle}>Hlídané zásoby</Text><Text style={styles.bodyText}>Nastavte minimum a maximum podle druhu zboží. Při akci pak aplikace navrhne doplnění do maxima.</Text>
          {pantrySettings.stockLevels.map((level: MobilePantryStockLevel) => <View key={level.id} style={styles.pantrySettingRow}><Pressable accessibilityRole="button" onPress={() => chooseStockType(level.productTypeKey)} style={styles.preferenceDescription}><Text style={styles.cardTitle}>{level.typeName}</Text><Text style={styles.noteText}>Minimum {level.minQuantity} · maximum {level.maxQuantity} {unitLabel(level.maxQuantity, level.unit)}</Text></Pressable><Pressable accessibilityRole="button" disabled={profileBusy} onPress={() => void mutatePantrySettings({ action: 'remove-stock-level', levelId: level.id })} style={styles.removeIconButton}><Text style={styles.removeIconText}>×</Text></Pressable></View>)}
          <Text style={styles.profileFieldLabel}>Druh zboží</Text><TextInput accessibilityLabel="Druh zboží k hlídání" onChangeText={(value) => { setStockTypeQuery(value); setStockTypeKey('') }} placeholder="Např. Máslo nebo Mléko" placeholderTextColor={colors.mutedText} style={styles.profileInput} value={stockTypeQuery} />
          {stockTypeQuery && !stockTypeKey ? <View style={styles.suggestionList}>{PRODUCT_TYPES.filter((type) => type.name.toLocaleLowerCase('cs').includes(stockTypeQuery.toLocaleLowerCase('cs'))).slice(0, 10).map((type) => <Pressable key={type.key} accessibilityRole="button" onPress={() => chooseStockType(type.key)} style={styles.suggestion}><Text style={styles.suggestionText}>{type.name}</Text></Pressable>)}</View> : null}
          {stockTypeKey ? <>
            <View style={styles.rowFields}><View style={styles.flexInput}><Text style={styles.profileFieldLabel}>Minimum</Text><TextInput accessibilityLabel="Minimum zásoby" keyboardType="decimal-pad" onChangeText={setStockMinimum} style={styles.profileInput} value={stockMinimum} /></View><View style={styles.flexInput}><Text style={styles.profileFieldLabel}>Maximum</Text><TextInput accessibilityLabel="Maximum zásoby" keyboardType="decimal-pad" onChangeText={setStockMaximum} style={styles.profileInput} value={stockMaximum} /></View></View>
            <Text style={styles.profileFieldLabel}>Jednotka</Text><View style={styles.themeChoices}>{ITEM_UNITS.map((unit) => <Pressable key={unit} accessibilityRole="button" accessibilityState={{ selected: stockUnit === unit }} onPress={() => setStockUnit(unit)} style={[styles.themeChoice, stockUnit === unit && styles.themeChoiceSelected]}><Text style={[styles.themeChoiceText, stockUnit === unit && styles.themeChoiceTextSelected]}>{unit === 'dávka' ? 'dávky' : unit}</Text></Pressable>)}</View>
            <Pressable accessibilityRole="button" disabled={profileBusy} onPress={() => void saveStockLevel()} style={[styles.profileSaveButton, profileBusy && styles.disabled]}><Text style={styles.profileSaveText}>Uložit hlídání zásob</Text></Pressable>
          </> : null}
        </View>

        <View style={styles.preferenceCard}>
          <Text style={styles.cardEyebrow}>ZÁSOBY · KONTROLA</Text><Text style={styles.cardTitle}>Kontrola podle kategorie</Text><Text style={styles.bodyText}>Po kolika dnech se aplikace zeptá, jestli položku ještě máte. Prázdné pole lze uložit jako výchozí hodnotu.</Text>
          {(Object.keys(CHECKIN_DAYS_BY_CATEGORY) as (keyof typeof CHECKIN_DAYS_BY_CATEGORY)[]).map((category) => {
            const defaults = CHECKIN_DAYS_BY_SUBCATEGORY[category]
            const subcategoryRows = defaults ? subcategoriesOfItem(category).filter((subcategory) => defaults[subcategory] != null) : []
            const rows = subcategoryRows.map((subcategory) => renderCheckinRow(checkinSubcategoryKey(category, subcategory), subcategory, category, subcategory, defaults![subcategory]))
            rows.push(renderCheckinRow(category, defaults ? 'Bez podkategorie' : category, category, undefined, CHECKIN_DAYS_BY_CATEGORY[category]))
            return <View key={category} style={styles.pantryCheckinGroup}>{defaults ? <Text style={styles.cardEyebrow}>{category.toLocaleUpperCase('cs')}</Text> : null}{rows}</View>
          })}
        </View>
        {profileError ? <Text accessibilityRole="alert" style={styles.error}>{profileError}</Text> : null}
      </> : <View style={styles.emptyCard}><Text style={styles.cardTitle}>Nastavení zásob není dostupné</Text></View>}
    </> : null}

    {profileSection === 'appearance' ? <View style={styles.preferenceCard}>
      <Text style={styles.cardEyebrow}>VZHLED APLIKACE</Text><Text style={styles.cardTitle}>Barevný režim</Text><Text style={styles.bodyText}>Volba se uloží v zařízení a použije se ve všech nativních obrazovkách a grafech.</Text>
      <View style={styles.themeChoices}>{([['system', 'Podle systému'], ['light', 'Světlé'], ['dark', 'Tmavé']] as [ThemePreference, string][]).map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: preference === value }} onPress={() => setPreference(value)} style={[styles.themeChoice, preference === value && styles.themeChoiceSelected]}><Text style={[styles.themeChoiceText, preference === value && styles.themeChoiceTextSelected]}>{label}</Text></Pressable>)}</View>
    </View> : null}

    {profileSection === 'notifications' ? <View style={styles.preferenceCard}>
      <Text style={styles.cardEyebrow}>UPOZORNĚNÍ</Text><Text style={styles.cardTitle}>Co chcete dostávat</Text><Text style={styles.bodyText}>Nastavení platí jen pro váš účet.</Text>
      {preferencesError ? <Text accessibilityRole="alert" style={styles.error}>{preferencesError}</Text> : null}
      {preferences.map((item) => <View key={item.key} style={styles.preferenceRow}><View style={styles.preferenceDescription}><Text style={styles.cardTitle}>{item.label}</Text><Text style={styles.noteText}>{item.description}</Text></View><Switch accessibilityLabel={item.label} value={item.enabled} onValueChange={(enabled) => void togglePreference(item.key, enabled)} trackColor={{ false: colors.border, true: colors.accent }} thumbColor={colors.card} /></View>)}
      <NativeDevicePushSetting onAuthExpired={onAuthExpired} />
    </View> : null}
    <Pressable accessibilityRole="button" onPress={() => { setDeleteAccountEmail(''); setDeleteAccountError(null); setDeleteAccountOpen(true) }} style={styles.accountDeleteButton}><Text style={styles.accountDeleteText}>Smazat účet…</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={onSignOut} style={styles.signOutButton}><Text style={styles.signOutText}>Odhlásit se</Text></Pressable>

    <Modal animationType="slide" onRequestClose={() => { if (!deleteAccountBusy) setDeleteAccountOpen(false) }} transparent visible={deleteAccountOpen}>
      <View style={styles.modalScrim}><ScrollView contentContainerStyle={styles.dietModalScroll} keyboardShouldPersistTaps="handled"><View style={styles.dietModal}>
        <View style={styles.sectionHeader}><View style={styles.preferenceDescription}><Text style={styles.sheetTitle}>Smazat účet</Text><Text style={styles.bodyText}>{householdRole === 'owner' ? 'Smažete svůj účet i celou domácnost: seznamy, nákupy, účtenky s fotkami, rozpočet, zásoby a profily všech členů. Nejde to vrátit.' : 'Smažete svůj účet a svůj profil v domácnosti. Sdílená data domácnosti zůstanou ostatním. Nejde to vrátit.'}</Text></View><Pressable accessibilityLabel="Zavřít" accessibilityRole="button" disabled={deleteAccountBusy} onPress={() => setDeleteAccountOpen(false)} style={styles.closeButton}><X color={colors.foreground} size={20} /></Pressable></View>
        <Text style={styles.profileFieldLabel}>Pro potvrzení napište svůj e-mail: {email}</Text>
        <TextInput accessibilityLabel="Potvrzovací e-mail účtu" autoCapitalize="none" autoCorrect={false} editable={!deleteAccountBusy} keyboardType="email-address" onChangeText={setDeleteAccountEmail} placeholder={email} placeholderTextColor={colors.mutedText} style={styles.profileInput} value={deleteAccountEmail} />
        {deleteAccountError ? <Text accessibilityRole="alert" style={styles.error}>{deleteAccountError}</Text> : null}
        <View style={styles.rowActions}><Pressable accessibilityRole="button" disabled={deleteAccountBusy} onPress={() => setDeleteAccountOpen(false)} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Zrušit</Text></Pressable><Pressable accessibilityRole="button" disabled={deleteAccountBusy || !confirmsEmail(deleteAccountEmail, email)} onPress={() => void confirmAccountDeletion()} style={[styles.accountDeleteConfirm, (deleteAccountBusy || !confirmsEmail(deleteAccountEmail, email)) && styles.disabled]}><Text style={styles.accountDeleteConfirmText}>{deleteAccountBusy ? 'Mažu…' : 'Smazat navždy'}</Text></Pressable></View>
      </View></ScrollView></View>
    </Modal>

    <Modal animationType="slide" onRequestClose={() => { if (!resetBusy) setResetOpen(false) }} transparent visible={resetOpen}>
      <View style={styles.modalScrim}><ScrollView contentContainerStyle={styles.dietModalScroll} keyboardShouldPersistTaps="handled"><View style={styles.dietModal}>
        <View style={styles.sectionHeader}><View style={styles.preferenceDescription}><Text style={styles.sheetTitle}>Smazat data domácnosti</Text><Text style={styles.bodyText}>Smazání je nevratné a týká se všech členů domácnosti.</Text></View><Pressable accessibilityLabel="Zavřít" accessibilityRole="button" disabled={resetBusy} onPress={() => setResetOpen(false)} style={styles.closeButton}><X color={colors.foreground} size={20} /></Pressable></View>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: resetGroups.length === DATA_RESET_GROUPS.length }} onPress={() => setResetGroups(resetGroups.length === DATA_RESET_GROUPS.length ? [] : [...DATA_RESET_GROUPS])} style={styles.resetChoice}><View style={[styles.branchCheckbox, resetGroups.length === DATA_RESET_GROUPS.length && styles.branchCheckboxSelected]}><Text style={styles.branchCheckmark}>{resetGroups.length === DATA_RESET_GROUPS.length ? '✓' : ''}</Text></View><Text style={styles.cardTitle}>Vybrat vše</Text></Pressable>
        {DATA_RESET_GROUPS.map((group) => {
          const selected = resetGroups.includes(group)
          return <Pressable key={group} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => setResetGroups((current) => selected ? current.filter((value) => value !== group) : [...current, group])} style={styles.resetChoice}><View style={[styles.branchCheckbox, selected && styles.branchCheckboxSelected]}><Text style={styles.branchCheckmark}>{selected ? '✓' : ''}</Text></View><View style={styles.preferenceDescription}><Text style={styles.cardTitle}>{DATA_RESET_LABELS[group].title}</Text><Text style={styles.noteText}>{DATA_RESET_LABELS[group].description}</Text></View></Pressable>
        })}
        <Text style={styles.profileFieldLabel}>Pro potvrzení napište název domácnosti: {householdName}</Text>
        <TextInput accessibilityLabel="Potvrzovací název domácnosti" autoCapitalize="none" autoCorrect={false} editable={!resetBusy} onChangeText={setResetName} placeholder={householdName} placeholderTextColor={colors.mutedText} style={styles.profileInput} value={resetName} />
        {resetError ? <Text accessibilityRole="alert" style={styles.error}>{resetError}</Text> : null}
        <View style={styles.rowActions}><Pressable accessibilityRole="button" disabled={resetBusy} onPress={() => setResetOpen(false)} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Zrušit</Text></Pressable><Pressable accessibilityRole="button" disabled={resetBusy || resetGroups.length === 0 || !confirmsHouseholdName(resetName, householdName)} onPress={() => void confirmDataReset()} style={[styles.dangerAction, (resetBusy || resetGroups.length === 0 || !confirmsHouseholdName(resetName, householdName)) && styles.disabled]}><Text style={styles.dangerActionText}>{resetBusy ? 'Mažu…' : 'Smazat navždy'}</Text></Pressable></View>
      </View></ScrollView></View>
    </Modal>

    <Modal animationType="slide" onRequestClose={() => setEditingDietMember(null)} transparent visible={editingDietMember !== null}>
      <View style={styles.modalScrim}><ScrollView contentContainerStyle={styles.dietModalScroll} keyboardShouldPersistTaps="handled"><View style={styles.dietModal}>
        <View style={styles.sectionHeader}><View style={styles.preferenceDescription}><Text style={styles.sheetTitle}>Stravování: {editingDietMember?.name}</Text><Text style={styles.bodyText}>Recepty zohlední preference všech členů domácnosti.</Text></View><Pressable accessibilityLabel="Zavřít stravování" accessibilityRole="button" onPress={() => setEditingDietMember(null)} style={styles.closeButton}><X color={colors.foreground} size={20} /></Pressable></View>
        <Text style={styles.profileFieldLabel}>Jak se stravuje?</Text>{DIETS.map((option) => <Pressable key={option.key} accessibilityRole="radio" accessibilityState={{ checked: dietDraft.diet === option.key }} onPress={() => setDietDraft((current) => ({ ...current, diet: option.key }))} style={[styles.dietChoice, dietDraft.diet === option.key && styles.dietChoiceActive]}><View style={styles.preferenceDescription}><Text style={styles.cardTitle}>{option.label}</Text><Text style={styles.noteText}>{option.description}</Text></View><Text style={styles.dietCheck}>{dietDraft.diet === option.key ? '✓' : ''}</Text></Pressable>)}
        <Text style={styles.profileFieldLabel}>Čemu se vyhýbá?</Text><View style={styles.themeChoices}>{DIET_AVOIDS.map((option) => { const selected = dietDraft.avoids.includes(option.key); return <Pressable key={option.key} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => setDietDraft((current) => ({ ...current, avoids: selected ? current.avoids.filter((key) => key !== option.key) : [...current.avoids, option.key] }))} style={[styles.themeChoice, selected && styles.themeChoiceSelected]}><Text style={[styles.themeChoiceText, selected && styles.themeChoiceTextSelected]}>{option.label}</Text></Pressable> })}</View>
        {profileError ? <Text accessibilityRole="alert" style={styles.error}>{profileError}</Text> : null}<Pressable accessibilityRole="button" disabled={profileBusy} onPress={() => void saveMemberDiet()} style={[styles.profileSaveButton, profileBusy && styles.disabled]}><Text style={styles.profileSaveText}>{profileBusy ? 'Ukládám…' : 'Uložit stravování'}</Text></Pressable>
      </View></ScrollView></View>
    </Modal>
  </ScrollView>
}

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount) } catch { return `${amount.toLocaleString('cs-CZ')} ${currency}` }
}

function useStyles() {
  const { colors } = useMobileTheme()
  return useMemo(() => StyleSheet.create({
  screenContent: { padding: 16, paddingBottom: 24, gap: 12 },
  homeIntro: { paddingTop: 4, paddingBottom: 6 },
  dateText: { color: colors.secondaryText, fontSize: 13, textTransform: 'capitalize' },
  greeting: { color: colors.foreground, fontSize: 26, fontWeight: '700', marginTop: 4 },
  bodyText: { color: colors.secondaryText, fontSize: 13, lineHeight: 19 },
  loader: { marginVertical: 18 },
  dashboardCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 15 },
  attentionCard: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.warning, borderRadius: 15, backgroundColor: colors.card },
  attentionText: { flex: 1, color: colors.foreground, fontSize: 13, fontWeight: '600' },
  insightCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.accentSubtle, borderColor: colors.border, borderWidth: 1 },
  recommendations: { gap: 12 },
  recommendationsHeader: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.muted },
  recommendationsTitleWrap: { flex: 1, gap: 2 },
  recommendationsContent: { gap: 12 },
  restockRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border },
  restockActions: { alignItems: 'center', gap: 6 },
  iconAction: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.muted },
  restockAdd: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.accentSubtle },
  restockAddText: { color: colors.accentText, fontSize: 12, fontWeight: '700' },
  chartCard: { gap: 10, padding: 15, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 18 },
  mealCardHeading: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9 },
  mealCardLink: { marginLeft: 'auto', color: colors.accentText, fontSize: 12, fontWeight: '700' },
  mealRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.border },
  mealType: { width: 74, color: colors.mutedText, fontSize: 12 },
  mealName: { flex: 1, color: colors.foreground, fontSize: 13, fontWeight: '600' },
  mealDone: { color: colors.mutedText, textDecorationLine: 'line-through' },
  homeDealRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  homeDealPrice: { color: colors.foreground, fontSize: 13, fontWeight: '700' },
  dealPriceColumn: { alignItems: 'flex-end', gap: 1 },
  homeDealAdd: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.accentSubtle },
  homeDealAddText: { color: colors.accentText, fontSize: 22, lineHeight: 25, fontWeight: '600' },
  chartRow: { gap: 5 },
  chartLabelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  chartTrack: { height: 8, overflow: 'hidden', borderRadius: 8, backgroundColor: colors.muted },
  chartFill: { height: '100%', borderRadius: 8 },
  budgetTrack: { height: 9, overflow: 'hidden', borderRadius: 9, backgroundColor: colors.muted, marginTop: 4 },
  budgetFill: { height: '100%', borderRadius: 9, backgroundColor: colors.accent },
  budgetFillOver: { backgroundColor: colors.destructive },
  cardIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.muted, justifyContent: 'center', alignItems: 'center' },
  cardIconAccent: { backgroundColor: colors.accentSubtle },
  dashboardText: { flex: 1, minWidth: 0, gap: 2 },
  cardEyebrow: { color: colors.mutedText, fontSize: 10, fontWeight: '700', letterSpacing: 0.9 },
  dashboardValue: { color: colors.foreground, fontSize: 17, fontWeight: '700' },
  sectionHeading: { color: colors.foreground, fontSize: 18, fontWeight: '700', marginTop: 8 },
  quickActions: { flexDirection: 'row', gap: 8 },
  quickAction: { flex: 1, minHeight: 82, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 8 },
  quickActionLabel: { color: colors.foreground, fontSize: 12, fontWeight: '600' },
  tabBar: { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'space-around', paddingHorizontal: 6, paddingTop: 6, paddingBottom: 4, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 54, gap: 2 },
  tabIcon: { width: 48, height: 28, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tabIconActive: { backgroundColor: colors.accentSubtle },
  tabLabel: { color: colors.mutedText, fontSize: 10, fontWeight: '500' },
  tabLabelActive: { color: colors.foreground, fontWeight: '700' },
  modalScrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.navyOverlay },
  moreSheet: { backgroundColor: colors.background, borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingHorizontal: 20, paddingBottom: 26, paddingTop: 10 },
  notificationSheet: { alignSelf: 'center', width: '92%', maxHeight: '78%', backgroundColor: colors.background, borderRadius: 22, padding: 16, gap: 10 },
  notificationActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notificationList: { gap: 6 },
  notificationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 11, borderRadius: 14, backgroundColor: colors.card },
  notificationDot: { width: 8, height: 8, marginTop: 6, borderRadius: 4, backgroundColor: colors.mutedText },
  notificationDotUnread: { backgroundColor: colors.primary },
  sheetHandle: { width: 38, height: 4, alignSelf: 'center', backgroundColor: colors.mutedText, borderRadius: 4, marginBottom: 16 },
  sheetTitle: { color: colors.foreground, fontSize: 20, fontWeight: '700', marginBottom: 10 },
  moreItem: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  moreItemIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.accentSubtle },
  moreItemText: { flex: 1, color: colors.foreground, fontSize: 15, fontWeight: '600' },
  searchBox: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, backgroundColor: colors.card, borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 15 },
  searchInput: { flex: 1, color: colors.foreground, fontSize: 14, minHeight: 44 },
  chipRow: { gap: 8, paddingVertical: 2 },
  chip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 18, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.secondaryText, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: colors.primaryForeground },
  preferenceToggle: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  preferenceToggleActive: { borderColor: colors.accent, backgroundColor: colors.accentSubtle },
  preferenceToggleText: { color: colors.secondaryText, fontSize: 13, fontWeight: '600' },
  preferenceToggleTextActive: { color: colors.accentText },
  sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sortButtons: { flexDirection: 'row', gap: 6 },
  sortButton: { paddingHorizontal: 10, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.card },
  sortButtonActive: { backgroundColor: colors.accentSubtle },
  sortText: { color: colors.secondaryText, fontSize: 12 },
  sortTextActive: { color: colors.accentText, fontWeight: '700' },
  dealCard: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 15, gap: 12 },
  dealTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dealName: { color: colors.foreground, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  discountBadge: { overflow: 'hidden', color: colors.accentText, backgroundColor: colors.accentSubtle, fontSize: 12, fontWeight: '800', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  dealBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dealPrice: { color: colors.foreground, fontSize: 19, fontWeight: '800' },
  addDealButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.accentSubtle },
  addDealDone: { backgroundColor: colors.muted },
  addDealText: { color: colors.accentText, fontSize: 13, fontWeight: '700' },
  noteText: { color: colors.secondaryText, fontSize: 12, lineHeight: 18 },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  pageButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  pageText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  storeCard: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 17, padding: 12 },
  storeLogo: { width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 13, backgroundColor: '#ffffff' },
  storeLogoImage: { width: 38, height: 38 },
  storeLogoText: { color: '#172033', fontSize: 10, fontWeight: '800' },
  branchCard: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 12 },
  purchaseCard: { gap: 10, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 14 },
  purchaseStats: { gap: 8 },
  purchaseStat: { minHeight: 76, gap: 4, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  purchaseHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  purchasePendingRow: { gap: 6, paddingTop: 4 },
  purchaseLineText: { flex: 1, minWidth: 0 },
  purchaseAction: { minHeight: 38, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7, paddingHorizontal: 10, borderRadius: 11, backgroundColor: colors.accentSubtle },
  purchaseActionText: { color: colors.accentText, fontSize: 12, fontWeight: '700' },
  purchaseDeleteButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7 },
  purchaseDeleteText: { color: colors.destructive, fontSize: 13, fontWeight: '600' },
  purchaseShowAll: { minHeight: 42, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7, paddingHorizontal: 13, borderRadius: 15, backgroundColor: colors.accentSubtle },
  purchaseRepeatChip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 17, backgroundColor: colors.muted },
  iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.accentSubtle },
  manualModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.navyOverlay },
  manualModal: { maxHeight: '94%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 22, gap: 10 },
  manualFormContent: { gap: 8, paddingBottom: 12 },
  manualLineCard: { gap: 8, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  manualSmallInput: { flex: 1, minWidth: 0 },
  purchaseTotal: { color: colors.foreground, fontSize: 16, fontWeight: '800' },
  purchaseDivider: { height: 1, backgroundColor: colors.border },
  purchaseItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  purchaseItemName: { flex: 1, color: colors.foreground, fontSize: 13 },
  purchaseItemPrice: { color: colors.foreground, fontSize: 13, fontWeight: '600' },
  pendingPurchase: { color: colors.warning, fontSize: 12, lineHeight: 17 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 5 },
  emptyCard: { gap: 6, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  cardTitle: { color: colors.foreground, fontSize: 16, fontWeight: '700' },
  error: { color: colors.destructive, backgroundColor: colors.destructiveSubtle, borderRadius: 12, padding: 12, fontSize: 13, lineHeight: 19 },
  assistantScrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.navyOverlay },
  assistantSheet: { height: '88%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  assistantHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  assistantIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  assistantAvatar: { width: 42, height: 42, overflow: 'hidden', borderRadius: 21, backgroundColor: colors.accentSubtle },
  assistantMascot: { position: 'absolute', width: 58, height: 78, left: -8, top: -1 },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.muted },
  chatMessages: { flexGrow: 1, justifyContent: 'flex-end', gap: 10, paddingVertical: 16 },
  assistantBubble: { alignSelf: 'flex-start', maxWidth: '88%', padding: 13, gap: 8, borderRadius: 16, borderBottomLeftRadius: 5, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
  userBubble: { alignSelf: 'flex-end', maxWidth: '86%', padding: 13, borderRadius: 16, borderBottomRightRadius: 5, backgroundColor: colors.primary },
  chatText: { color: colors.foreground, fontSize: 14, lineHeight: 21 },
  userChatText: { color: colors.primaryForeground, fontSize: 14, lineHeight: 20 },
  chatLink: { paddingTop: 5 },
  chatLinkText: { color: colors.accentText, fontSize: 14, fontWeight: '700' },
  suggestionList: { gap: 8, paddingVertical: 10 },
  suggestion: { alignSelf: 'flex-start', borderColor: colors.border, borderWidth: 1, borderRadius: 18, backgroundColor: colors.card, paddingVertical: 9, paddingHorizontal: 13 },
  suggestionText: { color: colors.foreground, fontSize: 13, fontWeight: '500' },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 18, backgroundColor: colors.card },
  composerInput: { flex: 1, minHeight: 42, paddingHorizontal: 10, color: colors.foreground, fontSize: 14 },
  sendButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.primary },
  disabled: { opacity: 0.45 },
  footerNote: { color: colors.mutedText, fontSize: 11, textAlign: 'center', marginTop: 8 },
  profileCard: { alignItems: 'center', gap: 6, padding: 24, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 20 },
  profileSections: { gap: 8, paddingVertical: 2 },
  profileSectionButton: { minHeight: 39, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  profileSectionButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  profileSectionText: { color: colors.secondaryText, fontSize: 13, fontWeight: '600' },
  profileSectionTextActive: { color: colors.primaryForeground },
  profileAvatar: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 35, backgroundColor: colors.accentSubtle, marginBottom: 4 },
  profileInitials: { color: colors.accentText, fontSize: 23, fontWeight: '800' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberCard: { gap: 9, padding: 12, borderRadius: 15, backgroundColor: colors.muted },
  memberAvatar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.card },
  memberAvatarText: { color: colors.foreground, fontSize: 12, fontWeight: '700' },
  memberInfo: { flex: 1, minWidth: 0, gap: 2 },
  removeIconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.card },
  removeIconText: { color: colors.destructive, fontSize: 23, lineHeight: 27 },
  dietSummary: { color: colors.accentText, fontSize: 12, lineHeight: 17 },
  childNeeds: { color: colors.destructive, fontSize: 12, lineHeight: 17 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inlineAction: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 12, backgroundColor: colors.accentSubtle },
  inlineActionText: { color: colors.accentText, fontSize: 12, fontWeight: '700' },
  secondaryAction: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 12, backgroundColor: colors.card },
  secondaryActionText: { color: colors.accentText, fontSize: 12, fontWeight: '700' },
  profileSmallAction: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 11, backgroundColor: colors.accentSubtle },
  profileSmallActionText: { color: colors.accentText, fontSize: 12, fontWeight: '700' },
  formPanel: { gap: 9, padding: 12, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  pantrySettingRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, minHeight: 48, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.border },
  auditRow: { gap: 3, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border },
  pantrySubform: { width: '100%', gap: 8, paddingTop: 4, paddingBottom: 6 },
  hiddenLocation: { color: colors.mutedText, textDecorationLine: 'line-through' },
  dangerAction: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.destructiveSubtle },
  dangerActionText: { color: colors.destructive, fontSize: 12, fontWeight: '700' },
  rowFields: { flexDirection: 'row', gap: 9 },
  flexInput: { flex: 1, minWidth: 0 },
  checkinInput: { width: 58, minHeight: 40, textAlign: 'center', borderRadius: 11, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.elevated, color: colors.foreground, paddingHorizontal: 5, fontSize: 14 },
  pantryCheckinGroup: { gap: 6 },
  branchPicker: { gap: 8, padding: 10, borderRadius: 14, backgroundColor: colors.muted },
  branchChoice: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  resetChoice: { minHeight: 48, flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  branchCheckbox: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.card },
  branchCheckboxSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  branchCheckmark: { color: colors.primaryForeground, fontSize: 14, fontWeight: '800' },
  distanceInput: { width: 110 },
  flexText: { flex: 1 },
  dietModalScroll: { flexGrow: 1, justifyContent: 'flex-end' },
  dietModal: { gap: 10, maxHeight: '90%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 28 },
  dietChoice: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  dietChoiceActive: { borderColor: colors.accent, backgroundColor: colors.accentSubtle },
  dietCheck: { width: 25, color: colors.accentText, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  profileName: { color: colors.foreground, fontSize: 20, fontWeight: '700' },
  preferenceCard: { gap: 8, padding: 16, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 18 },
  profileFieldLabel: { color: colors.secondaryText, fontSize: 12, fontWeight: '600', marginTop: 6 },
  profileInput: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.elevated, color: colors.foreground, paddingHorizontal: 12, fontSize: 14 },
  profileSaveButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.primary, marginTop: 4 },
  profileSaveText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '700' },
  success: { color: colors.accentText, fontSize: 13 },
  signOutButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.destructive, borderRadius: 14, backgroundColor: colors.destructiveSubtle, marginTop: 4 },
  signOutText: { color: colors.destructive, fontSize: 14, fontWeight: '700' },
  accountDeleteButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.destructive, borderRadius: 14, marginTop: 4 },
  accountDeleteText: { color: colors.destructive, fontSize: 14, fontWeight: '700' },
  accountDeleteConfirm: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 13, backgroundColor: colors.destructive },
  accountDeleteConfirmText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  themeChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  themeChoice: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  themeChoiceSelected: { backgroundColor: colors.accentSubtle, borderColor: colors.accent },
  themeChoiceText: { color: colors.secondaryText, fontSize: 13, fontWeight: '600' },
  themeChoiceTextSelected: { color: colors.accentText },
  preferenceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopColor: colors.border, borderTopWidth: 1 },
  devicePushCard: { gap: 9, marginTop: 6, padding: 12, borderRadius: 14, backgroundColor: colors.muted },
  pushTestButton: { minHeight: 36, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 11, backgroundColor: colors.accentSubtle },
  preferenceDescription: { flex: 1, gap: 3 },
}), [colors])
}
