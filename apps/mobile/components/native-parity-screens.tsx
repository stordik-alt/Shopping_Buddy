import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { ArrowRight, Bell, CookingPot, House, MapPin, MoreHorizontal, Package, Search, ShoppingCart, Store, Tag, Users, WalletCards, X } from 'lucide-react-native'
import { useMobileTheme, type ThemePreference } from '../lib/theme'
import { dismissNotification, getBudgetSummary, getDealsPage, getNotificationPreferences, getNotifications, getPantry, getPurchaseHistory, getShoppingList, getStoreBranches, getStoreChains, MobileApiError, updateHouseholdProfile, updateNotificationPreference, type MobileBranchPage, type MobileChainTile, type MobileDealCategory, type MobileDealsPage, type MobileDealSort, type MobileNotification, type MobileNotificationPreference, type MobilePurchase } from '../lib/shopping-list-api'
import type { MobileBudgetSummary, MobilePantryState } from '../lib/shopping-list-api'

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

export function NativeHomeScreen({ name, onSelect }: { name: string; onSelect: (tab: NativeTab) => void }) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [shopping, setShopping] = useState<{ remaining: number; completed: number } | null>(null)
  const [budget, setBudget] = useState<MobileBudgetSummary | null>(null)
  const [pantry, setPantry] = useState<MobilePantryState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([getShoppingList(), getBudgetSummary(), getPantry()]).then((results) => {
      if (cancelled) return
      if (results[0].status === 'fulfilled') {
        const items = results[0].value.items
        const remaining = items.filter((item) => !item.done).length
        setShopping({ remaining, completed: items.length - remaining })
      }
      if (results[1].status === 'fulfilled') setBudget(results[1].value)
      if (results[2].status === 'fulfilled') setPantry(results[2].value)
      if (results.every((result) => result.status === 'rejected')) setError('Přehled se nepodařilo načíst. Zkuste obnovit připojení.')
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const today = new Date().toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <ScrollView contentContainerStyle={styles.screenContent}>
      <View style={styles.homeIntro}>
        <Text style={styles.dateText}>{today}</Text>
        <Text style={styles.greeting}>Ahoj, {name.split(' ')[0] || 'vítáme vás'}</Text>
        <Text style={styles.bodyText}>Tady je přehled vaší domácnosti.</Text>
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.primary} size="large" style={styles.loader} /> : null}
      <Pressable onPress={() => onSelect('shopping')} style={styles.dashboardCard}>
        <View style={styles.cardIcon}><ShoppingCart color={colors.primary} size={21} /></View>
        <View style={styles.dashboardText}>
          <Text style={styles.cardEyebrow}>NÁKUPNÍ SEZNAM</Text>
          <Text style={styles.dashboardValue}>{shopping ? `${shopping.remaining} k nákupu` : 'Otevřít seznam'}</Text>
          {shopping ? <Text style={styles.bodyText}>{shopping.completed} položek hotovo</Text> : null}
        </View>
        <ArrowRight color={colors.mutedText} size={20} />
      </Pressable>
      <Pressable onPress={() => onSelect('budget')} style={styles.dashboardCard}>
        <View style={[styles.cardIcon, styles.cardIconAccent]}><WalletCards color={colors.accentText} size={21} /></View>
        <View style={styles.dashboardText}>
          <Text style={styles.cardEyebrow}>ROZPOČET DOMÁCNOSTI</Text>
          <Text style={styles.dashboardValue}>{budget ? `Zbývá ${money(Math.max(0, budget.remaining), budget.currency)}` : 'Zobrazit rozpočet'}</Text>
          {budget ? <Text style={styles.bodyText}>Utraceno {money(budget.spent, budget.currency)} z {money(budget.budget, budget.currency)}</Text> : null}
        </View>
        <ArrowRight color={colors.mutedText} size={20} />
      </Pressable>
      {budget?.categories.length ? <View style={styles.chartCard}>
        <Text style={styles.cardTitle}>Výdaje podle kategorií</Text>
        {budget.categories.slice().sort((a, b) => b.total - a.total).slice(0, 4).map((category, index) => (
          <View key={category.category} style={styles.chartRow}>
            <View style={styles.chartLabelRow}><Text style={styles.bodyText}>{category.category}</Text><Text style={styles.bodyText}>{money(category.total, budget.currency)}</Text></View>
            <View style={styles.chartTrack}><View style={[styles.chartFill, { backgroundColor: chartColors[index % chartColors.length], width: `${budget.spent > 0 ? Math.min(100, category.total / budget.spent * 100) : 0}%` }]} /></View>
          </View>
        ))}
      </View> : null}
      {Boolean(pantry?.items.length) && (
        <Pressable onPress={() => onSelect('pantry')} style={styles.dashboardCard}>
          <View style={styles.cardIcon}><Package color={colors.primary} size={21} /></View>
          <View style={styles.dashboardText}>
            <Text style={styles.cardEyebrow}>DOMÁCÍ ZÁSOBY</Text>
            <Text style={styles.dashboardValue}>{pantry?.items.length} uložených položek</Text>
            <Text style={styles.bodyText}>Otevřít zásoby a zkontrolovat stav</Text>
          </View>
          <ArrowRight color={colors.mutedText} size={20} />
        </Pressable>
      )}
      <Text style={styles.sectionHeading}>Rychlý přístup</Text>
      <View style={styles.quickActions}>
        {moreItems.slice(0, 3).map(({ key, label, Icon }) => (
          <Pressable key={key} onPress={() => onSelect(key)} style={styles.quickAction}>
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
      <View style={styles.storeIcon}><Store color={colors.primary} size={21} /></View><View style={styles.dashboardText}><Text style={styles.cardTitle}>{chain.chain}</Text><Text style={styles.bodyText}>{chain.branchCount} prodejen · {chain.dealsCount} dnešních akcí</Text></View><ArrowRight color={colors.mutedText} size={19} />
    </Pressable>) : <>
      <Text style={styles.sectionHeading}>{selected.chain} · {branches?.total ?? 0} prodejen</Text>
      {branches?.rows.map((branch) => <View key={branch.id} style={styles.branchCard}><Text style={styles.cardTitle}>{branch.name}</Text><Text style={styles.bodyText}>{branch.address}, {branch.city}</Text>{branch.hours ? <Text style={styles.noteText}>{branch.hours}</Text> : null}</View>)}
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

export function NativeNotificationsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [notifications, setNotifications] = useState<MobileNotification[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setLoading(true); setError(null)
    getNotifications().then(({ notifications: rows }) => { if (!cancelled) setNotifications(rows) }).catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Upozornění se nepodařilo načíst.') }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [visible])
  async function dismiss(id?: string) {
    const before = notifications
    setNotifications(id ? before.filter((notification) => notification.id !== id) : [])
    try { await dismissNotification(id) } catch (caught) { setNotifications(before); setError(caught instanceof Error ? caught.message : 'Upozornění se nepodařilo aktualizovat.') }
  }
  return <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
    <Pressable onPress={onClose} style={styles.modalScrim}>
      <Pressable onPress={(event) => event.stopPropagation()} style={styles.notificationSheet}>
        <View style={styles.assistantHeader}><View><Text style={styles.cardTitle}>Upozornění</Text><Text style={styles.noteText}>{notifications.length ? `${notifications.length} nepřečtených` : 'Vše přečteno'}</Text></View><View style={styles.notificationActions}>{notifications.length > 0 ? <Pressable onPress={() => void dismiss()}><Text style={styles.chatLinkText}>Označit vše</Text></Pressable> : null}<Pressable accessibilityLabel="Zavřít upozornění" onPress={onClose} style={styles.closeButton}><X color={colors.secondaryText} size={20} /></Pressable></View></View>
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

export function NativePurchasesScreen() {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [purchases, setPurchases] = useState<MobilePurchase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    getPurchaseHistory().then(({ purchases: rows }) => { if (!cancelled) setPurchases(rows) }).catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Historii nákupů se nepodařilo načíst.') }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])
  return <ScrollView contentContainerStyle={styles.screenContent}>
    <Text style={styles.bodyText}>Historie skutečně zaznamenaných nákupů domácnosti.</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
    {purchases.map((purchase) => <View key={purchase.id} style={styles.purchaseCard}>
      <View style={styles.dealTop}><View style={styles.dashboardText}><Text style={styles.cardTitle}>{purchase.store || 'Nákup'}</Text><Text style={styles.bodyText}>{new Date(`${purchase.date}T12:00:00`).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}</Text></View><Text style={styles.purchaseTotal}>{money(purchase.total, 'CZK')}</Text></View>
      <View style={styles.purchaseDivider} />
      {purchase.items.slice(0, 5).map((item) => <View key={item.id} style={styles.purchaseItem}><Text numberOfLines={1} style={styles.purchaseItemName}>{item.name}</Text><Text style={styles.bodyText}>{item.quantity} {item.unit}</Text><Text style={styles.purchaseItemPrice}>{money(item.price, 'CZK')}</Text></View>)}
      {purchase.items.length > 5 ? <Text style={styles.noteText}>a dalších {purchase.items.length - 5} položek</Text> : null}
      {purchase.needsBudgetRecording ? <Text style={styles.pendingPurchase}>Tento nákup ještě není započítaný do rozpočtu.</Text> : null}
    </View>)}
    {!loading && purchases.length === 0 ? <View style={styles.emptyCard}><Text style={styles.cardTitle}>Zatím žádné nákupy</Text><Text style={styles.bodyText}>Importujte účtenku a nákup se objeví v historii.</Text></View> : null}
  </ScrollView>
}

export function NativeProfileScreen({ name, email, householdRole, householdName, householdBudget, householdCurrency, onUpdateHousehold, onAuthExpired, onSignOut }: {
  name: string
  email: string
  householdRole: string
  householdName: string
  householdBudget: number
  householdCurrency: string
  onUpdateHousehold: (changes: { name: string; monthlyBudget: number }) => void
  onAuthExpired: () => void
  onSignOut: () => void
}) {
  const { colors, preference, setPreference } = useMobileTheme()
  const styles = useStyles()
  const [nameDraft, setNameDraft] = useState(householdName)
  const [budgetDraft, setBudgetDraft] = useState(String(householdBudget).replace('.', ','))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preferences, setPreferences] = useState<MobileNotificationPreference[]>([])
  const [preferencesError, setPreferencesError] = useState<string | null>(null)
  useEffect(() => {
    setNameDraft(householdName)
    setBudgetDraft(String(householdBudget).replace('.', ','))
  }, [householdName, householdBudget])

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

  return <ScrollView contentContainerStyle={styles.screenContent}>
    <View style={styles.profileCard}><View style={styles.profileAvatar}><Text style={styles.profileInitials}>{name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</Text></View><Text style={styles.profileName}>{name}</Text><Text style={styles.bodyText}>{email}</Text></View>
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
    <View style={styles.preferenceCard}>
      <Text style={styles.cardEyebrow}>VZHLED APLIKACE</Text>
      <Text style={styles.bodyText}>Téma</Text>
      <View style={styles.themeChoices}>{([['system', 'Podle systému'], ['light', 'Světlé'], ['dark', 'Tmavé']] as [ThemePreference, string][]).map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: preference === value }} onPress={() => setPreference(value)} style={[styles.themeChoice, preference === value && styles.themeChoiceSelected]}><Text style={[styles.themeChoiceText, preference === value && styles.themeChoiceTextSelected]}>{label}</Text></Pressable>)}</View>
    </View>
    <View style={styles.preferenceCard}>
      <Text style={styles.cardEyebrow}>UPOZORNĚNÍ</Text>
      <Text style={styles.bodyText}>Nastavení platí jen pro váš účet.</Text>
      {preferencesError ? <Text accessibilityRole="alert" style={styles.error}>{preferencesError}</Text> : null}
      {preferences.map((item) => <View key={item.key} style={styles.preferenceRow}><View style={styles.preferenceDescription}><Text style={styles.cardTitle}>{item.label}</Text><Text style={styles.noteText}>{item.description}</Text></View><Switch accessibilityLabel={item.label} value={item.enabled} onValueChange={(enabled) => void togglePreference(item.key, enabled)} trackColor={{ false: colors.border, true: colors.accent }} thumbColor={colors.card} /></View>)}
    </View>
    <Pressable accessibilityRole="button" onPress={onSignOut} style={styles.signOutButton}><Text style={styles.signOutText}>Odhlásit se</Text></Pressable>
  </ScrollView>
}

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount) } catch { return `${amount.toLocaleString('cs-CZ')} ${currency}` }
}

