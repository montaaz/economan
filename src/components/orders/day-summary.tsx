import { AlertTriangle, CalendarRange, CheckCircle2, Clock, Inbox, Building2, Layers, TrendingUp } from 'lucide-react'
import { cn, countDays, formatQty, formatPeriod } from '@/lib/utils'
import type { Board } from './day-board'

/**
 * Bandeau de tête : un seul bloc qui porte la journée, son état et son
 * avancement.
 *
 * Empiler un bandeau d'état puis une carte d'avancement puis des compteurs
 * donnait trois blocs de même poids : l'œil n'avait pas de point d'entrée.
 * Tout est réuni ici dans un panneau sombre — le seul de la page — pour que le
 * regard s'y pose d'abord, et le reste de l'écran redevient une liste.
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
            detail: board.isRange
              ? 'aucun département n’a commandé sur cette période'
              : 'aucun département n’a commandé ce jour',
          }
        : {
            ton: 'ok' as const,
            icone: CheckCircle2,
            titre: 'Journée conforme',
            detail: ajustes > 0
              ? `${ajustes} ligne${ajustes > 1 ? 's' : ''} ajustée${ajustes > 1 ? 's' : ''}, aucune rupture`
              : 'tous les tickets traités, aucune rupture',
          }

  // Sur fond sombre, les tons de la charte manquent de luminance : on éclaircit.
  const TONS = {
    warn: 'border-[#f3a850]/40 bg-[#f3a850]/12 text-[#ffc987]',
    danger: 'border-[#e8657c]/40 bg-[#e8657c]/12 text-[#ff9aab]',
    ok: 'border-[#2fc48f]/40 bg-[#2fc48f]/12 text-[#6ee7b7]',
    neutral: 'border-white/14 bg-white/[0.06] text-white/70',
  }

  return (
    <section
      className={cn(
        'relative mb-5 overflow-hidden rounded-[calc(var(--radius)+6px)]',
        'border border-white/12 text-white',
        'shadow-[0_24px_60px_-22px_rgb(var(--shadow-ambient)/0.55),0_6px_18px_-8px_rgb(var(--shadow-ambient)/0.3)]',
      )}
      style={{
        background:
          'linear-gradient(150deg, #16305c 0%, #0f2247 55%, #0b1830 100%)',
      }}
    >
      {/* Halo spéculaire : le même vocabulaire de verre, en version nuit. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(38rem 20rem at 8% -30%, rgb(106 168 242 / 0.4), transparent 62%),' +
            'radial-gradient(28rem 18rem at 98% 0%, rgb(47 196 143 / 0.16), transparent 60%)',
        }}
      />

      <div className="relative z-[1] p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-8">
          {/* Colonne gauche : la journée et son état. */}
          <div className="min-w-0 flex-1">
            <p className="text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-white/50 sm:text-[0.72rem]">
              {board.isRange
                ? `Période · ${countDays(board.day, board.dayTo)} journées`
                : 'Journée de service'}
            </p>
            {/* `capitalize` met une majuscule à chaque mot : « Du 12 Au 14 ».
                On ne capitalise que la première lettre. */}
            <h2 className="mt-1 text-[1.55rem] font-bold leading-tight tracking-tight first-letter:uppercase sm:text-[1.7rem]">
              {formatPeriod(board.day, board.dayTo)}
            </h2>

            <div
              className={cn(
                'mt-3.5 inline-flex max-w-full items-center gap-2.5 rounded-xl border px-3 py-2',
                TONS[etat.ton],
              )}
            >
              <etat.icone className="size-5 shrink-0" />
              <span className="min-w-0">
                <span className="block text-[1.02rem] font-bold leading-tight sm:text-[0.95rem]">{etat.titre}</span>
                <span className="block text-[0.86rem] leading-snug opacity-80 sm:text-[0.8rem]">{etat.detail}</span>
              </span>
            </div>
          </div>

          {/* Colonne droite : l'avancement, chiffre unique et dominant. */}
          {board.orderCount > 0 ? (
            <div className="w-full shrink-0 lg:w-[22rem]">
              <div className="flex items-end justify-between gap-3">
                <span className="text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-white/50 sm:text-[0.72rem]">
                  Avancement du service
                </span>
                <span className="flex items-baseline gap-1 leading-none">
                  <span className="text-[3rem] font-bold tabular-nums tracking-tighter text-[#6ee7b7] sm:text-[2.6rem]">
                    {part}
                  </span>
                  <span className="text-[1.15rem] font-semibold text-white/45 sm:text-[1rem]">%</span>
                </span>
              </div>

              <div
                className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/12"
                role="meter"
                aria-valuenow={part}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${part}% de la quantité commandée a été servie`}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2fc48f] to-[#6ee7b7] transition-[width] duration-500"
                  style={{ width: `${part}%` }}
                />
              </div>

              <p className="mt-2.5 text-[0.95rem] tabular-nums text-white/70 sm:text-[0.85rem]">
                <span className="font-bold text-[#6ee7b7]">{formatQty(board.totalServed)}</span> servi
                <span className="mx-1.5 text-white/30">sur</span>
                <span className="font-bold text-white/90">{formatQty(board.totalAsked)}</span> commandé
              </p>
            </div>
          ) : null}
        </div>

        {/* Pied : le volume, information de contexte. */}
        {board.orderCount > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-4">
            <Chiffre icon={Inbox} valeur={board.orderCount} libelle="tickets" />
            {/* Sur une période, savoir combien de journées portent ces tickets
                vaut mieux que de répéter le nombre de départements. */}
            {board.isRange ? (
              <Chiffre
                icon={CalendarRange}
                valeur={countDays(board.day, board.dayTo)}
                libelle="journées"
              />
            ) : (
              <Chiffre icon={Building2} valeur={board.departments.length} libelle="départements" />
            )}
            <Chiffre icon={Layers} valeur={board.lineCount} libelle="lignes" />
            <Chiffre
              icon={TrendingUp}
              valeur={formatQty(board.totalAsked)}
              libelle="quantité commandée"
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}

function Chiffre({
  icon: Icone, valeur, libelle,
}: {
  icon: typeof Inbox
  valeur: number | string
  libelle: string
}) {
  return (
    <div className="bg-[#0f2247]/70 px-3 py-3 sm:py-2.5">
      <p className="flex items-center gap-1.5 text-[0.74rem] font-medium uppercase tracking-wide text-white/45 sm:text-[0.68rem]">
        <Icone className="size-3.5" />
        {libelle}
      </p>
      <p className="mt-1 text-[1.3rem] font-bold tabular-nums leading-none text-white sm:text-[1.15rem]">
        {valeur}
      </p>
    </div>
  )
}
