import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { auth } from '@/lib/auth/server'
import { isAppAdmin } from '@/lib/db/admin'
import { getHouseholdData } from '@/lib/db/queries'
import { getProductPricesCached, getStandaloneOffersCached, getStoreChainsCached, getStoresCached } from '@/lib/db/cached-reads'
import { getRestockCandidates, getRestockDismissals, getStockLevels } from '@/lib/db/restock'
import { restockSuggestions } from '@/lib/pantry-restock'
import { listPinsForHousehold } from '@/lib/db/shopping-plan'
import { getMemberIdForUser, getMemberStoreSelection } from '@/lib/db/member-store-preferences'
import { EMPTY_STORE_SELECTION } from '@/lib/nearby-stores'
import { pushPublicKeyForClient } from '@/lib/push/deliver'
import { AI_ASSISTANT_ENABLED } from '@/lib/features'
import { DEALS_CHAIN_PARAM, tabFromSlug } from '@/lib/tab-url'
import { createPerfTimer } from '@/lib/perf-timing'
import { todayInPrague } from '@/lib/today'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  // With PERF_TIMING=1 the server log gets one `[perf]` line per render: each phase's start and
  // duration, so the slow step shows (lib/perf-timing.ts). Without it nothing is measured.
  const timer = createPerfTimer('page /')
  const { data: session } = await timer.measure('session', () => auth.getSession())
  if (!session?.user) redirect('/intro')
  // The section to open (`/?tab=nakup`, lib/tab-url.ts); unknown values open Domů.
  const params = await searchParams
  const tabParam = params.tab
  const initialTab = tabFromSlug(typeof tabParam === 'string' ? tabParam : null, { aiEnabled: AI_ASSISTANT_ENABLED })
  // The weekly pantry notification links to `/?tab=zasoby&kontrola=1`: open the check directly.
  const initialPantryCheck = initialTab === 'Zásoby' && params.kontrola === '1'
  // A new flyer notification links to `/?tab=akce&retezec=<chain>`: Akce opens filtered to the chain.
  const chainParam = params[DEALS_CHAIN_PARAM]
  const initialDealsChain = initialTab === 'Akce' && typeof chainParam === 'string' && chainParam.trim() ? chainParam.trim() : null

  const [data, stores, standaloneOffers, storeChains, isAdmin] = await Promise.all([
    timer.measure('householdData', () => getHouseholdData(session.user.id, session.user.name, session.user.email, timer)),
    // Global data (the same for every household) comes from a 15-minute cache (lib/db/cached-reads.ts).
    timer.measure('stores', () => getStoresCached()),
    timer.measure('standaloneOffers', () => getStandaloneOffersCached()),
    timer.measure('storeChains', () => getStoreChainsCached()),
    // Only decides whether the account menu offers the administrator screen; the screen and its actions check again on the server.
    timer.measure('isAdmin', () => isAppAdmin(session.user.id)),
  ])
  // The rest needs the household data but not each other, so they go to the database together
  // instead of one after another (each wait is a round trip to the database).
  const [productPrices, storeSelection, pins] = await Promise.all([
    // Only the list's own products — not every product with a running promotion (see
    // ProductPriceScope): that used to load the whole promoted catalog's full price history on every
    // refresh, most of the database's compute (docs/07_CHANGELOG.md, 2026-09-26/27). Browsing every
    // promotion now lives in the Akce tab, which loads only the page being looked at
    // (app/actions/deals.ts).
    timer.measure('productPrices', () => getProductPricesCached({ names: data.items.map((item) => item.name), runningDeals: false })),
    // After getHouseholdData: on a first login that call is what creates the member row.
    timer.measure('storeSelection', () => getMemberIdForUser(session.user.id).then((memberId) => (memberId ? getMemberStoreSelection(memberId) : EMPTY_STORE_SELECTION))),
    timer.measure('pins', () => listPinsForHousehold(data.household.id)),
  ])
  // "Dokoupit do zásoby": only rows near their household-set minimum cost a query (lib/db/restock.ts). The
  // chains are the preferred ones, else the chosen nearby ones, else any — nobody who has set no stores
  // should be told nothing.
  const restockChainIds = storeSelection.priorityChainIds.length > 0 ? storeSelection.priorityChainIds : storeSelection.chainIds.length > 0 ? storeSelection.chainIds : null
  const [stockLevels, restockDismissals] = await timer.measure('stockLevels', () => Promise.all([getStockLevels(data.household.id), getRestockDismissals(data.household.id, todayInPrague())]))
  const restock = await timer.measure('restock', async () => restockSuggestions(stockLevels, data.pantryItems, await getRestockCandidates(stockLevels, data.pantryItems, todayInPrague(), restockChainIds), restockChainIds ? new Set(restockChainIds) : null))
  timer.flush()
  return <AppShell initialData={data} userName={session.user.name} isAdmin={isAdmin} stores={stores} productPrices={productPrices} standaloneOffers={standaloneOffers} storeChains={storeChains} initialStoreSelection={storeSelection} initialPins={pins} restockSuggestions={restock} initialStockLevels={stockLevels} initialRestockDismissals={restockDismissals} today={todayInPrague()} initialTab={initialTab} initialPantryCheck={initialPantryCheck} initialDealsChain={initialDealsChain} pushPublicKey={pushPublicKeyForClient()} />
}
