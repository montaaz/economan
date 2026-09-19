import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Printer } from 'lucide-react'
import { executeGraphQL } from '@/server/graphql/execute'
import { ORDER_QUERY } from '@/lib/queries'
import { OrderView } from '@/components/orders/order-view'
import { Ticket, ticketVariant, type TicketOrder } from '@/components/ui/ticket'
import { PrintButton } from '@/components/ui/print-button'
import type { ProcessOrder } from '@/lib/order-types'

export const metadata: Metadata = { title: 'Commande' }
export const dynamic = 'force-dynamic'

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { order } = await executeGraphQL<{ order: (ProcessOrder & TicketOrder) | null }>(ORDER_QUERY, { id })
  if (!order) notFound()

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[0.83rem] font-medium text-fg-muted transition-colors hover:bg-[rgb(var(--glass-edge)/0.14)] hover:text-fg"
        >
          <ArrowLeft className="size-4" />
          Tableau de bord
        </Link>
        <PrintButton orderId={order.id} variant="secondary" size="sm">
          <Printer className="size-3.5" />
          Imprimer
        </PrintButton>
      </div>

      <div className="no-print">
        <OrderView order={order} />
      </div>

      <div className="print-only">
        <Ticket order={order} variant={ticketVariant(order.status)} />
      </div>
    </>
  )
}
