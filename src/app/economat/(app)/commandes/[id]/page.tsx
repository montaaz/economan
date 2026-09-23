import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { executeGraphQL } from '@/server/graphql/execute'
import { ORDER_QUERY } from '@/lib/queries'
import { Ticket, ticketVariant, type TicketOrder } from '@/components/ui/ticket'
import { OrderProcessor, type ProcessOrder } from './order-processor'
import { BackLink } from '@/components/ui/back-link'

export const metadata: Metadata = { title: 'Traitement de commande' }
export const dynamic = 'force-dynamic'

export default async function EconomatOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { order } = await executeGraphQL<{ order: (ProcessOrder & TicketOrder) | null }>(ORDER_QUERY, { id })
  if (!order) notFound()

  // La fiche et le bon n° 1 parlent du premier servi : une rupture reste une
  // rupture ici, même si un 2ᵉ servi l'a comblée depuis — les compléments
  // ont leurs propres cartes et leurs propres bons. L'état effectif reste
  // celui des compteurs du tableau de bord et des écarts.
  const premierServi = { ...order, lines: order.lines.map((l) => ({ ...l, status: l.initialStatus })) }

  return (
    <>
      <BackLink href="/economat">Retour</BackLink>

      <div className="no-print">
        <OrderProcessor order={premierServi} />
      </div>

      {/* Sortie papier : ticket tant que rien n'est servi, bon de livraison ensuite. */}
      <div className="print-only">
        <Ticket order={premierServi} variant={ticketVariant(order.status)} />
      </div>
    </>
  )
}
