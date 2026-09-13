import type { Metadata } from 'next'
import { Inbox, Building2, Layers, Clock } from 'lucide-react'
import { executeGraphQL } from '@/server/graphql/execute'
import { PageHeader, StatTile } from '@/components/ui/stat'
import { DayBoard, DayTotals, type Board } from '@/components/orders/day-board'
import { DayPicker } from '@/components/orders/day-picker'
import { DAY_BOARD_QUERY } from '@/lib/queries'
import { formatLongDate, formatQty } from '@/lib/utils'

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
      <p className="mb-4 text-[1.1rem] font-bold capitalize tracking-tight text-fg sm:text-[1.25rem]">
        {formatLongDate(b.day)}
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Tickets"
          value={b.orderCount}
          icon={<Inbox className="size-4" />}
          tone="accent"
          hint={`${b.pendingCount} en attente`}
        />
        <StatTile
          label="Départements"
          value={b.departments.length}
          icon={<Building2 className="size-4" />}
          hint="ayant commandé"
        />
        <StatTile
          label="Lignes"
          value={b.lineCount}
          icon={<Layers className="size-4" />}
          hint="articles commandés"
        />
        <StatTile
          label="Quantité servie"
          value={formatQty(b.totalServed)}
          icon={<Clock className="size-4" />}
          tone="ok"
          hint={`sur ${formatQty(b.totalAsked)} demandé`}
        />
      </div>

      <DayBoard board={b} basePath="/admin/commandes" />
      {b.orderCount > 0 ? <DayTotals board={b} /> : null}
    </>
  )
}
