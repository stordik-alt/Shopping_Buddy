import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { auth } from '@/lib/auth/server'
import { getHouseholdData, getProductPrices, getStores } from '@/lib/db/queries'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const { data: session } = await auth.getSession()
  if (!session?.user) redirect('/auth/sign-in')

  const [data, stores, productPrices] = await Promise.all([
    getHouseholdData(session.user.id, session.user.name, session.user.email),
    getStores(),
    getProductPrices(),
  ])
  return <AppShell initialData={data} userName={session.user.name} stores={stores} productPrices={productPrices} />
}
