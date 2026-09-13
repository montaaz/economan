import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { executeGraphQL } from '@/server/graphql/execute'
import { ORDER_QUERY } from '@/lib/queries'
import { Ticket, type TicketOrder } from '@/components/ui/ticket'
import { OrderProcessor, type ProcessOrder } from './order-processor'

export const metadata: Metadata = { title: 'Traitement de commande' }
export const dynamic = 'force-dynamic'

export default async function EconomatOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { order } = await executeGraphQL<{ order: (ProcessOrder & TicketOrder) | null }>(ORDER_QUERY, { id })
  if (!order) notFound()

  return (
    <>
      <Link
        href="/economat"
        className="no-print mb-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[0.83rem] font-medium text-fg-muted transition-colors hover:bg-[rgb(var(--glass-edge)/0.14)] hover:text-fg"
      >
        <ArrowLeft className="size-4" />
        Commandes du jour
      </Link>

      <div className="no-print">
        <OrderProcessor order={order} />
      </div>

      {/* Sortie papier : ticket tant que rien n'est servi, bon de livraison ensuite. */}
      <div className="print-only">
        <Ticket order={order} variant={order.status === 'PENDING' ? 'ticket' : 'bon'} />
      </div>
    </>
  )
}
