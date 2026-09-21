import type { Metadata } from 'next'
import { PageHeader } from '@/components/ui/stat'
import { OrderHistory } from '@/components/orders/history'

export const metadata: Metadata = { title: 'Historique' }
export const dynamic = 'force-dynamic'

export default async function AdminHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ du?: string; au?: string }>
}) {
  const { du, au } = await searchParams
  return (
    <>
      <PageHeader title="Historique" description="Toutes les commandes, tous départements confondus." />
      <OrderHistory basePath="/admin/commandes" selfPath="/admin/historique" from={du} to={au} />
    </>
  )
}
