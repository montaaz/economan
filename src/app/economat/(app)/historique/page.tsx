import type { Metadata } from 'next'
import { PageHeader } from '@/components/ui/stat'
import { OrderHistory } from '@/components/orders/history'

export const metadata: Metadata = { title: 'Historique' }
export const dynamic = 'force-dynamic'

export default async function EconomatHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ du?: string; au?: string }>
}) {
  const { du, au } = await searchParams
  return (
    <>
      <PageHeader title="Historique" description="Toutes les commandes traitées, la plus récente d’abord." />
      <OrderHistory basePath="/economat/commandes" selfPath="/economat/historique" from={du} to={au} />
    </>
  )
}
