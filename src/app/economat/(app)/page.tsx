import type { Metadata } from 'next'
import { executeGraphQL } from '@/server/graphql/execute'
import { PageHeader } from '@/components/ui/stat'
import { DayBoard, DayTotals, type Board } from '@/components/orders/day-board'
import { DayPicker } from '@/components/orders/day-picker'
import { Badge } from '@/components/ui/glass'
import { DAY_BOARD_QUERY } from '@/lib/queries'
import { formatLongDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Commandes du jour' }
export const dynamic = 'force-dynamic'

export default async function EconomatPage({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string; jusquau?: string }>
}) {
  const { jour, jusquau } = await searchParams
  const data = await executeGraphQL<{ dayBoard: Board; activeDays: string[] }>(DAY_BOARD_QUERY, {
    day: jour ?? null,
    dayTo: jusquau ?? null,
  })

  return (
    <>
      <PageHeader
        title="Commandes du jour"
        description="Les tickets reçus, regroupés par département."
        actions={
          <DayPicker
            days={data.activeDays}
            current={data.dayBoard.day}
            currentTo={data.dayBoard.isRange ? data.dayBoard.dayTo : null}
            basePath="/economat"
          />
        }
      >
        <p className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[0.9rem] font-semibold capitalize text-fg">
            {formatLongDate(data.dayBoard.day)}
          </span>
          {data.dayBoard.pendingCount > 0 ? (
            <Badge tone="warn">
              {data.dayBoard.pendingCount} en attente de traitement
            </Badge>
          ) : null}
        </p>
      </PageHeader>

      <DayBoard board={data.dayBoard} basePath="/economat/commandes" />
      {data.dayBoard.orderCount > 0 ? <DayTotals board={data.dayBoard} /> : null}
    </>
  )
}
