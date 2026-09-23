import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { executeGraphQL } from '@/server/graphql/execute'
import { ORDER_QUERY } from '@/lib/queries'
import { OrderProcessor } from '@/app/economat/(app)/commandes/[id]/order-processor'
import { ReopenOrder } from '@/components/orders/reopen-order'
import { CancelUrgentOrder } from '@/components/orders/cancel-urgent-order'
import { Ticket, ticketVariant, type TicketOrder } from '@/components/ui/ticket'
import type { ProcessOrder } from '@/lib/order-types'
import { BackLink } from '@/components/ui/back-link'

export const metadata: Metadata = { title: 'Commande' }
export const dynamic = 'force-dynamic'

/**
 * La commande, vue de l'administration.
 *
 * Le même écran que l'économat, pas une copie en lecture seule : une
 * commande livrée s'y relit, et une commande rouverte s'y corrige — mêmes
 * gestes, mêmes gardes. Le verrou se lève et se remet depuis l'en-tête, sans
 * repasser par le tableau du jour.
 */
export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { order } = await executeGraphQL<{ order: (ProcessOrder & TicketOrder) | null }>(ORDER_QUERY, { id })
  if (!order) notFound()

  // La fiche et le bon n° 1 parlent du premier servi : une rupture reste une
  // rupture ici, même si un 2ᵉ servi l'a comblée depuis — les compléments
  // ont leurs propres cartes et leurs propres bons. L'état effectif reste
  // celui des compteurs du tableau de bord et des écarts.
  const premierServi = { ...order, lines: order.lines.map((l) => ({ ...l, status: l.initialStatus })) }

  const rouverte = order.status === 'ACCEPTED' && !!order.deliveredAt
  const gerable = order.status === 'DELIVERED' || order.status === 'RECEIVED' || rouverte

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <BackLink href="/admin" className="mb-0">Retour</BackLink>
        {/* Une urgente pas encore prise en charge se retire ou se corrige :
            le choix se fait dans une boîte, pas sur deux boutons côte à côte. */}
        {order.isUrgent && order.status === 'PENDING' ? (
          <CancelUrgentOrder
            id={order.id}
            reference={order.reference}
            editHref={`/admin/commande-urgente/${order.department.id}/modifier/${order.id}`}
          />
        ) : null}
        {gerable ? (
          <ReopenOrder
            id={order.id}
            reference={order.reference}
            ouverte={rouverte}
            recue={!!order.receivedAt}
          />
        ) : null}
      </div>

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
