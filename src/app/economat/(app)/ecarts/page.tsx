import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Ban, PackageCheck, Pencil } from 'lucide-react'
import { executeGraphQL } from '@/server/graphql/execute'
import { PageHeader } from '@/components/ui/stat'
import { GlassCard, EmptyState, Badge } from '@/components/ui/glass'
import { ORDER_QUERY, DAY_BOARD_QUERY } from '@/lib/queries'
import { EcartsParService } from '@/components/orders/ecarts-par-service'
import type { ProcessOrder } from '@/lib/order-types'
import type { Board } from '@/components/orders/day-board'
import { formatLongDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Écarts de la journée' }
export const dynamic = 'force-dynamic'

/**
 * Toutes les fiches d'un même écart, empilées.
 *
 * Une fenêtre listant les articles disait ce qui manquait sans montrer les
 * commandes : pour traiter, l'économat doit voir chaque ticket tel qu'il le
 * verrait en l'ouvrant. Chaque fiche arrive donc entière, déjà filtrée sur
 * ses lignes en écart.
 */
export default async function EcartsPage({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string; jusquau?: string; dep?: string; type?: string }>
}) {
  const { jour, jusquau, dep, type } = await searchParams
  const rupture = type !== 'ajuste'

  const data = await executeGraphQL<{ dayBoard: Board }>(DAY_BOARD_QUERY, {
    day: jour ?? null,
    dayTo: jusquau ?? null,
  })
  const board = data.dayBoard

  // Les commandes concernées, dans l'ordre de la journée. Le filtre par
  // service suit celui de l'écran d'où l'on vient.
  const groupes = dep
    ? board.departments.filter((g) => g.department.id === dep)
    : board.departments
  const ids = groupes.flatMap((g) =>
    g.orders
      .filter((o) => (rupture ? o.rejectedCount > 0 : o.adjustedCount > 0))
      .map((o) => o.id),
  )

  // Une requête par commande : la fiche a besoin de toutes ses lignes, que le
  // tableau de la journée ne porte pas.
  const orders = (
    await Promise.all(
      ids.map((id) =>
        executeGraphQL<{ order: ProcessOrder | null }>(ORDER_QUERY, { id }).then((d) => d.order),
      ),
    )
  ).filter((o): o is ProcessOrder => o !== null)

  const lignes = orders.reduce(
    (n, o) => n + o.lines.filter((l) => l.status === (rupture ? 'REJECTED' : 'ADJUSTED')).length,
    0,
  )

  const retour = new URLSearchParams()
  if (jour) retour.set('jour', jour)
  if (jusquau) retour.set('jusquau', jusquau)
  if (dep) retour.set('dep', dep)

  return (
    <>
      <Link
        href={`/economat${retour.size ? `?${retour}` : ''}`}
        className="no-print mb-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[0.83rem] font-medium text-fg-muted transition-colors hover:bg-[rgb(var(--glass-edge)/0.14)] hover:text-fg"
      >
        <ArrowLeft className="size-4" />
        Commandes du jour
      </Link>

      <PageHeader
        title={rupture ? 'Ruptures de la journée' : 'Quantités ajustées'}
        description={
          rupture
            ? 'Les lignes non livrées de la journée, regroupées par service.'
            : 'Les lignes servies en quantité différente, regroupées par service.'
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[0.9rem] font-semibold capitalize text-fg">
            {formatLongDate(board.day)}
          </span>
          <Badge tone={rupture ? 'danger' : 'warn'}>
            {rupture ? <Ban className="size-3.5" /> : <Pencil className="size-3.5" />}
            {lignes} ligne{lignes > 1 ? 's' : ''}
          </Badge>
          <Badge tone="neutral">
            {orders.length} commande{orders.length > 1 ? 's' : ''} touchée
            {orders.length > 1 ? 's' : ''}
          </Badge>
        </div>
      </PageHeader>

      {orders.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<PackageCheck className="size-6" />}
            title={rupture ? 'Aucune rupture' : 'Aucun ajustement'}
            description={
              rupture
                ? 'Tout ce qui a été commandé a pu être servi.'
                : 'Tout ce qui a été servi correspond à ce qui était commandé.'
            }
          />
        </GlassCard>
      ) : (
        <EcartsParService orders={orders} status={rupture ? 'REJECTED' : 'ADJUSTED'} />
      )}
    </>
  )
}
