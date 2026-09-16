import { Inbox, Building2, Layers, TrendingUp } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass'
import { cn, formatQty } from '@/lib/utils'
import type { Board } from './day-board'

/**
 * Résumé de la journée, en une bande.
 *
 * Quatre tuiles en grille occupaient presque un écran de téléphone pour quatre
 * nombres. Ici les chiffres sont alignés sur une seule ligne, et la part servie
 * se lit d'un coup grâce à la barre de progression — ce qu'un pourcentage écrit
 * en toutes lettres ne donnait pas.
 */
export function DaySummary({ board }: { board: Board }) {
  const part = board.totalAsked > 0
    ? Math.min(100, Math.round((board.totalServed / board.totalAsked) * 100))
    : 0

  const chiffres = [
    {
      label: 'Tickets',
      value: board.orderCount,
      icon: Inbox,
      detail: board.pendingCount > 0 ? `${board.pendingCount} en attente` : 'tous traités',
      alerte: board.pendingCount > 0,
    },
    {
      label: 'Départements',
      value: board.departments.length,
      icon: Building2,
      detail: 'ayant commandé',
    },
    {
      label: 'Lignes',
      value: board.lineCount,
      icon: Layers,
      detail: 'articles',
    },
  ]

  return (
    <GlassCard className="mb-4">
      <div className="divide-y divide-[rgb(var(--glass-edge)/0.14)] sm:flex sm:divide-x sm:divide-y-0">
        {chiffres.map((c) => (
          <div key={c.label} className="flex items-center gap-3 px-4 py-3 sm:flex-1 sm:py-4">
            <span
              className={cn(
                'grid size-9 shrink-0 place-items-center rounded-xl',
                c.alerte ? 'bg-warn/12 text-warn' : 'bg-[rgb(var(--glass-edge)/0.16)] text-fg-muted',
              )}
            >
              <c.icon className="size-[1.05rem]" />
            </span>
            <div className="min-w-0">
              <p className="flex items-baseline gap-1.5">
                <span className="text-[1.35rem] font-bold leading-none tabular-nums text-fg">
                  {c.value}
                </span>
                <span className="truncate text-[0.74rem] font-medium uppercase tracking-wide text-fg-subtle">
                  {c.label}
                </span>
              </p>
              <p
                className={cn(
                  'mt-0.5 truncate text-[0.74rem]',
                  c.alerte ? 'font-medium text-warn' : 'text-fg-subtle',
                )}
              >
                {c.detail}
              </p>
            </div>
          </div>
        ))}

        {/* La part servie : le seul chiffre qui appelle une comparaison. */}
        <div className="px-4 py-3 sm:flex-[1.4] sm:py-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="flex items-baseline gap-1.5">
              <span className="text-[1.35rem] font-bold leading-none tabular-nums text-ok">
                {formatQty(board.totalServed)}
              </span>
              <span className="text-[0.74rem] font-medium uppercase tracking-wide text-fg-subtle">
                servi
              </span>
            </p>
            <p className="text-[0.78rem] tabular-nums text-fg-muted">
              sur {formatQty(board.totalAsked)}
            </p>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-[rgb(var(--glass-edge)/0.2)]"
            role="meter"
            aria-valuenow={part}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${part}% de la quantité demandée a été servie`}
          >
            <div
              className="h-full rounded-full bg-ok transition-[width] duration-500"
              style={{ width: `${part}%` }}
            />
          </div>
        </div>
      </div>
    </GlassCard>
  )
}
