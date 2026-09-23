import Link from 'next/link'
import { Ban, PackageCheck, Pencil, X } from 'lucide-react'
import { prisma } from '@/server/db'
import { executeGraphQL } from '@/server/graphql/execute'
import { PageHeader } from '@/components/ui/stat'
import { GlassCard, EmptyState, Badge } from '@/components/ui/glass'
import { ORDERS_QUERY, DAY_BOARD_QUERY } from '@/lib/queries'
import { RefillForm, type RefillService } from '@/components/orders/refill-form'
import { DepartmentFilter } from '@/components/orders/department-filter'
import type { ProcessOrder } from '@/lib/order-types'
import type { Board } from '@/components/orders/day-board'
import { cn, formatLongDate } from '@/lib/utils'
import { BackLink } from '@/components/ui/back-link'

/**
 * Toutes les fiches d'un même écart, empilées.
 *
 * Une fenêtre listant les articles disait ce qui manquait sans montrer les
 * commandes : pour traiter, l'économat doit voir chaque ticket tel qu'il le
 * verrait en l'ouvrant. Chaque fiche arrive donc entière, déjà filtrée sur
 * ses lignes en écart.
 */
export async function EcartsPage({
  searchParams, base,
}: {
  searchParams: Promise<{ jour?: string; jusquau?: string; dep?: string; type?: string }>
  /**
   * L'espace appelant : économat ou administration. Le même écran sert aux
   * deux — l'administration sert et corrige comme l'économat — mais chaque
   * lien doit ramener dans l'espace d'où l'on vient.
   */
  base: '/economat' | '/admin'
}) {
  const { jour, jusquau, dep, type } = await searchParams
  // Trois vues : les ruptures seules, les ajustées seules, ou les deux.
  const vue = type === 'ajuste' ? 'ajuste' : type === 'tous' ? 'tous' : 'rupture'

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
  const concerne = (o: { rejectedCount: number; adjustedCount: number }) =>
    vue === 'rupture' ? o.rejectedCount > 0
      : vue === 'ajuste' ? o.adjustedCount > 0
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
            : o.rejectedCount + o.adjustedCount
        ), 0,
      ),
    ]),
  )

  // Toutes les fiches en une requête : le tableau de la journée ne porte pas
  // les lignes, et les charger ticket par ticket coûtait un aller-retour
  // chacun.
  const orders = ids.length === 0
    ? []
    : (await executeGraphQL<{ orders: ProcessOrder[] }>(ORDERS_QUERY, { ids })).orders

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

  // Les lignes passent au formulaire de service : un bloc par département,
  // toutes commandes confondues. Les vues « ajustées » et « ruptures » ne
  // changent pas d'écran : elles filtrent ce même formulaire, saisie comprise.
  const services: RefillService[] = []
  {
    for (const o of orders) {
      // Ce qui s'écarte encore, plus ce qu'un passage complémentaire a déjà
      // servi : une ligne soldée par un servi redevient « conforme », et la
      // laisser de côté la faisait disparaître du tableau — treize articles
      // servis n'en montraient plus que quatre au moment de relire le bon.
      const concernees = o.lines.filter(
        (l) => l.status === 'REJECTED' || l.status === 'ADJUSTED'
          || l.refills.some((r) => r.quantity > 0),
      )
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
          deliveredAt: r.deliveredAt,
        })
      }
      for (const l of concernees) {
        bloc.lignes.push({
          id: l.id, orderId: o.id, orderRef: o.reference,
          productName: l.productName, productRef: l.productRef,
          categoryName: l.categoryName, unitSymbol: l.unitSymbol,
          quantityAsked: l.quantityAsked, quantityServed: l.quantityServed,
          quantityRefilled: l.quantityRefilled, refills: l.refills, status: l.status,
          remaining: l.remaining, rang: l.rang,
        })
      }
    }
    // L'ordre de la feuille, et rien d'autre : ticket par ticket, puis le
    // numéro de ligne. Trier par état regroupait les ajustées en tête, et le
    // papier — feuille de tournée, bon — ne suivait plus l'écran ; on
    // cherchait chaque article au lieu de descendre la liste.
    for (const s of services) {
      s.lignes.sort((a, b) => a.orderRef.localeCompare(b.orderRef) || a.rang - b.rang)
    }
  }

  /** Bascule de vue, en gardant la journée et le service affichés. */
  const lienVue = (t: 'rupture' | 'ajuste' | 'tous') => {
    const p = new URLSearchParams({ type: t })
    if (jour) p.set('jour', jour)
    if (jusquau) p.set('jusquau', jusquau)
    if (dep) p.set('dep', dep)
    return p.toString()
  }

  const retour = new URLSearchParams()
  if (jour) retour.set('jour', jour)
  if (jusquau) retour.set('jusquau', jusquau)
  if (dep) retour.set('dep', dep)

  return (
    <>
      <BackLink href={`${base}${retour.size ? `?${retour}` : ''}`}>Retour</BackLink>

      <PageHeader
        title="Écarts de la journée"
        description={
          vue === 'rupture'
            ? 'Seules les ruptures sont affichées : la saisie en cours est conservée.'
            : vue === 'ajuste'
              ? 'Seules les quantités ajustées sont affichées : la saisie en cours est conservée.'
              : 'Tout ce qui s’écarte de la commande : d’abord les quantités ajustées, puis les ruptures.'
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[0.9rem] font-semibold capitalize text-fg">
            {formatLongDate(board.day)}
          </span>
          {/* Les deux natures, et le moyen de n'en voir qu'une : le compte
              annonçait « 78 ajustées » sans y conduire, alors que c'est
              précisément la liste qu'on veut ouvrir. Chaque pastille bascule
              donc la vue, et celle qui est active se désigne.

              La journée et le service affichés suivent : on ne repart pas du
              tableau du jour pour retrouver le rayon qu'on regardait. */}
          <Link href={`${base}/ecarts?${lienVue('ajuste')}`} className="no-print">
            <Badge
              tone="warn"
              className={cn(
                'cursor-pointer transition-[box-shadow,opacity] hover:shadow-[0_4px_12px_-6px_rgb(var(--shadow-ambient)/0.5)]',
                vue === 'ajuste' && 'ring-2 ring-warn/45',
                vue === 'rupture' && 'opacity-60',
              )}
            >
              <Pencil className="size-3.5" />
              {ajustees} ajustée{ajustees > 1 ? 's' : ''}
            </Badge>
          </Link>
          <Link href={`${base}/ecarts?${lienVue('rupture')}`} className="no-print">
            <Badge
              tone="danger"
              className={cn(
                'cursor-pointer transition-[box-shadow,opacity] hover:shadow-[0_4px_12px_-6px_rgb(var(--shadow-ambient)/0.5)]',
                vue === 'rupture' && 'ring-2 ring-danger/45',
                vue === 'ajuste' && 'opacity-60',
              )}
            >
              <Ban className="size-3.5" />
              {ruptures} rupture{ruptures > 1 ? 's' : ''}
            </Badge>
          </Link>
          {/* Revenir aux deux d'un geste, sans passer par le tableau du jour. */}
          {vue !== 'tous' ? (
            <Link href={`${base}/ecarts?${lienVue('tous')}`} className="no-print">
              <Badge
                tone="neutral"
                className="cursor-pointer transition-[box-shadow] hover:shadow-[0_4px_12px_-6px_rgb(var(--shadow-ambient)/0.5)]"
              >
                <X className="size-3.5" />
                Tout afficher
              </Badge>
            </Link>
          ) : null}
        </div>
      </PageHeader>

      <DepartmentFilter
        departments={allDepartments.map((d) => ({
          id: String(d.id), name: d.name, color: d.color, icon: d.icon,
        }))}
        groups={board.departments}
        counts={ecartsParService}
        current={dep ?? null}
        basePath={`${base}/ecarts`}
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
      ) : (
        /* On ne lit pas : on sert. La marchandise est arrivée, et ruptures
           comme ajustements se complètent d'un même passage — la pastille
           choisie ne fait que restreindre ce qu'on voit. */
        <div className="space-y-6">
          {services.map((s) => (
            <RefillForm
              key={s.id}
              service={s}
              etat={vue === 'rupture' ? 'REJECTED' : vue === 'ajuste' ? 'ADJUSTED' : null}
              admin={base === '/admin'}
            />
          ))}
        </div>
      )}
    </>
  )
}
