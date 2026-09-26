import { notFound, redirect } from 'next/navigation'
import { AdminIdeas } from '@/components/admin/admin-ideas'
import { auth } from '@/lib/auth/server'
import { isAppAdmin } from '@/lib/db/admin'
import { listAllIdeas } from '@/lib/db/ideas'

export const dynamic = 'force-dynamic'

// Managing the improvement ideas of every household. Administrators only: the check happens here on
// the server, and anyone else gets the same "not found" as for a page that does not exist.
export default async function AdminIdeasPage() {
  const { data: session } = await auth.getSession()
  if (!session?.user) redirect('/intro')
  if (!(await isAppAdmin(session.user.id))) notFound()
  return <AdminIdeas initialIdeas={await listAllIdeas()} />
}
