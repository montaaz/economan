import Link from 'next/link'
import { Inbox } from 'lucide-react'
import { GlassCard, EmptyState } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { StatusBadge } from '@/components/ui/status'
import { formatInstantDate, formatQty, formatTime } from '@/lib/utils'
import { DepartmentTotal } from './department-total'

export type BoardOrder = {
  id: string
  reference: string
  ticketNumber: number
  rejectedCount: number
  adjustedCount: number
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
            {/* Le détail chiffré revient dans le sous-total juste dessous :
                ici le texte suffit, les pastilles alourdissaient la ligne. */}
            <p className="shrink-0 text-[0.8rem] tabular-nums">
              <span className="font-semibold text-accent">{formatQty(g.totalAsked)}</span>
              <span className="text-fg-subtle"> demandé</span>
              {g.totalServed > 0 ? (
                <>
                  <span className="mx-1.5 text-fg-subtle">·</span>
                  <span className="font-semibold text-ok">{formatQty(g.totalServed)}</span>
                  <span className="text-fg-subtle"> servi</span>
                </>
              ) : null}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {g.orders.map((o) => (
              <Link key={o.id} href={`${basePath}/${o.id}`}>
                <GlassCard hover className="h-full">
                  <div className="space-y-2 p-3">
                    {/* Le numéro de ticket tient la colonne de gauche et sert
                        de repère : le reste s'articule autour, sur deux lignes
                        au lieu de trois blocs empilés. */}
                    <div className="flex items-start gap-2.5">
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-xl text-[0.9rem] font-bold tabular-nums text-white"
                        style={{ background: g.department.color }}
                      >
                        {o.ticketNumber}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 truncate text-[0.88rem] font-bold leading-tight text-fg">
                            {o.createdBy.fullName}
                          </p>
                          <StatusBadge status={o.status} />
                        </div>
                        {/* La référence passe sous l'heure : à 390 px, les deux
                            sur une ligne poussaient le badge hors de la carte. */}
                        <p className="truncate text-[0.74rem] tabular-nums text-fg-subtle">
                          {formatInstantDate(o.createdAt)} à {formatTime(o.createdAt)}
                        </p>
                        <p className="truncate font-mono text-[0.7rem] text-fg-subtle">
                          {o.reference}
                        </p>
                      </div>
                    </div>

                    <div className="pl-[2.9rem]">
                      {/* Une barre par ticket : d'un regard sur la colonne on
                          voit lesquels avancent et lesquels stagnent. */}
                      {(() => {
                        const part = o.totalAsked > 0
                          ? Math.min(100, Math.round((o.totalServed / o.totalAsked) * 100))
                          : 0
                        return (
                          <>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgb(var(--glass-edge)/0.22)]">
                                <div
                                  className="h-full rounded-full bg-ok transition-[width] duration-500"
                                  style={{ width: `${part}%` }}
                                />
                              </div>
                              <span className="shrink-0 text-[0.72rem] font-semibold tabular-nums text-fg-muted">
                                {part}%
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.74rem] tabular-nums">
                              <span className="text-fg-subtle">
                                {o.lineCount} article{o.lineCount > 1 ? 's' : ''}
                              </span>
                              <span className="font-medium text-accent">
                                {formatQty(o.totalAsked)} demandé
                              </span>
                              {/* Ce qui cloche se signale ici, pas dans le détail. */}
                              {o.rejectedCount > 0 ? (
                                <span className="font-semibold text-danger">
                                  {o.rejectedCount} rupture{o.rejectedCount > 1 ? 's' : ''}
                                </span>
                              ) : null}
                              {o.adjustedCount > 0 ? (
                                <span className="font-medium text-warn">
                                  {o.adjustedCount} ajustée{o.adjustedCount > 1 ? 's' : ''}
                                </span>
                              ) : null}
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                </GlassCard>
              </Link>
            ))}
          </div>

          {/* Sous-total du département, entre ses tickets et le total du jour. */}
          <DepartmentTotal group={g} day={board.day} />
        </section>
      ))}
    </div>
  )
}

export { DayTotals } from './day-totals'
