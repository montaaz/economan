import Link from 'next/link'
import { Inbox, ChevronRight } from 'lucide-react'
import { GlassCard, EmptyState } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { StatusBadge } from '@/components/ui/status'
import { cn, formatInstantDate, formatShortDay, formatTime } from '@/lib/utils'
import { DepartmentTotal } from './department-total'
import { OrderDates } from './order-dates'

export type BoardOrder = {
  id: string
  reference: string
  ticketNumber: number
  businessDay: string
  rejectedCount: number
  adjustedCount: number
  validatedCount: number
  status: 'PENDING' | 'ACCEPTED' | 'DELIVERED' | 'RECEIVED' | 'CANCELLED'
  createdAt: string
  acceptedAt: string | null
  deliveredAt: string | null
  receivedAt: string | null
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
  dayTo: string
  isRange: boolean
  departments: BoardGroup[]
  orderCount: number
  lineCount: number
  totalAsked: number
  totalServed: number
  pendingCount: number
}

/** Nombre de journées distinctes représentées par une liste de tickets. */
function joursCouverts(orders: BoardOrder[]): number {
  return new Set(orders.map((o) => o.businessDay)).size
}

/**
 * Journée de service : un bloc par département, ses tickets en cartes, et le
 * total du département. Le total général est rendu à part, en pied de page.
 *
 * Chaque département est un panneau teinté de sa propre couleur : les blocs se
 * distinguaient auparavant par leur seul titre, ce qui obligeait à relire
 * l'en-tête pour savoir où l'on se trouvait en faisant défiler.
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
      {board.departments.map((g) => {
        const c = g.department.color
        return (
          <section
            key={g.department.id}
            className="overflow-hidden rounded-[calc(var(--radius)+4px)] border bg-white/45 backdrop-blur-xl"
            style={{ borderColor: `${c}33` }}
          >
            {/* En-tête : le département donne son nom et sa couleur au bloc. */}
            <header
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-3.5 py-3 sm:px-4"
              style={{
                borderColor: `${c}26`,
                background: `linear-gradient(120deg, ${c}1f, ${c}0a 70%, transparent)`,
              }}
            >
              <h2 className="flex min-w-0 items-center gap-2.5">
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-sm"
                  style={{ background: `linear-gradient(140deg, ${c}, ${c}bb)` }}
                >
                  <Icon name={g.department.icon ?? 'Building2'} className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[1.15rem] font-bold leading-tight tracking-tight text-fg sm:text-[1.05rem]">
                    {g.department.name}
                  </span>
                  <span className="block text-[0.85rem] tabular-nums text-fg-muted sm:text-[0.78rem]">
                    {g.orderCount} ticket{g.orderCount > 1 ? 's' : ''} · {g.lineCount} ligne
                    {g.lineCount > 1 ? 's' : ''}
                    {board.isRange ? ` · ${joursCouverts(g.orders)} jour${joursCouverts(g.orders) > 1 ? 's' : ''}` : ''}
                  </span>
                </span>
              </h2>

              {/* La part servie plutôt qu'un total : on ne cumule pas des
                  kilos avec des litres. */}
              <p className="shrink-0 text-right text-[0.9rem] tabular-nums sm:text-[0.82rem]">
                <span className="font-bold text-ok">
                  {g.totalAsked > 0
                    ? Math.min(100, Math.round((g.totalServed / g.totalAsked) * 100))
                    : 0}%
                </span>
                <span className="text-fg-subtle"> servi</span>
              </p>
            </header>

            <div className="grid gap-2.5 p-3 sm:grid-cols-2 sm:p-3.5 xl:grid-cols-3">
              {g.orders.map((o) => (
                <TicketCard
                  key={o.id}
                  order={o}
                  color={c}
                  href={`${basePath}/${o.id}`}
                  showDay={board.isRange}
                />
              ))}
            </div>

            {/* Sous-total du département, en pied de son propre bloc. */}
            <DepartmentTotal
              group={g}
              day={board.day}
              dayTo={board.isRange ? board.dayTo : null}
            />
          </section>
        )
      })}
    </div>
  )
}

/**
 * Teinte de fond par état, la même que sur l'écran du département : un ticket
 * garde la même couleur d'un bout à l'autre de la chaîne, que ce soit
 * l'employé, l'économat ou l'administration qui le regarde.
 */
const CARTE: Record<BoardOrder['status'], string> = {
  PENDING: 'bg-warn/[0.20] border-warn/40',
  ACCEPTED: 'bg-danger/[0.16] border-danger/40',
  // Bleu et vert foncés : une teinte claire poussée en opacité se délave au
  // lieu de foncer, d'où ces couleurs posées explicitement.
  DELIVERED: 'bg-[#1e4d8f]/[0.24] border-[#1e4d8f]/50',
  RECEIVED: 'bg-[#0b6b4a]/[0.24] border-[#0b6b4a]/50',
  CANCELLED: 'bg-[rgb(var(--glass-edge)/0.16)] border-[rgb(var(--glass-edge)/0.35)]',
}

