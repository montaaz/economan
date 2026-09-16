import type { Metadata } from 'next'
import { executeGraphQL } from '@/server/graphql/execute'
import { PageHeader } from '@/components/ui/stat'
import { DayBoard, DayTotals, type Board } from '@/components/orders/day-board'
import { DaySummary } from '@/components/orders/day-summary'
import { DayPicker } from '@/components/orders/day-picker'
import { DAY_BOARD_QUERY } from '@/lib/queries'
import { formatLongDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Tableau de bord' }
export const dynamic = 'force-dynamic'

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string }>
}) {
  const { jour } = await searchParams
  const data = await executeGraphQL<{ dayBoard: Board; activeDays: string[] }>(DAY_BOARD_QUERY, {
    day: jour ?? null,
  })
  const b = data.dayBoard

  return (
    <>
      <PageHeader
        title="Pilotage général"
        description="Journée de service : tickets par département, quantités demandées et servies."
        actions={<DayPicker days={data.activeDays} current={b.day} basePath="/admin" />}
      />

      {/* La journée d'abord — c'est la première chose à lire. */}
      <p className="mb-3 text-[1.1rem] font-bold capitalize tracking-tight text-fg sm:text-[1.25rem]">
        {formatLongDate(b.day)}
      </p>

      <DaySummary board={b} />

      <DayBoard board={b} basePath="/admin/commandes" />
      {b.orderCount > 0 ? <DayTotals board={b} /> : null}
    </>
  )
}
