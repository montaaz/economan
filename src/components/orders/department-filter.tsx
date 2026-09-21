'use client'

import { useRouter } from 'next/navigation'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import type { BoardGroup } from './day-board'

/**
 * Filtre le tableau sur un département.
 *
 * Le filtre passe par l'URL plutôt que par un état local : la vue d'un
 * département reste ainsi partageable et survit à un rechargement, comme le
 * choix de la journée juste au-dessus.
 *
 * Tous les départements actifs sont proposés, avec leur nombre de tickets.
 * Masquer ceux qui n'ont pas commandé ferait disparaître la barre les jours
 * creux, au moment précis où l'on cherche qui n'a rien passé.
 */
export function DepartmentFilter({
  departments, groups, counts, current, basePath, day, dayTo, keep,
}: {
  /** Tous les départements actifs, qu'ils aient commandé ou non. */
  departments: { id: string; name: string; color: string; icon: string | null }[]
  groups: BoardGroup[]
  /**
   * Ce que chaque pastille annonce, si ce n'est pas le nombre de tickets.
   * L'écran des écarts compte des lignes à servir, pas des commandes.
   */
  counts?: Map<string, number>
  /** Identifiant du département filtré, null pour « tous ». */
  current: string | null
  basePath: string
  day: string
  dayTo?: string | null
  /** Autres filtres actifs à conserver en changeant de service. */
  keep?: Record<string, string | null | undefined>
}) {
  const router = useRouter()

  // Compteur de tickets par département, 0 pour ceux qui n'ont rien commandé.
  const ticketsBy = counts ?? new Map(groups.map((g) => [g.department.id, g.orderCount]))

  function go(dep: string | null) {
    const p = new URLSearchParams({ jour: day })
    if (dayTo) p.set('jusquau', dayTo)
    if (dep) p.set('dep', dep)
    // Changer de service ne doit pas lever le filtre par écart : on reste
    // dans la même question, posée à un autre rayon.
    for (const [k, v] of Object.entries(keep ?? {})) if (v) p.set(k, v)
    router.push(`${basePath}?${p}`)
  }

  const totalTickets = counts
    ? [...counts.values()].reduce((n, v) => n + v, 0)
    : groups.reduce((n, g) => n + g.orderCount, 0)

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

      {departments.map((d) => {
        const on = d.id === current
        const tickets = ticketsBy.get(d.id) ?? 0
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => go(d.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-[0.85rem] font-medium transition-colors sm:text-[0.83rem]',
              on
                ? 'border-accent/45 bg-accent/12 text-accent'
                : 'border-[rgb(var(--glass-edge)/0.28)] bg-white/50 text-fg-muted hover:bg-white/80',
              // Un département sans ticket reste cliquable — il faut pouvoir
              // constater qu'il n'a rien commandé — mais s'efface.
              tickets === 0 && !on && 'opacity-55',
            )}
          >
            <span
              className="grid size-6 shrink-0 place-items-center rounded-lg text-white"
              style={{ background: d.color }}
            >
              <Icon name={d.icon ?? 'Building2'} className="size-3.5" />
            </span>
            {d.name}
            <span className="tabular-nums opacity-70">({tickets})</span>
          </button>
        )
      })}
    </div>
  )
}
