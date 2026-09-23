import type { Metadata } from 'next'
import { PageHeader } from '@/components/ui/stat'
import { OrderHistory } from '@/components/orders/history'
import { StockHistory } from '@/components/stock/stock-history'
import { HistoryTabs } from '@/components/stock/history-tabs'

export const metadata: Metadata = { title: 'Historique' }
export const dynamic = 'force-dynamic'

export default async function EconomatHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ du?: string; au?: string; vue?: string; type?: string; tout?: string }>
}) {
  const { du, au, vue, type, tout } = await searchParams
  const stock = vue === 'stock'
  return (
    <>
      <PageHeader title="Historique" description="Toutes les commandes traitées, la plus récente d’abord." />
      {/* Deux journaux sur un même écran : les tickets, ou le stock général —
          ses entrées en rouge, ses sorties (les bons émis) en vert. */}
      <HistoryTabs tout={tout} selfPath="/economat/historique" stock={stock} from={du} to={au} type={type} />
      {stock ? (
        <StockHistory tout={tout} selfPath="/economat/historique" basePath="/economat/commandes" from={du} to={au} type={type} />
      ) : (
        <OrderHistory basePath="/economat/commandes" selfPath="/economat/historique" from={du} to={au} />
      )}
    </>
  )
}
