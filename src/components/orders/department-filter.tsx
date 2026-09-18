'use client'

import { useRouter } from 'next/navigation'
import { Icon } from '@/components/ui/icon'
import { cn, formatQty } from '@/lib/utils'
import type { BoardGroup } from './day-board'

/**
 * Filtre le tableau sur un département.
 *
 * Le filtre passe par l'URL plutôt que par un état local : la vue d'un
 * département reste ainsi partageable et survit à un rechargement, comme le
 * choix de la journée juste au-dessus.
 *
 * Seuls les départements ayant commandé sont proposés — un onglet qui ne
 * mènerait qu'à un écran vide n'aide personne.
 */
export function DepartmentFilter({
  groups, current, basePath, day, dayTo,
}: {
  groups: BoardGroup[]
  /** Identifiant du département filtré, null pour « tous ». */
  current: string | null
  basePath: string
  day: string
  dayTo?: string | null
}) {
  const router = useRouter()

  // Un seul département : l'onglet « Tous » et lui-même diraient la même chose.
  if (groups.length < 2) return null

  function go(dep: string | null) {
    const p = new URLSearchParams({ jour: day })
    if (dayTo) p.set('jusquau', dayTo)
    if (dep) p.set('dep', dep)
    router.push(`${basePath}?${p}`)
  }

  const totalTickets = groups.reduce((n, g) => n + g.orderCount, 0)

  return (
    <div className="scroll-x -mx-1 mb-4 flex gap-2 px-1 pb-1">
      <button
        type="button"
        onClick={() => go(null)}
        className={cn(
          'flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-[0.85rem] font-medium transition-colors sm:text-[0.83rem]',
          current === null
            ? 'border-accent/45 bg-accent/12 text-accent'
            : 'border-[rgb(var(--glass-edge)/0.28)] bg-white/50 text-fg-muted hover:bg-white/80',
        )}
      >
        Tous
        <span className="tabular-nums opacity-70">({totalTickets})</span>
      </button>

      {groups.map((g) => {
        const on = g.department.id === current
        return (
          <button
            key={g.department.id}
            type="button"
            onClick={() => go(g.department.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-[0.85rem] font-medium transition-colors sm:text-[0.83rem]',
              on
                ? 'border-accent/45 bg-accent/12 text-accent'
                : 'border-[rgb(var(--glass-edge)/0.28)] bg-white/50 text-fg-muted hover:bg-white/80',
            )}
            title={`${formatQty(g.totalAsked)} demandé`}
          >
            <span
              className="grid size-6 shrink-0 place-items-center rounded-lg text-white"
              style={{ background: g.department.color }}
            >
              <Icon name={g.department.icon ?? 'Building2'} className="size-3.5" />
            </span>
            {g.department.name}
            <span className="tabular-nums opacity-70">({g.orderCount})</span>
          </button>
        )
      })}
    </div>
  )
}
