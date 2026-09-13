import Link from 'next/link'
import { Inbox } from 'lucide-react'
import { GlassCard, Badge, EmptyState } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { StatusBadge } from '@/components/ui/status'
import { formatQty, formatTime } from '@/lib/utils'

export type BoardOrder = {
  id: string
  reference: string
  ticketNumber: number
  status: 'PENDING' | 'ACCEPTED' | 'DELIVERED' | 'RECEIVED' | 'CANCELLED'
  createdAt: string
  lineCount: number
  totalAsked: number
  totalServed: number
  createdBy: { fullName: string }
}

export type BoardGroup = {
  department: { id: string; name: string; code: string; color: string; icon: string | null }
  orders: BoardOrder[]
  orderCount: number
  lineCount: number
  totalAsked: number
  totalServed: number
}

export type Board = {
  day: string
  departments: BoardGroup[]
  orderCount: number
  lineCount: number
  totalAsked: number
  totalServed: number
  pendingCount: number
}

/**
 * Journée de service : un bloc par département, ses tickets en cartes, et le
 * total du département. Le total général est rendu à part, en pied de page.
 */
export function DayBoard({ board, basePath }: { board: Board; basePath: string }) {
  if (board.departments.length === 0) {
    return (
      <GlassCard>
        <EmptyState
          icon={<Inbox className="size-6" />}
          title="Aucune commande"
          description="Aucun département n’a passé commande pour cette journée."
        />
      </GlassCard>
    )
  }

  return (
    <div className="space-y-5">
      {board.departments.map((g) => (
        <section key={g.department.id}>
          {/* Ligne du département */}
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 px-0.5">
            <h2 className="flex min-w-0 items-center gap-2.5">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-xl text-white shadow-sm"
                style={{ background: `linear-gradient(140deg, ${g.department.color}, ${g.department.color}bb)` }}
              >
                <Icon name={g.department.icon ?? 'Building2'} className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[1rem] font-bold leading-tight tracking-tight text-fg">
                  {g.department.name}
                </span>
                <span className="block text-[0.75rem] tabular-nums text-fg-subtle">
                  {g.orderCount} ticket{g.orderCount > 1 ? 's' : ''} · {g.lineCount} ligne
                  {g.lineCount > 1 ? 's' : ''}
                </span>
              </span>
            </h2>
            {/* Total du département */}
            <div className="flex shrink-0 items-center gap-1.5">
              <Badge tone="accent">{formatQty(g.totalAsked)} demandé</Badge>
              {g.totalServed > 0 ? <Badge tone="ok">{formatQty(g.totalServed)} servi</Badge> : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {g.orders.map((o) => (
              <Link key={o.id} href={`${basePath}/${o.id}`}>
                <GlassCard hover className="h-full">
                  <div className="space-y-2.5 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="grid size-8 shrink-0 place-items-center rounded-lg text-[0.82rem] font-bold tabular-nums text-white"
                          style={{ background: g.department.color }}
                        >
                          {o.ticketNumber}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-[0.78rem] font-semibold text-fg">
                            {o.reference}
                          </span>
                          <span className="block truncate text-[0.72rem] text-fg-subtle">
                            {o.createdBy.fullName} · {formatTime(o.createdAt)}
                          </span>
                        </span>
                      </span>
                      <StatusBadge status={o.status} />
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone="neutral">{o.lineCount} article{o.lineCount > 1 ? 's' : ''}</Badge>
                      <Badge tone="neutral">{formatQty(o.totalAsked)} demandé</Badge>
                      {o.totalServed > 0 ? (
                        <Badge tone="ok">{formatQty(o.totalServed)} servi</Badge>
                      ) : null}
                    </div>
                  </div>
                </GlassCard>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/** Total de la journée, toutes commandes confondues. */
export function DayTotals({ board }: { board: Board }) {
  return (
    <GlassCard deep className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-fg-subtle">
            Total de la journée
          </p>
          <p className="mt-1 text-[0.85rem] tabular-nums text-fg-muted">
            {board.departments.length} département{board.departments.length > 1 ? 's' : ''} ·{' '}
            {board.orderCount} ticket{board.orderCount > 1 ? 's' : ''} · {board.lineCount} ligne
            {board.lineCount > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-baseline gap-5">
          <div className="text-right">
            <p className="text-[0.7rem] font-medium uppercase tracking-wide text-fg-subtle">Demandé</p>
            <p className="text-[1.5rem] font-bold leading-none tabular-nums text-accent">
              {formatQty(board.totalAsked)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[0.7rem] font-medium uppercase tracking-wide text-fg-subtle">Servi</p>
            <p className="text-[1.5rem] font-bold leading-none tabular-nums text-ok">
              {formatQty(board.totalServed)}
            </p>
          </div>
        </div>
      </div>
    </GlassCard>
  )
}
