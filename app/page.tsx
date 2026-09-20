import { AppShell } from '@/components/app-shell'
import { getHouseholdData } from '@/lib/db/queries'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const data = await getHouseholdData()
  return <AppShell initialData={data} />
}
