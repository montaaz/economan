import type { Metadata } from 'next'
import { PageHeader } from '@/components/ui/stat'
import { OrderHistory } from '@/components/orders/history'
import { StockHistory } from '@/components/stock/stock-history'
import { HistoryTabs } from '@/components/stock/history-tabs'

export const metadata: Metadata = { title: 'Historique' }
export const dynamic = 'force-dynamic'

export default async function AdminHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ du?: string; au?: string; vue?: string; type?: string; tout?: string }>
}) {
  const { du, au, vue, type, tout } = await searchParams
  const stock = vue === 'stock'
  return (
    <>
      <PageHeader title="Historique" description="Toutes les commandes, tous départements confondus." />
      {/* Deux journaux sur un même écran : les tickets, ou le stock général —
          ses entrées en rouge, ses sorties (les bons émis) en vert. */}
      <HistoryTabs tout={tout} selfPath="/admin/historique" stock={stock} from={du} to={au} type={type} />
      {stock ? (
        <StockHistory admin tout={tout} selfPath="/admin/historique" basePath="/admin/commandes" from={du} to={au} type={type} />
      ) : (
        <OrderHistory basePath="/admin/commandes" selfPath="/admin/historique" from={du} to={au} />
      )}
    </>
  )
}