/**
 * Carte d'un ticket. La barre d'avancement longe le bord gauche : sur une
 * colonne de cartes, les tickets qui stagnent se repèrent sans lire un chiffre.
 */
function TicketCard({
  order: o, color, href, showDay,
}: {
  order: BoardOrder
  color: string
  href: string
  /** Sur une période, la journée du ticket devient une information utile. */
  showDay?: boolean
}) {
  const part = o.totalAsked > 0
    ? Math.min(100, Math.round((o.totalServed / o.totalAsked) * 100))
    : 0

  // Une jauge vide se confond avec une bordure : un ticket dont rien n'est
  // sorti serait passé inaperçu alors que c'est lui qui appelle une action.
  // Le rail se colore donc selon l'état, et le remplissage mesure l'avancée.
  const rien = part === 0
  const encart = o.status === 'CANCELLED'
    ? 'bg-[rgb(var(--glass-edge)/0.3)]'
    : rien
      ? 'bg-warn/30'
      : 'bg-[rgb(var(--glass-edge)/0.2)]'

  return (
    <Link
      href={href}
      className={cn(
        'group relative flex overflow-hidden rounded-xl border transition-[transform,box-shadow,border-color] duration-200',
        'hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-12px_rgb(var(--shadow-ambient)/0.4)]',
        CARTE[o.status],
      )}
    >
      {/* Jauge verticale : le remplissage EST l'avancement. */}
      <span aria-hidden className={cn('relative w-1.5 shrink-0', encart)}>
        {rien ? (
          // À 0 %, la couleur seule porte le message : rien à remplir.
          <span className="absolute inset-0 bg-warn/70" />
        ) : (
          <span
            className="absolute inset-x-0 bottom-0 rounded-t-full bg-ok transition-[height] duration-500"
            style={{ height: `${part}%` }}
          />
        )}
      </span>

      <div className="min-w-0 flex-1 p-3">
        <div className="flex items-start gap-2.5">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl text-[1rem] font-bold tabular-nums text-white shadow-sm sm:size-9 sm:text-[0.9rem]"
            style={{ background: `linear-gradient(140deg, ${color}, ${color}c4)` }}
          >
            {o.ticketNumber}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-[1rem] font-bold leading-tight text-fg sm:text-[0.92rem]">
                {o.createdBy.fullName}
              </p>
              <StatusBadge status={o.status} />
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[0.85rem] tabular-nums text-fg-muted sm:text-[0.78rem]">
              {/* Sur une période, deux tickets numérotés « 1 » coexistent :
                  sans sa journée, la carte devient ambiguë. */}
              {showDay ? (
                <span className="rounded-md bg-[rgb(var(--glass-edge)/0.22)] px-1.5 font-semibold capitalize text-fg">
                  {formatShortDay(o.businessDay)}
                </span>
              ) : null}
              <span className="truncate">
                {formatInstantDate(o.createdAt)} à {formatTime(o.createdAt)}
              </span>
            </p>
            <p className="truncate font-mono text-[0.78rem] text-fg-subtle sm:text-[0.72rem]">{o.reference}</p>
            {/* Les quatre moments, nommés : sans intitulé, une suite d'heures
                ne dit pas de quoi elle parle. */}
            <OrderDates order={o} compact className="mt-1" />
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-[rgb(var(--glass-edge)/0.16)] pt-2.5 text-[0.85rem] tabular-nums sm:text-[0.78rem]">
          <span className={cn('font-bold', rien ? 'text-warn' : 'text-ok')}>
            {part}
            <span className={rien ? 'text-warn/70' : 'text-ok/70'}>%</span>
            <span className="font-normal text-fg-subtle"> servi</span>
          </span>
          <span className="text-fg-subtle">
            {o.lineCount} article{o.lineCount > 1 ? 's' : ''}
          </span>
          {/* Ce qui cloche se signale ici, pas dans le détail. */}
          {o.rejectedCount > 0 ? (
            <span className="rounded-full bg-danger/12 px-1.5 font-semibold text-danger">
              {o.rejectedCount} rupture{o.rejectedCount > 1 ? 's' : ''}
            </span>
          ) : null}
          {o.adjustedCount > 0 ? (
            <span className="rounded-full bg-warn/14 px-1.5 font-medium text-warn">
              {o.adjustedCount} ajustée{o.adjustedCount > 1 ? 's' : ''}
            </span>
          ) : null}
          {/* Et ce qui va bien : sans lui, deux comptes rouges sur une carte
              laissaient croire que tout le ticket posait problème. */}
          {o.validatedCount > 0 ? (
            <span className="rounded-full bg-ok/14 px-1.5 font-medium text-ok">
              {o.validatedCount} conforme{o.validatedCount > 1 ? 's' : ''}
            </span>
          ) : null}

          <ChevronRight className="ml-auto size-4 shrink-0 text-fg-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-accent" />
        </div>
      </div>
    </Link>
  )
}

export { DayTotals } from './day-totals'