const chartColors = ['#03bcdb', '#747ce8', '#ee9b43', '#45b887', '#e36b84']

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
  chartCard: { gap: 10, padding: 15, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 18 },
  chartRow: { gap: 5 },
  chartLabelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  chartTrack: { height: 8, overflow: 'hidden', borderRadius: 8, backgroundColor: colors.muted },
  chartFill: { height: '100%', borderRadius: 8 },
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
  notificationDot: { width: 8, height: 8, marginTop: 6, borderRadius: 4, backgroundColor: '#ccd0d4' },
  notificationDotUnread: { backgroundColor: colors.primary },
  sheetHandle: { width: 38, height: 4, alignSelf: 'center', backgroundColor: '#c6c8ca', borderRadius: 4, marginBottom: 16 },
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
  preferenceToggleActive: { borderColor: '#75cbd4', backgroundColor: colors.accentSubtle },
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
  storeIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSubtle },
  branchCard: { gap: 3, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 14 },
  purchaseCard: { gap: 10, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 14 },
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
  profileAvatar: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 35, backgroundColor: colors.accentSubtle, marginBottom: 4 },
  profileInitials: { color: colors.accentText, fontSize: 23, fontWeight: '800' },
  profileName: { color: colors.foreground, fontSize: 20, fontWeight: '700' },
  preferenceCard: { gap: 8, padding: 16, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 18 },
  profileFieldLabel: { color: colors.secondaryText, fontSize: 12, fontWeight: '600', marginTop: 6 },
  profileInput: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.elevated, color: colors.foreground, paddingHorizontal: 12, fontSize: 14 },
  profileSaveButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.primary, marginTop: 4 },
  profileSaveText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '700' },
  success: { color: colors.accentText, fontSize: 13 },
  signOutButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.destructive, borderRadius: 14, backgroundColor: colors.destructiveSubtle, marginTop: 4 },
  signOutText: { color: colors.destructive, fontSize: 14, fontWeight: '700' },
  themeChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  themeChoice: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  themeChoiceSelected: { backgroundColor: colors.accentSubtle, borderColor: colors.accent },
  themeChoiceText: { color: colors.secondaryText, fontSize: 13, fontWeight: '600' },
  themeChoiceTextSelected: { color: colors.accentText },
  preferenceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopColor: colors.border, borderTopWidth: 1 },
  preferenceDescription: { flex: 1, gap: 3 },
}), [colors])
}
