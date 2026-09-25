import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { auth } from '@/lib/auth/server'
import { getHouseholdData, getProductPrices, getStandaloneOffers, getStores } from '@/lib/db/queries'
import { listPinsForHousehold } from '@/lib/db/shopping-plan'
import { getMemberIdForUser, getMemberStoreSelection, getStoreChains } from '@/lib/db/member-store-preferences'
import { EMPTY_STORE_SELECTION } from '@/lib/nearby-stores'
import { pushPublicKeyForClient } from '@/lib/push/deliver'
import { AI_ASSISTANT_ENABLED } from '@/lib/features'
import { tabFromSlug } from '@/lib/tab-url'
import { todayInPrague } from '@/lib/today'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { data: session } = await auth.getSession()
  if (!session?.user) redirect('/intro')
  // The section to open (`/?tab=nakup`, lib/tab-url.ts); unknown values open Domů.
  const params = await searchParams
  const tabParam = params.tab
  const initialTab = tabFromSlug(typeof tabParam === 'string' ? tabParam : null, { aiEnabled: AI_ASSISTANT_ENABLED })
  // The weekly pantry notification links to `/?tab=zasoby&kontrola=1`: open the check directly.
  const initialPantryCheck = initialTab === 'Zásoby' && params.kontrola === '1'

  const [data, stores, standaloneOffers, storeChains] = await Promise.all([
    getHouseholdData(session.user.id, session.user.name, session.user.email),
    getStores(),
    getStandaloneOffers(),
    getStoreChains(),
  ])
  // Only the prices the screens use: the list's products and today's promotions (see
  // ProductPriceScope — the whole catalog is far too large to send on every refresh).
  const productPrices = await getProductPrices({ names: data.items.map((item) => item.name), runningDeals: true })
  // After getHouseholdData: on a first login that call is what creates the member row.
  const memberId = await getMemberIdForUser(session.user.id)
  const storeSelection = memberId ? await getMemberStoreSelection(memberId) : EMPTY_STORE_SELECTION
  const pins = await listPinsForHousehold(data.household.id)
  return <AppShell initialData={data} userName={session.user.name} stores={stores} productPrices={productPrices} standaloneOffers={standaloneOffers} storeChains={storeChains} initialStoreSelection={storeSelection} initialPins={pins} today={todayInPrague()} initialTab={initialTab} initialPantryCheck={initialPantryCheck} pushPublicKey={pushPublicKeyForClient()} />
}
