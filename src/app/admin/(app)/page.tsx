import type { Metadata } from 'next'
import { executeGraphQL } from '@/server/graphql/execute'
import { PageHeader } from '@/components/ui/stat'
import { DayBoard, DayTotals, type Board } from '@/components/orders/day-board'
import { DaySummary } from '@/components/orders/day-summary'
import { DayPicker } from '@/components/orders/day-picker'
import { DAY_BOARD_QUERY } from '@/lib/queries'

export const metadata: Metadata = { title: 'Tableau de bord' }
export const dynamic = 'force-dynamic'

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string; jusquau?: string }>
}) {
  const { jour, jusquau } = await searchParams
  const data = await executeGraphQL<{ dayBoard: Board; activeDays: string[] }>(DAY_BOARD_QUERY, {
    day: jour ?? null,
    dayTo: jusquau ?? null,
  })
  const b = data.dayBoard

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
          />
        }
      />

      {/* La date est portée par le bandeau : la répéter ici faisait doublon. */}
      <DaySummary board={b} />

      <DayBoard board={b} basePath="/admin/commandes" />
      {b.orderCount > 0 ? <DayTotals board={b} /> : null}
    </>
  )
}
