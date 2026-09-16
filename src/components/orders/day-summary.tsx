import { AlertTriangle, CheckCircle2, Clock, Inbox, Building2, Layers } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass'
import { cn, formatQty } from '@/lib/utils'
import type { Board } from './day-board'

/**
 * En-tête de journée : l'état d'abord, les chiffres ensuite.
 *
 * Un tableau de bord doit répondre à « est-ce que ma journée va bien ? » avant
 * de détailler. Trois nombres neutres empilés ne le disaient pas : il fallait
 * ouvrir chaque ticket pour savoir si quelque chose clochait. La part servie
 * et les tickets en attente donnent maintenant cet état en un coup d'œil.
 */
export function DaySummary({ board }: { board: Board }) {
  const part = board.totalAsked > 0
    ? Math.min(100, Math.round((board.totalServed / board.totalAsked) * 100))
    : 0

  const ruptures = board.departments.reduce(
    (n, g) => n + g.orders.reduce((m, o) => m + o.rejectedCount, 0), 0,
  )
  const ajustes = board.departments.reduce(
    (n, g) => n + g.orders.reduce((m, o) => m + o.adjustedCount, 0), 0,
  )

  // Un ticket accepté mais dont rien n'est servi reste du travail en cours :
  // le compter comme conforme donnerait une fausse assurance.
  const enCours = board.departments.reduce(
    (n, g) => n + g.orders.filter((o) => o.status === 'ACCEPTED' && o.totalServed === 0).length,
    0,
  )

  // L'état dominant : ce qui appelle une action passe avant le reste.
  const etat = board.pendingCount > 0
    ? {
        ton: 'warn' as const,
        icone: Clock,
        titre: `${board.pendingCount} ticket${board.pendingCount > 1 ? 's' : ''} en attente`,
        detail: 'à prendre en charge par l’économat',
      }
    : enCours > 0
    ? {
        ton: 'warn' as const,
        icone: Clock,
        titre: `${enCours} ticket${enCours > 1 ? 's' : ''} à servir`,
        detail: 'acceptés par l’économat, rien n’est encore sorti',
      }
    : ruptures > 0
      ? {
          ton: 'danger' as const,
          icone: AlertTriangle,
          titre: `${ruptures} rupture${ruptures > 1 ? 's' : ''}`,
          detail: 'des articles n’ont pas pu être servis',
        }
      : board.orderCount === 0
        ? {
            ton: 'neutral' as const,
            icone: Inbox,
            titre: 'Aucune commande',
            detail: 'aucun département n’a commandé ce jour',
          }
        : {
            ton: 'ok' as const,
            icone: CheckCircle2,
            titre: 'Journée conforme',
            detail: ajustes > 0
              ? `${ajustes} ligne${ajustes > 1 ? 's' : ''} ajustée${ajustes > 1 ? 's' : ''}, aucune rupture`
              : 'tous les tickets traités, aucune rupture',
          }

  const TONS = {
    warn: 'border-warn/35 bg-warn/[0.09] text-warn',
    danger: 'border-danger/35 bg-danger/[0.09] text-danger',
    ok: 'border-ok/35 bg-ok/[0.09] text-ok',
    neutral: 'border-[rgb(var(--glass-edge)/0.3)] bg-white/50 text-fg-muted',
  }

  return (
    <div className="mb-4 space-y-3">
      {/* 1. L'état de la journée, en premier et en grand. */}
      <div className={cn('flex items-center gap-3 rounded-2xl border px-4 py-3', TONS[etat.ton])}>
        <etat.icone className="size-6 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[1.05rem] font-bold leading-tight">{etat.titre}</p>
          <p className="mt-0.5 text-[0.8rem] leading-snug opacity-80">{etat.detail}</p>
        </div>
      </div>

      {/* 2. L'avancement du service, seul chiffre qui se compare. */}
      {board.orderCount > 0 ? (
        <GlassCard>
          <div className="p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[0.74rem] font-semibold uppercase tracking-wide text-fg-subtle">
                Avancement du service
              </p>
              <p className="text-[0.78rem] tabular-nums text-fg-muted">
                <span className="text-[1.05rem] font-bold text-ok">{part}</span>
                <span className="text-fg-subtle"> %</span>
              </p>
            </div>

            <div
              className="mt-2 h-2.5 overflow-hidden rounded-full bg-[rgb(var(--glass-edge)/0.22)]"
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

            <p className="mt-2 text-[0.8rem] tabular-nums text-fg-muted">
              <span className="font-semibold text-ok">{formatQty(board.totalServed)}</span> servi
              <span className="mx-1.5 text-fg-subtle">sur</span>
              <span className="font-semibold text-accent">{formatQty(board.totalAsked)}</span> demandé
            </p>

            {/* 3. Le volume, en pied : l'information de contexte. */}
            <div className="mt-3 flex items-center gap-4 border-t border-[rgb(var(--glass-edge)/0.16)] pt-2.5 text-[0.78rem] tabular-nums text-fg-muted">
              <span className="flex items-center gap-1.5">
                <Inbox className="size-3.5 text-fg-subtle" />
                {board.orderCount} ticket{board.orderCount > 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1.5">
                <Building2 className="size-3.5 text-fg-subtle" />
                {board.departments.length} département{board.departments.length > 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1.5">
                <Layers className="size-3.5 text-fg-subtle" />
                {board.lineCount} ligne{board.lineCount > 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </GlassCard>
      ) : null}
    </div>
  )
}
