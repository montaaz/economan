import type { Metadata } from 'next'
import { prisma } from '@/server/db'
import { executeGraphQL } from '@/server/graphql/execute'
import { PageHeader } from '@/components/ui/stat'
import { DayBoard, DayTotals, type Board } from '@/components/orders/day-board'
import { DayPicker } from '@/components/orders/day-picker'
import { RupturesPanel } from '@/components/orders/ruptures-panel'
import { DepartmentFilter } from '@/components/orders/department-filter'
import { Badge } from '@/components/ui/glass'
import { DAY_BOARD_QUERY } from '@/lib/queries'
import { formatLongDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Commandes du jour' }
export const dynamic = 'force-dynamic'

export default async function EconomatPage({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string; jusquau?: string; dep?: string }>
}) {
  const { jour, jusquau, dep } = await searchParams
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
  const shown = selected ? groups.filter((g) => g.department.id === selected) : groups

  // Les totaux suivent le filtre : garder ceux de la journée entière ferait
  // afficher « 2 tickets » au-dessus d'un seul, et l'écran se contredirait.
  const b: Board = selected
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
  // Le compte suit le filtre, comme le reste de l'écran.
  const ruptures = shown.reduce(
    (n, g) => n + g.orders.reduce((m, o) => m + o.rejectedCount, 0), 0,
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
          <RupturesPanel
            day={b.day}
            dayTo={b.isRange ? b.dayTo : null}
            count={ruptures}
            departmentId={selected}
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
      />

      <DayBoard board={b} basePath="/economat/commandes" />
      {b.orderCount > 0 ? <DayTotals board={b} /> : null}
    </>
  )
}
