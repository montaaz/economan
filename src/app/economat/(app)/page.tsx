import type { Metadata } from 'next'
import { prisma } from '@/server/db'
import { executeGraphQL } from '@/server/graphql/execute'
import { PageHeader } from '@/components/ui/stat'
import { DayBoard, DayTotals, type Board } from '@/components/orders/day-board'
import { DayPicker } from '@/components/orders/day-picker'
import { EcartFilter } from '@/components/orders/ecart-filter'
import { DepartmentFilter } from '@/components/orders/department-filter'
import { Badge } from '@/components/ui/glass'
import { DAY_BOARD_QUERY } from '@/lib/queries'
import { formatLongDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Commandes du jour' }
export const dynamic = 'force-dynamic'

export default async function EconomatPage({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string; jusquau?: string; dep?: string; ecart?: string }>
}) {
  const { jour, jusquau, dep, ecart } = await searchParams
  const [data, allDepartments] = await Promise.all([
    executeGraphQL<{ dayBoard: Board; activeDays: string[] }>(DAY_BOARD_QUERY, {
      day: jour ?? null,
      dayTo: jusquau ?? null,
    }),
    // La barre liste tous les services actifs, pas seulement ceux qui ont
    // commandé : sinon elle disparaîtrait les jours creux.
    prisma.department.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, color: true, icon: true },
    }),
  ])

  const board = data.dayBoard
  const groups = board.departments
  const selected = dep && allDepartments.some((d) => String(d.id) === dep) ? dep : null
  const parService = selected ? groups.filter((g) => g.department.id === selected) : groups

  // Filtre par écart : on ne garde que les tickets concernés, et les services
  // qui n'en ont plus aucun disparaissent — un bloc vide ne dirait rien.
  const ecartActif = ecart === 'rupture' || ecart === 'ajuste' ? ecart : null
  const porteEcart = (o: { rejectedCount: number; adjustedCount: number }) =>
    ecartActif === 'rupture' ? o.rejectedCount > 0 : o.adjustedCount > 0

  const shown = ecartActif
    ? parService
        .map((g) => {
          const orders = g.orders.filter(porteEcart)
          return {
            ...g,
            orders,
            orderCount: orders.length,
            lineCount: orders.reduce((n, o) => n + o.lineCount, 0),
            totalAsked: orders.reduce((n, o) => n + o.totalAsked, 0),
            totalServed: orders.reduce((n, o) => n + o.totalServed, 0),
          }
        })
        .filter((g) => g.orders.length > 0)
    : parService

  // Les totaux suivent le filtre : garder ceux de la journée entière ferait
  // afficher « 2 tickets » au-dessus d'un seul, et l'écran se contredirait.
  const b: Board = selected || ecartActif
    ? {
        ...board,
        departments: shown,
        orderCount: shown.reduce((n, g) => n + g.orderCount, 0),
        lineCount: shown.reduce((n, g) => n + g.lineCount, 0),
        totalAsked: shown.reduce((n, g) => n + g.totalAsked, 0),
        totalServed: shown.reduce((n, g) => n + g.totalServed, 0),
        pendingCount: shown.reduce(
          (n, g) => n + g.orders.filter((o) => o.status === 'PENDING').length, 0,
        ),
      }
    : board

  // Le compte est déjà dans le tableau : inutile d'une requête de plus pour
  // décider si le bouton a lieu d'être.
  // Les comptes portent sur le service choisi, pas sur la vue déjà filtrée :
  // un bouton qui compterait ses propres résultats ne dirait plus l'ampleur.
  const ruptures = parService.reduce(
    (n, g) => n + g.orders.reduce((m, o) => m + o.rejectedCount, 0), 0,
  )
  const ajustees = parService.reduce(
    (n, g) => n + g.orders.reduce((m, o) => m + o.adjustedCount, 0), 0,
  )

  return (
    <>
      <PageHeader
        title="Commandes du jour"
        description="Les tickets reçus, regroupés par département."
        actions={
          <DayPicker
            days={data.activeDays}
            current={b.day}
            currentTo={b.isRange ? b.dayTo : null}
            basePath="/economat"
            keep={selected}
          />
        }
      >
        {/* Un div, pas un p : le bouton des ruptures ouvre une modale qui
            contient un tableau, et un <table> dans un <p> est du HTML
            invalide — React refusait l'hydratation. */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[0.9rem] font-semibold capitalize text-fg">
            {formatLongDate(b.day)}
          </span>
          {b.pendingCount > 0 ? (
            <Badge tone="warn">
              {b.pendingCount} en attente de traitement
            </Badge>
          ) : null}
          {/* Les ruptures sont visibles ticket par ticket ; rien ne les
              rassemblait. Pour savoir ce qui a manqué au magasin dans la
              journée, il fallait ouvrir chaque commande de chaque service. */}
          {/* Compter les ruptures sans pouvoir les situer laissait le plus
              gros du travail — retrouver quelles commandes sont concernées —
              à la charge du lecteur. */}
          <EcartFilter
            ruptures={ruptures}
            ajustees={ajustees}
            current={ecartActif}
            day={board.day}
            dayTo={board.isRange ? board.dayTo : null}
            dep={selected}
            total={parService.reduce((n, g) => n + g.orders.length, 0)}
          />
        </div>
      </PageHeader>

      <DepartmentFilter
        departments={allDepartments.map((d) => ({
          id: String(d.id), name: d.name, color: d.color, icon: d.icon,
        }))}
        groups={groups}
        current={selected}
        basePath="/economat"
        day={board.day}
        dayTo={board.isRange ? board.dayTo : null}
        keep={{ ecart: ecartActif }}
      />

      <DayBoard board={b} basePath="/economat/commandes" />
      {b.orderCount > 0 ? <DayTotals board={b} /> : null}
    </>
  )
}
