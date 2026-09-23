import type { Metadata } from 'next'
import { requireRole } from '@/server/auth/guards'
import { PageHeader } from '@/components/ui/stat'
import { GeneralStock } from '@/components/stock/general-stock'

export const metadata: Metadata = { title: 'Stock général' }
export const dynamic = 'force-dynamic'

/**
 * Le stock général — ce qui est entré au magasin, ce qui en est parti vers
 * les départements, ce qu'il reste et ce que cela vaut.
 */
export default async function AdminStockPage() {
  const user = await requireRole(['ADMIN'], '/admin/login')
  return (
    <>
      <PageHeader
        title="Stock général"
        description="Les arrivages entrent ici avec leur prix ; chaque bon de livraison en sort. Les portions comptent pour leur article mère."
      />
      <GeneralStock admin={user.role === 'ADMIN'} base="/admin" />
    </>
  )
}
