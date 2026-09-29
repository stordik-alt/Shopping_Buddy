import { notFound, redirect } from 'next/navigation'
import { AdminSubcategoryChanges } from '@/components/admin/admin-subcategory-changes'
import { auth } from '@/lib/auth/server'
import { isAppAdmin } from '@/lib/db/admin'
import { listPendingSubcategoryChanges } from '@/lib/db/subcategory-changes'

export const dynamic = 'force-dynamic'

// Catalog subcategory moves waiting for approval. Administrators only: checked here on the server,
// anyone else gets the same "not found" as for a page that does not exist.
export default async function AdminSubcategoriesPage() {
  const { data: session } = await auth.getSession()
  if (!session?.user) redirect('/intro')
  if (!(await isAppAdmin(session.user.id))) notFound()
  return <AdminSubcategoryChanges initialChanges={await listPendingSubcategoryChanges()} />
}
