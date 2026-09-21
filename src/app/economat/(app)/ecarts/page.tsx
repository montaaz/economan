import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Ban, PackageCheck, PackageMinus, Pencil } from 'lucide-react'
import { prisma } from '@/server/db'
import { executeGraphQL } from '@/server/graphql/execute'
import { PageHeader } from '@/components/ui/stat'
import { GlassCard, EmptyState, Badge } from '@/components/ui/glass'
import { ORDER_QUERY, DAY_BOARD_QUERY } from '@/lib/queries'
import { EcartsParService } from '@/components/orders/ecarts-par-service'
import { RefillForm, type RefillService } from '@/components/orders/refill-form'
import { DepartmentFilter } from '@/components/orders/department-filter'
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
  // Quatre vues : les ruptures seules, les ajustées seules, les deux — ou
  // les manquants, ce que les rayons ont compté en moins à la réception.
  const vue = type === 'ajuste' ? 'ajuste'
    : type === 'tous' ? 'tous'
    : type === 'manquant' ? 'manquant'
    : 'rupture'

  const [data, allDepartments] = await Promise.all([
    executeGraphQL<{ dayBoard: Board }>(DAY_BOARD_QUERY, {
      day: jour ?? null,
      dayTo: jusquau ?? null,
    }),
    // Tous les services actifs, pour que la barre ne disparaisse pas quand un
    // seul est concerné.
    prisma.department.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, color: true, icon: true },
    }),
  ])
  const board = data.dayBoard

  // Les commandes concernées, dans l'ordre de la journée. Le filtre par
  // service suit celui de l'écran d'où l'on vient.
  const groupes = dep
    ? board.departments.filter((g) => g.department.id === dep)
    : board.departments
  const concerne = (o: { rejectedCount: number; adjustedCount: number; missingCount: number }) =>
    vue === 'rupture' ? o.rejectedCount > 0
      : vue === 'ajuste' ? o.adjustedCount > 0
      : vue === 'manquant' ? o.missingCount > 0
      : o.rejectedCount > 0 || o.adjustedCount > 0
  const ids = groupes.flatMap((g) => g.orders.filter(concerne).map((o) => o.id))

  // Les pastilles comptent les lignes en écart, pas les tickets : c'est ce
  // qu'on vient servir. Le compte porte sur toute la journée, pas sur la vue
  // filtrée, sinon le service choisi serait le seul à afficher un nombre.
  const ecartsParService = new Map(
    board.departments.map((g) => [
      g.department.id,
      g.orders.reduce(
        (n, o) => n + (
          vue === 'rupture' ? o.rejectedCount
            : vue === 'ajuste' ? o.adjustedCount
            : vue === 'manquant' ? o.missingCount
            : o.rejectedCount + o.adjustedCount
        ), 0,
      ),
    ]),
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

  const retenus = vue === 'rupture' ? ['REJECTED']
    : vue === 'ajuste' ? ['ADJUSTED']
    : ['REJECTED', 'ADJUSTED']
  const lignes = vue === 'manquant'
    ? orders.reduce((n, o) => n + o.lines.filter((l) => l.missing > 0).length, 0)
    : orders.reduce(
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
  // La vue des manquants passe aussi par le formulaire : ce qui n'est pas
  // arrivé au rayon se remplace d'un servi, comme une rupture.
  const services: RefillService[] = []
  if (vue === 'tous' || vue === 'manquant') {
    for (const o of orders) {
      const concernees = vue === 'manquant'
        ? o.lines.filter((l) => l.missing > 0)
        : o.lines.filter((l) => l.status === 'REJECTED' || l.status === 'ADJUSTED')
      if (concernees.length === 0) continue
      let bloc = services.find((s) => s.id === o.department.id)
      if (!bloc) {
        bloc = {
          id: o.department.id, nom: o.department.name,
          couleur: o.department.color, icone: o.department.icon,
          lignes: [], rangs: {}, passages: [], jour: board.day,
        }
        services.push(bloc)
      }
      // Le prochain passage de cette commande se numérote après le dernier.
      bloc.rangs[o.id] = o.lastRefillRank
      for (const r of o.refills) {
        bloc.passages.push({
          id: r.id, rank: r.rank, orderId: o.id, orderRef: o.reference,
          receivedAt: r.receivedAt, receivedBy: r.receivedBy,
        })
      }
      for (const l of concernees) {
        bloc.lignes.push({
          id: l.id, orderId: o.id, orderRef: o.reference,
          productName: l.productName, productRef: l.productRef,
          categoryName: l.categoryName, unitSymbol: l.unitSymbol,
          quantityAsked: l.quantityAsked, quantityServed: l.quantityServed,
          quantityRefilled: l.quantityRefilled, refills: l.refills, status: l.status,
          remaining: l.remaining, manquant: l.missing,
        })
      }
    }
    // Les ajustées d'abord, puis les ruptures, familles groupées dans chaque
    // groupe — le même ordre que la vue de lecture.
    for (const s of services) {
      // Les manquants ne se trient pas par état : une ligne conforme peut
      // manquer au rayon. Familles groupées, dans l'ordre de la feuille.
      if (vue === 'manquant') {
        const ordre: string[] = []
        for (const l of s.lignes) if (!ordre.includes(l.categoryName)) ordre.push(l.categoryName)
        s.lignes = ordre.flatMap((c) => s.lignes.filter((l) => l.categoryName === c))
        continue
      }
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
            : vue === 'manquant' ? 'Manquants à la réception'
            : 'Écarts de la journée'
        }
        description={
          vue === 'rupture'
            ? 'Les lignes non livrées de la journée, regroupées par service.'
            : vue === 'ajuste'
              ? 'Les lignes servies en quantité différente, regroupées par service.'
              : vue === 'manquant'
                ? 'Ce que les rayons ont compté en moins à la réception : parti du magasin, jamais arrivé. Un servi de remplacement le couvre.'
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
            <Badge tone={vue === 'rupture' ? 'danger' : vue === 'manquant' ? 'accent' : 'warn'}>
              {vue === 'rupture' ? <Ban className="size-3.5" />
                : vue === 'manquant' ? <PackageMinus className="size-3.5" />
                : <Pencil className="size-3.5" />}
              {lignes} ligne{lignes > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </PageHeader>

      <DepartmentFilter
        departments={allDepartments.map((d) => ({
          id: String(d.id), name: d.name, color: d.color, icon: d.icon,
        }))}
        groups={board.departments}
        counts={ecartsParService}
        current={dep ?? null}
        basePath="/economat/ecarts"
        day={board.day}
        dayTo={board.isRange ? board.dayTo : null}
        keep={{ type }}
      />

      {orders.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<PackageCheck className="size-6" />}
            title={
              vue === 'rupture' ? 'Aucune rupture'
                : vue === 'ajuste' ? 'Aucun ajustement'
                : vue === 'manquant' ? 'Aucun manquant'
                : 'Aucun écart'
            }
            description={
              vue === 'rupture'
                ? 'Tout ce qui a été commandé a pu être servi.'
                : vue === 'ajuste'
                  ? 'Tout ce qui a été servi correspond à ce qui était commandé.'
                  : vue === 'manquant'
                    ? 'Les rayons ont compté tout ce qui leur a été servi.'
                    : 'Tout a été servi tel que commandé.'
            }
          />
        </GlassCard>
      ) : vue === 'tous' || vue === 'manquant' ? (
        /* Sur la vue réunie, on ne lit pas : on sert. La marchandise est
           arrivée, et ruptures comme ajustements se complètent d'un même
           passage. Les manquants aussi : ils se remplacent d'un servi. */
        <div className="space-y-6">
          {services.map((s) => (
            <RefillForm key={s.id} service={s} vue={vue === 'manquant' ? 'manquant' : 'tous'} />
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
