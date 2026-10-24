import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { Check, MapPin, Pin, Search, Star, X } from 'lucide-react-native'
import { alternativeLabel, alternativesToShow, planInsights } from '../../../lib/shopping-plan-format'
import { hitPrice, hitUnitPrice, type ProductSearchHit } from '../../../lib/product-search'
import { shortDate } from '../../../lib/format'
import { MAX_SHOP_STORES } from '../../../lib/nearby-stores'
import { createOfflineItemId } from '../lib/offline-shopping-list'
import { addShoppingItem, buildShoppingPlan, getShoppingPlanPins, getStorePreferences, pinShoppingProduct, searchProducts, unpinShoppingProduct, type MobileShoppingItem } from '../lib/shopping-list-api'
import { useMobileTheme } from '../lib/theme'

type PlanResult = import('../../../lib/db/shopping-plan').PlanResult
type PinRecord = import('../../../lib/db/shopping-plan').PinRecord
type Tab = 'plan' | 'products'

function money(amount: number | null | undefined) {
  if (amount == null || !Number.isFinite(amount)) return 'Cena není dostupná'
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 2 }).format(amount)
}

function useStyles() {
  const { colors } = useMobileTheme()
  return useMemo(() => StyleSheet.create({
    scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)' },
    sheet: { height: '92%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, overflow: 'hidden' },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 3, backgroundColor: colors.border, marginBottom: 10 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 12 },
    title: { color: colors.foreground, fontSize: 20, fontWeight: '800' },
    close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.muted },
    tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
    tab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    tabActive: { borderColor: colors.primary, backgroundColor: colors.accentSubtle },
    tabText: { color: colors.secondaryText, fontWeight: '700', fontSize: 13 },
    tabTextActive: { color: colors.accentText },
    content: { padding: 16, paddingBottom: 34, gap: 12 },
    card: { padding: 14, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 10 },
    heading: { color: colors.foreground, fontSize: 16, fontWeight: '800' },
    body: { color: colors.secondaryText, fontSize: 13, lineHeight: 19 },
    note: { color: colors.mutedText, fontSize: 12, lineHeight: 17 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    flex: { flex: 1 },
    fieldLabel: { color: colors.secondaryText, fontSize: 12, fontWeight: '700' },
    input: { minHeight: 43, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.inputBorder, color: colors.foreground, backgroundColor: colors.elevated },
    selectRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
    chip: { minHeight: 37, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.elevated },
    chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSubtle },
    chipText: { color: colors.secondaryText, fontSize: 12, fontWeight: '700' },
    chipTextActive: { color: colors.accentText },
    primary: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, borderRadius: 13, backgroundColor: colors.primary },
    primaryText: { color: colors.primaryForeground, fontSize: 13, fontWeight: '800' },
    disabled: { opacity: 0.5 },
    banner: { padding: 11, borderRadius: 12, backgroundColor: colors.accentSubtle },
    bannerText: { color: colors.accentText, fontSize: 12, fontWeight: '700' },
    error: { color: colors.destructive, fontSize: 13 },
    store: { padding: 12, borderRadius: 14, backgroundColor: colors.muted, gap: 8 },
    storeTitle: { color: colors.foreground, fontSize: 14, fontWeight: '800' },
    item: { padding: 10, borderRadius: 11, backgroundColor: colors.card, gap: 4 },
    itemName: { color: colors.foreground, fontSize: 13, fontWeight: '700' },
    itemMeta: { color: colors.secondaryText, fontSize: 11, lineHeight: 16 },
    productGroup: { gap: 7 },
    product: { padding: 11, borderRadius: 12, backgroundColor: colors.muted, gap: 5 },
    productPrice: { color: colors.foreground, fontSize: 13, fontWeight: '800' },
    productMeta: { color: colors.secondaryText, fontSize: 11, lineHeight: 16 },
    productAction: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 35, marginTop: 3, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.card },
    productActionText: { color: colors.accentText, fontSize: 11, fontWeight: '700' },
    summary: { color: colors.foreground, fontSize: 14, fontWeight: '800' },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
    center: { alignItems: 'center', padding: 20, gap: 9 },
  }), [colors])
}

