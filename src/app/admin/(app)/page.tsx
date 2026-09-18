import type { Metadata } from 'next'
import { executeGraphQL } from '@/server/graphql/execute'
import { PageHeader } from '@/components/ui/stat'
import { DayBoard, DayTotals, type Board } from '@/components/orders/day-board'
import { DaySummary } from '@/components/orders/day-summary'
import { DayPicker } from '@/components/orders/day-picker'
import { DepartmentFilter } from '@/components/orders/department-filter'
import { DAY_BOARD_QUERY } from '@/lib/queries'

export const metadata: Metadata = { title: 'Tableau de bord' }
export const dynamic = 'force-dynamic'

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string; jusquau?: string; dep?: string }>
}) {
  const { jour, jusquau, dep } = await searchParams
  const data = await executeGraphQL<{ dayBoard: Board; activeDays: string[] }>(DAY_BOARD_QUERY, {
    day: jour ?? null,
    dayTo: jusquau ?? null,
  })
  const board = data.dayBoard

  // Un département demandé mais sans commande ce jour-là ne doit pas vider
  // l'écran en silence : on retombe sur la vue complète.
  const groups = board.departments
  const selected = dep && groups.some((g) => g.department.id === dep) ? dep : null
  const shown = selected ? groups.filter((g) => g.department.id === selected) : groups

  // Les totaux suivent le filtre. Garder ceux de la journée entière ferait
  // afficher « 3 tickets » au-dessus d'un seul, et l'écran se contredirait.
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

  return (
    <>
      <PageHeader
        title="Pilotage général"
        description={
          b.isRange
            ? 'Période : tickets de toutes les journées, cumulés par département.'
            : 'Journée de service : tickets par département, quantités demandées et servies.'
        }
        actions={
          <DayPicker
            days={data.activeDays}
            current={b.day}
            currentTo={b.isRange ? b.dayTo : null}
            basePath="/admin"
            keep={selected}
          />
        }
      />

      <DepartmentFilter
        groups={groups}
        current={selected}
        basePath="/admin"
        day={board.day}
        dayTo={board.isRange ? board.dayTo : null}
      />

      {/* La date est portée par le bandeau : la répéter ici faisait doublon. */}
      <DaySummary board={b} />

      <DayBoard board={b} basePath="/admin/commandes" />
      {b.orderCount > 0 ? <DayTotals board={b} /> : null}
    </>
  )
}
