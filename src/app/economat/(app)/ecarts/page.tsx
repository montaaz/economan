import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Ban, PackageCheck, Pencil } from 'lucide-react'
import { executeGraphQL } from '@/server/graphql/execute'
import { PageHeader } from '@/components/ui/stat'
import { GlassCard, EmptyState, Badge } from '@/components/ui/glass'
import { ORDER_QUERY, DAY_BOARD_QUERY } from '@/lib/queries'
import { EcartsParService } from '@/components/orders/ecarts-par-service'
import { RefillForm, type RefillService } from '@/components/orders/refill-form'
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
  // Trois vues : les ruptures seules, les ajustées seules, ou les deux.
  const vue = type === 'ajuste' ? 'ajuste' : type === 'tous' ? 'tous' : 'rupture'

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
  const concerne = (o: { rejectedCount: number; adjustedCount: number }) =>
    vue === 'rupture' ? o.rejectedCount > 0
      : vue === 'ajuste' ? o.adjustedCount > 0
      : o.rejectedCount > 0 || o.adjustedCount > 0
  const ids = groupes.flatMap((g) => g.orders.filter(concerne).map((o) => o.id))

  // Une requête par commande : la fiche a besoin de toutes ses lignes, que le
  // tableau de la journée ne porte pas.
  const orders = (
    await Promise.all(
      ids.map((id) =>
        executeGraphQL<{ order: ProcessOrder | null }>(ORDER_QUERY, { id }).then((d) => d.order),
      ),
    )
  ).filter((o): o is ProcessOrder => o !== null)

  const retenus = vue === 'rupture' ? ['REJECTED']
    : vue === 'ajuste' ? ['ADJUSTED']
    : ['REJECTED', 'ADJUSTED']
  const lignes = orders.reduce(
    (n, o) => n + o.lines.filter((l) => retenus.includes(l.status)).length, 0,
  )
  const ruptures = orders.reduce(
    (n, o) => n + o.lines.filter((l) => l.status === 'REJECTED').length, 0,
  )
  const ajustees = orders.reduce(
    (n, o) => n + o.lines.filter((l) => l.status === 'ADJUSTED').length, 0,
  )

  // Sur la vue réunie, les lignes passent au formulaire de service : un bloc
  // par département, toutes commandes confondues.
  const services: RefillService[] = []
  if (vue === 'tous') {
    for (const o of orders) {
      const concernees = o.lines.filter(
        (l) => l.status === 'REJECTED' || l.status === 'ADJUSTED',
      )
      if (concernees.length === 0) continue
      let bloc = services.find((s) => s.id === o.department.id)
      if (!bloc) {
        bloc = {
          id: o.department.id, nom: o.department.name,
          couleur: o.department.color, icone: o.department.icon,
          lignes: [], rangs: {},
        }
        services.push(bloc)
      }
      // Le prochain passage de cette commande se numérote après le dernier.
      bloc.rangs[o.id] = o.lastRefillRank
      for (const l of concernees) {
        bloc.lignes.push({
          id: l.id, orderId: o.id, orderRef: o.reference,
          productName: l.productName, productRef: l.productRef,
          categoryName: l.categoryName, unitSymbol: l.unitSymbol,
          quantityAsked: l.quantityAsked, quantityServed: l.quantityServed,
          quantityRefilled: l.quantityRefilled, status: l.status,
        })
      }
    }
    // Les ajustées d'abord, puis les ruptures, familles groupées dans chaque
    // groupe — le même ordre que la vue de lecture.
    for (const s of services) {
      s.lignes = (['ADJUSTED', 'REJECTED'] as const).flatMap((etat) => {
        const g = s.lignes.filter((l) => l.status === etat)
        const ordre: string[] = []
        for (const l of g) if (!ordre.includes(l.categoryName)) ordre.push(l.categoryName)
        return ordre.flatMap((c) => g.filter((l) => l.categoryName === c))
      })
    }
  }

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
        title={
          vue === 'rupture' ? 'Ruptures de la journée'
            : vue === 'ajuste' ? 'Quantités ajustées'
            : 'Écarts de la journée'
        }
        description={
          vue === 'rupture'
            ? 'Les lignes non livrées de la journée, regroupées par service.'
            : vue === 'ajuste'
              ? 'Les lignes servies en quantité différente, regroupées par service.'
              : 'Tout ce qui s’écarte de la commande : d’abord les quantités ajustées, puis les ruptures.'
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[0.9rem] font-semibold capitalize text-fg">
            {formatLongDate(board.day)}
          </span>
          {/* Sur la vue réunie, le détail des deux natures : « 27 lignes »
              seul ne dirait pas ce qu'on va trouver. */}
          {vue === 'tous' ? (
            <>
              <Badge tone="warn">
                <Pencil className="size-3.5" />
                {ajustees} ajustée{ajustees > 1 ? 's' : ''}
              </Badge>
              <Badge tone="danger">
                <Ban className="size-3.5" />
                {ruptures} rupture{ruptures > 1 ? 's' : ''}
              </Badge>
            </>
          ) : (
            <Badge tone={vue === 'rupture' ? 'danger' : 'warn'}>
              {vue === 'rupture' ? <Ban className="size-3.5" /> : <Pencil className="size-3.5" />}
              {lignes} ligne{lignes > 1 ? 's' : ''}
            </Badge>
          )}
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
            title={
              vue === 'rupture' ? 'Aucune rupture'
                : vue === 'ajuste' ? 'Aucun ajustement'
                : 'Aucun écart'
            }
            description={
              vue === 'rupture'
                ? 'Tout ce qui a été commandé a pu être servi.'
                : vue === 'ajuste'
                  ? 'Tout ce qui a été servi correspond à ce qui était commandé.'
                  : 'Tout a été servi tel que commandé.'
            }
          />
        </GlassCard>
      ) : vue === 'tous' ? (
        /* Sur la vue réunie, on ne lit pas : on sert. La marchandise est
           arrivée, et ruptures comme ajustements se complètent d'un même
           passage. */
        <div className="space-y-6">
          {services.map((s) => (
            <RefillForm key={s.id} service={s} />
          ))}
        </div>
      ) : (
        <EcartsParService
          orders={orders}
          status={vue === 'rupture' ? 'REJECTED' : 'ADJUSTED'}
        />
      )}
    </>
  )
}