export function ShoppingToolsModal({ visible, items, onClose, onProductAdded, onAuthExpired }: {
  visible: boolean
  items: MobileShoppingItem[]
  onClose: () => void
  onProductAdded: (item: MobileShoppingItem) => Promise<void>
  onAuthExpired: () => void
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [tab, setTab] = useState<Tab>('plan')
  const [pins, setPins] = useState<PinRecord[]>([])
  const [preferences, setPreferences] = useState<{ maxShopStores: number | null; priorityChainIds: string[]; chains: { id: string; chain: string }[] } | null>(null)
  const [pinsLoading, setPinsLoading] = useState(false)
  const [maxStores, setMaxStores] = useState(2)
  const [priorityIds, setPriorityIds] = useState<string[]>([])
  const [planResult, setPlanResult] = useState<PlanResult | null>(null)
  const [builtFor, setBuiltFor] = useState('')
  const [planBusy, setPlanBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [targetItemId, setTargetItemId] = useState<string | null>(null)
  const [onlyNearby, setOnlyNearby] = useState(true)
  const [hasNearby, setHasNearby] = useState(false)
  const [searchGroups, setSearchGroups] = useState<import('../../../lib/product-search').ProductSearchGroup[]>([])
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const openItems = items.filter((item) => !item.done)
  const inputKey = JSON.stringify({ items: openItems.map(({ id, name, quantity, unit, productId, category, productTypes }) => [id, name, quantity, unit, productId, category, productTypes]), pins: pins.filter((pin) => openItems.some((item) => item.id === pin.itemId)).map(({ itemId, storeId, productId }) => [itemId, storeId, productId]).sort() })
  const planKey = JSON.stringify({ inputKey, maxStores, priorityIds: [...priorityIds].sort() })
  const stale = Boolean(planResult && builtFor !== planKey)
  const targetItem = targetItemId ? openItems.find((item) => item.id === targetItemId) ?? null : null

  useEffect(() => {
    if (targetItemId && !targetItem) setTargetItemId(null)
  }, [targetItemId, targetItem])

  useEffect(() => {
    if (!visible) return
    let active = true
    setPinsLoading(true)
    setError(null)
    Promise.all([getShoppingPlanPins(), getStorePreferences()]).then(([pinsData, storeData]) => {
      if (!active) return
      setPins(pinsData.pins)
      setPreferences({ maxShopStores: storeData.selection.maxShopStores, priorityChainIds: storeData.selection.priorityChainIds, chains: storeData.chains })
      setMaxStores(storeData.selection.maxShopStores ?? 2)
      setPriorityIds(storeData.selection.priorityChainIds)
    }).catch((caught: unknown) => {
      if (!active) return
      setError(caught instanceof Error ? caught.message : 'Nastavení plánovače se nepodařilo načíst.')
      if ((caught as { status?: number })?.status === 401) onAuthExpired()
    }).finally(() => { if (active) setPinsLoading(false) })
    return () => { active = false }
  }, [visible, onAuthExpired])

  useEffect(() => {
    if (!visible || tab !== 'products') return
    const trimmed = query.trim()
    if (trimmed.length < 2) { setSearchGroups([]); setSearchBusy(false); setSearchError(null); return }
    let active = true
    setSearchBusy(true)
    const timer = setTimeout(() => {
      searchProducts({ query: trimmed, onlyNearby, ...(targetItem?.category ? { category: targetItem.category } : {}) }).then((result) => {
        if (!active) return
        setSearchGroups(result.groups)
        setHasNearby(result.hasNearbySelection)
        setSearchError(null)
      }).catch((caught: unknown) => {
        if (!active) return
        setSearchError(caught instanceof Error ? caught.message : 'Hledání produktů se nepodařilo.')
        if ((caught as { status?: number })?.status === 401) onAuthExpired()
      }).finally(() => { if (active) setSearchBusy(false) })
    }, 300)
    return () => { active = false; clearTimeout(timer) }
  }, [visible, tab, query, onlyNearby, targetItem?.id, targetItem?.category, onAuthExpired])

  async function runPlan() {
    setPlanBusy(true); setError(null)
    try {
      const result = await buildShoppingPlan({ maxStores, priorityChainIds: priorityIds })
      setPlanResult(result)
      setBuiltFor(planKey)
      setPreferences((current) => current ? { ...current, chains: result.allowedChains } : current)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Plán nákupu se nepodařilo sestavit.')
      if ((caught as { status?: number })?.status === 401) onAuthExpired()
    } finally { setPlanBusy(false) }
  }

  function togglePriority(id: string) {
    const next = priorityIds.includes(id) ? priorityIds.filter((value) => value !== id) : [...priorityIds, id]
    setPriorityIds(next)
  }

  async function togglePin(itemId: string, storeId: string, productId: string) {
    const key = `${itemId}|${storeId}|${productId}`
    setActionBusy(key); setError(null)
    try {
      const current = pins.find((pin) => pin.itemId === itemId && pin.storeId === storeId)
      if (current?.productId === productId) {
        await unpinShoppingProduct({ itemId, storeId })
        setPins((rows) => rows.filter((pin) => !(pin.itemId === itemId && pin.storeId === storeId)))
      } else {
        await pinShoppingProduct({ itemId, storeId, productId })
        setPins((rows) => [...rows.filter((pin) => !(pin.itemId === itemId && pin.storeId === storeId)), { itemId, storeId, productId }])
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Výběr produktu se nepodařilo uložit.')
      if ((caught as { status?: number })?.status === 401) onAuthExpired()
    } finally { setActionBusy(null) }
  }

  async function addProduct(hit: ProductSearchHit) {
    const key = `${hit.storeId}|${hit.productId}`
    setActionBusy(key); setError(null)
    try {
      const added = await addShoppingItem(hit.name, createOfflineItemId().slice('offline-'.length), 1, hit.unit ?? 'ks', { category: hit.category, selection: { kind: 'product', productId: hit.productId } })
      await onProductAdded(added.item)
      try {
        await pinShoppingProduct({ itemId: added.item.id, storeId: hit.storeId, productId: hit.productId })
        setPins((rows) => [...rows.filter((pin) => !(pin.itemId === added.item.id && pin.storeId === hit.storeId)), { itemId: added.item.id, storeId: hit.storeId, productId: hit.productId }])
      } catch (pinError) {
        setError(pinError instanceof Error ? `Položka je na seznamu, ale výběr pro ${hit.chain} se nepodařilo uložit.` : 'Položka je na seznamu, výběr produktu se nepodařilo uložit.')
        if ((pinError as { status?: number })?.status === 401) onAuthExpired()
        return
      }
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Produkt se nepodařilo přidat.')
      if ((caught as { status?: number })?.status === 401) onAuthExpired()
    } finally { setActionBusy(null) }
  }

  return <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
    <View style={styles.scrim}>
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}><Text style={styles.title}>Nákupní nástroje</Text><Pressable accessibilityLabel="Zavřít nákupní nástroje" accessibilityRole="button" onPress={onClose} style={styles.close}><X color={colors.foreground} size={20} /></Pressable></View>
        <View style={styles.tabs}>
          {([['plan', 'Plán nákupu'], ['products', 'Najít produkt']] as [Tab, string][]).map(([key, label]) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabActive]}><Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text></Pressable>)}
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {tab === 'plan' ? <>
            <View style={styles.card}>
              <Text style={styles.heading}>Kde nakoupit celý seznam</Text>
              <Text style={styles.body}>Rozdělí položky mezi obchody podle ceny, limitu návštěv a vašich priorit.</Text>
              <Text style={styles.fieldLabel}>Kolik obchodů projít</Text>
              <View style={styles.selectRow}>{Array.from({ length: MAX_SHOP_STORES }, (_, index) => index + 1).map((count) => <Pressable key={count} accessibilityRole="radio" accessibilityState={{ checked: maxStores === count }} onPress={() => setMaxStores(count)} style={[styles.chip, maxStores === count && styles.chipActive]}><Text style={[styles.chipText, maxStores === count && styles.chipTextActive]}>{count}</Text></Pressable>)}</View>
              {(preferences?.chains.length ?? 0) > 0 ? <>
                <Text style={styles.fieldLabel}>Upřednostnit obchody</Text>
                <View style={styles.selectRow}>{preferences!.chains.map((chain) => { const selected = priorityIds.includes(chain.id); return <Pressable key={chain.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => void togglePriority(chain.id)} style={[styles.chip, selected && styles.chipActive]}><Text style={[styles.chipText, selected && styles.chipTextActive]}>{selected ? '★ ' : ''}{chain.chain}</Text></Pressable> })}</View>
                <Text style={styles.note}>Počty a priority se berou z vašeho nastavení obchodů. Plán používá vaše obchody v okolí; bez výběru zahrne všechny řetězce.</Text>
              </> : null}
              <Pressable accessibilityRole="button" disabled={planBusy || pinsLoading || openItems.length === 0} onPress={() => void runPlan()} style={[styles.primary, (planBusy || pinsLoading || openItems.length === 0) && styles.disabled]}><Text style={styles.primaryText}>{planBusy ? 'Počítám plán…' : planResult ? 'Sestavit znovu' : 'Sestavit plán'}</Text></Pressable>
              {openItems.length === 0 ? <Text style={styles.note}>Na seznamu nejsou žádné otevřené položky.</Text> : null}
            </View>
            {stale ? <View style={styles.banner}><Text style={styles.bannerText}>Seznam nebo výběr produktů se změnil. Sestavte plán znovu.</Text></View> : null}
            {planResult ? <>
              <View style={styles.card}>
                <Text style={styles.summary}>Plánovaný nákup: {money(planResult.plan.total)}</Text>
                <Text style={styles.body}>{planResult.plan.plannedCount} z {planResult.plan.needCount} položek · {planResult.plan.stores.length} obchodů</Text>
                {planInsights(planResult.plan).map((insight) => <Text key={insight} style={styles.note}>• {insight}</Text>)}
                {planResult.plan.stores.map((store) => <View key={store.storeId} style={styles.store}>
                  <View style={styles.row}><Text style={[styles.storeTitle, styles.flex]}>{store.chain}{store.isPriority ? ' ★' : ''}</Text><Text style={styles.storeTitle}>{money(store.subtotal)}</Text></View>
                  {store.lines.map((line) => <View key={line.needId} style={styles.item}><Text style={styles.itemName}>{line.name}</Text><Text style={styles.itemMeta}>Potřeba {line.quantity} {line.unit} · {line.productName}{line.source === 'pinned' ? ' · vybráno vámi' : ''}</Text><Text style={styles.itemMeta}>{money(line.cost)}{planResult.packageSizes[`${line.needId}|${line.storeId}`] ? ` · ${planResult.packageCounts[`${line.needId}|${line.storeId}`] ?? 1}× balení ${planResult.packageSizes[`${line.needId}|${line.storeId}`]!.value} ${planResult.packageSizes[`${line.needId}|${line.storeId}`]!.unit}` : ''}</Text>
                    {alternativesToShow(line).map((alt) => <Text key={alt.storeId} style={styles.note}>{alternativeLabel(alt)}</Text>)}
                    {line.source !== 'pinned' ? <Pressable accessibilityRole="button" onPress={() => { setTab('products'); setTargetItemId(line.needId); setQuery(line.name) }} style={styles.productAction}><Search color={colors.accentText} size={14} /><Text style={styles.productActionText}>Najít a vybrat produkt</Text></Pressable> : null}
                  </View>)}
                </View>)}
                {planResult.plan.unplanned.map((need) => <View key={need.needId} style={styles.banner}><Text style={styles.bannerText}>{need.name} nebylo možné zahrnout do plánu. Zkuste najít konkrétní produkt v obchodech.</Text></View>)}
                {planResult.plan.notes.map((note) => <Text key={note} style={styles.note}>{note}</Text>)}
              </View>
              {planResult.singleStoreTotals.length > 0 ? <View style={styles.card}><View style={styles.row}><MapPin color={colors.primary} size={19} /><Text style={styles.heading}>Celý košík v jednom obchodě</Text></View><Text style={styles.note}>Odhad celého seznamu v prioritních řetězcích, včetně odhadu chybějících cen.</Text>{planResult.singleStoreTotals.filter((store) => priorityIds.includes(store.storeId)).map((store) => <View key={store.storeId} style={styles.row}><View style={styles.flex}><Text style={styles.itemName}>{store.chain}</Text><Text style={styles.note}>{store.itemsPriced} cen · {store.itemsEstimated} odhadů</Text></View><Text style={styles.storeTitle}>{money(store.total)}</Text></View>)}</View> : null}
            </> : null}
          </> : <>
            <View style={styles.card}>
              <Text style={styles.heading}>{targetItem ? `Vybrat produkt pro: ${targetItem.name}` : 'Najít produkt v obchodech'}</Text>
              <Text style={styles.body}>{targetItem ? 'Vyberte konkrétní produkt pro tento řetězec. Plán pak použije právě tento produkt.' : 'Katalogové produkty můžete přidat přímo na seznam a vybrat pro obchod, kde je koupíte.'}</Text>
              <Text style={styles.fieldLabel}>Co s nalezeným produktem</Text>
              <View style={styles.selectRow}>
                <Pressable accessibilityRole="radio" accessibilityState={{ checked: targetItemId === null }} onPress={() => setTargetItemId(null)} style={[styles.chip, targetItemId === null && styles.chipActive]}><Text style={[styles.chipText, targetItemId === null && styles.chipTextActive]}>Přidat jako novou položku</Text></Pressable>
                {openItems.map((item) => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: targetItemId === item.id }} onPress={() => setTargetItemId(item.id)} style={[styles.chip, targetItemId === item.id && styles.chipActive]}><Text numberOfLines={1} style={[styles.chipText, targetItemId === item.id && styles.chipTextActive]}>{item.name}</Text></Pressable>)}
              </View>
              <View style={styles.row}><Search color={colors.mutedText} size={18} /><TextInput accessibilityLabel="Hledat produkt v obchodech" autoCapitalize="none" maxLength={80} onChangeText={setQuery} placeholder="Např. mléko nebo máslo 250 g" placeholderTextColor={colors.mutedText} style={[styles.input, styles.flex]} value={query} /></View>
              {hasNearby ? <View style={styles.row}><Text style={[styles.body, styles.flex]}>Jen mé obchody v okolí</Text><Switch value={onlyNearby} onValueChange={setOnlyNearby} trackColor={{ false: colors.border, true: colors.accent }} thumbColor={colors.card} /></View> : null}
              {searchBusy ? <ActivityIndicator color={colors.primary} /> : null}
              {searchError ? <Text accessibilityRole="alert" style={styles.error}>{searchError}</Text> : null}
              {query.trim().length < 2 ? <Text style={styles.note}>Zadejte alespoň dvě písmena. Výsledky obsahují cenu, akci i jednotkovou cenu, pokud jsou dostupné.</Text> : null}
              {!searchBusy && query.trim().length >= 2 && !searchError && searchGroups.length === 0 ? <Text style={styles.note}>Nic jsme nenašli. Zkuste jiné slovo nebo rozšiřte hledání mimo své obchody.</Text> : null}
              {searchGroups.map((group) => <View key={group.storeId} style={styles.productGroup}><View style={styles.row}><Text style={[styles.storeTitle, styles.flex]}>{group.chain}</Text><Text style={styles.note}>{group.totalMatches} výsledků</Text></View>{group.hits.map((hit) => {
                const pinned = targetItem ? pins.some((pin) => pin.itemId === targetItem.id && pin.storeId === hit.storeId && pin.productId === hit.productId) : false
                const key = targetItem ? `${targetItem.id}|${hit.storeId}|${hit.productId}` : `${hit.storeId}|${hit.productId}`
                const busy = actionBusy === key
                return <View key={hit.productId} style={styles.product}><Text style={styles.itemName}>{hit.name}</Text><Text style={styles.productPrice}>{money(hitPrice(hit))}{hit.dealPrice != null ? ' · akce' : ''}</Text><Text style={styles.productMeta}>{hitUnitPrice(hit) != null && hit.unit ? `${money(hitUnitPrice(hit))}/${hit.unit} · ` : ''}{hit.observedAt ? `Cena z ${shortDate(hit.observedAt)}` : 'Cena z aktuální nabídky'}</Text>
                  <Pressable accessibilityRole="button" accessibilityState={targetItem ? { selected: pinned } : undefined} disabled={busy} onPress={() => targetItem ? void togglePin(targetItem.id, hit.storeId, hit.productId) : void addProduct(hit)} style={[styles.productAction, busy && styles.disabled]}>
                    {targetItem ? <Pin color={colors.accentText} size={14} /> : pinned ? <Check color={colors.accentText} size={14} /> : <Star color={colors.accentText} size={14} />}
                    <Text style={styles.productActionText}>{busy ? 'Ukládám…' : targetItem ? pinned ? `Vybráno pro ${group.chain} · zrušit` : `Vybrat pro tuto položku v ${group.chain}` : `Přidat na seznam · ${group.chain}`}</Text>
                  </Pressable>
                </View>
              })}</View>)}
            </View>
          </>}
        </ScrollView>
      </View>
    </View>
  </Modal>
}
