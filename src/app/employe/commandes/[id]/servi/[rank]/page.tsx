import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ClipboardList } from 'lucide-react'
import { executeGraphQL } from '@/server/graphql/execute'
import { requireEmployeeDepartment } from '@/server/auth/guards'
import { GlassCard, Badge } from '@/components/ui/glass'
import { formatLongDate, formatTime } from '@/lib/utils'
import { RefillReception, type RefillView } from '../../refill-reception'
import { BackLink } from '@/components/ui/back-link'

export const metadata: Metadata = { title: 'Servi complémentaire' }
export const dynamic = 'force-dynamic'

const QUERY = /* GraphQL */ `
  query OrderRefill($id: ID!) {
    order(id: $id) {
      id
      reference
      ticketNumber
      businessDay
      createdAt
      department { name color }
      createdBy { fullName }
      refills {
        id
        rank
        createdAt
        receivedAt
        receptionNote
        createdBy { fullName }
        receivedBy { fullName }
        lines {
          lineId productName productRef categoryName unitSymbol
          stockFixe quantityAsked firstServed quantity remaining rejectReason rang
        }
      }
    }
  }
`

type Order = {
  id: string
  reference: string
  ticketNumber: number
  businessDay: string
  createdAt: string
  department: { name: string; color: string }
  createdBy: { fullName: string }
  refills: RefillView[]
}

/**
 * Un servi complémentaire, seul.
 *
 * Le barman qui reçoit le complément n'a que faire des cent lignes de la
 * commande d'origine : il compte ce qui vient d'arriver, et signe pour ça.
 * La commande reste à un clic, pour qui veut le contexte.
 */
export default async function RefillPage({
  params,
}: {
  params: Promise<{ id: string; rank: string }>
}) {
  const { id, rank } = await params
  const [, { order }] = await Promise.all([
    // La requête refuse déjà la commande d'un autre département ; la garde
    // renvoie à la connexion quand il n'y a pas de session.
    requireEmployeeDepartment(),
    executeGraphQL<{ order: Order | null }>(QUERY, { id }),
  ])
  if (!order) notFound()

  const refill = order.refills.find((r) => r.rank === Number(rank))
  if (!refill) notFound()

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <BackLink href="/employe" className="mb-0">Retour</BackLink>
        {/* Le contexte reste à portée : la commande entière, pour qui veut
            relire ce qui avait été demandé et servi au départ. */}
        <Link
          href={`/employe/commandes/${order.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[0.83rem] font-medium text-fg-muted transition-colors hover:bg-[rgb(var(--glass-edge)/0.14)] hover:text-fg"
        >
          <ClipboardList className="size-4" />
          Voir la commande
        </Link>
      </div>

      <div className="space-y-4">
        <GlassCard>
          <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="grid size-11 shrink-0 place-items-center rounded-xl text-[0.95rem] font-bold text-white shadow-md"
                style={{ background: `linear-gradient(140deg, ${order.department.color}, ${order.department.color}bb)` }}
              >
                {order.ticketNumber}
              </span>
              <div className="min-w-0">
                <p className="truncate font-mono text-[0.95rem] font-bold leading-tight text-fg">
                  {order.reference}
                </p>
                <p className="text-[0.8rem] capitalize text-fg-muted">
                  {formatLongDate(order.businessDay)} · {formatTime(order.createdAt)} · {order.createdBy.fullName}
                </p>
              </div>
            </div>
            <Badge tone="accent">Complément de la commande</Badge>
          </div>
        </GlassCard>

        <RefillReception orderId={order.id} refill={refill} />
      </div>
    </>
  )
}
