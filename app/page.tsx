import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { auth } from '@/lib/auth/server'
import { getHouseholdData, getProductPrices, getStores } from '@/lib/db/queries'
import { getMemberIdForUser, getMemberStoreSelection, getStoreChains } from '@/lib/db/member-store-preferences'
import { EMPTY_STORE_SELECTION } from '@/lib/nearby-stores'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const { data: session } = await auth.getSession()
  if (!session?.user) redirect('/auth/sign-in')

  const [data, stores, productPrices, storeChains] = await Promise.all([
    getHouseholdData(session.user.id, session.user.name, session.user.email),
    getStores(),
    getProductPrices(),
    getStoreChains(),
  ])
  // After getHouseholdData: on a first login that call is what creates the member row.
  const memberId = await getMemberIdForUser(session.user.id)
  const storeSelection = memberId ? await getMemberStoreSelection(memberId) : EMPTY_STORE_SELECTION
  return <AppShell initialData={data} userName={session.user.name} stores={stores} productPrices={productPrices} storeChains={storeChains} initialStoreSelection={storeSelection} />
}
