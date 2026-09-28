import * as React from 'react'
import Link from 'next/link'
import {
  Inbox, ChevronRight, PackagePlus, PackageCheck, UserCheck, Truck, CheckCircle2, MessageSquareWarning,
  Siren,
} from 'lucide-react'
import { GlassCard, EmptyState, Badge } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { StatusBadge } from '@/components/ui/status'
import { cn, formatInstantDate, formatShortDay, formatTime } from '@/lib/utils'
import { DepartmentTotal } from './department-total'
import { OrderDates } from './order-dates'
import { ReopenRefill } from './reopen-refill'
import { ReopenOrder } from './reopen-order'
import { OrderDeletionProvider, Dissolvable, DeleteOrdersButton, DeleteSuiteButton } from './order-deletion'

/** Un servi complémentaire, tel que le tableau le montre en carte. */
export type BoardRefill = {
  id: string
  rank: number
  createdAt: string
  receivedAt: string | null
  /** Quand son bon a été émis ; nul tant qu'il n'est qu'enregistré, ou rouvert. */
  deliveredAt: string | null
  receptionNote: string | null
  lineCount: number
  createdBy: { fullName: string } | null
  receivedBy: { fullName: string } | null
}

export type BoardOrder = {
  id: string
  reference: string
  ticketNumber: number
  businessDay: string
  rejectedCount: number
  adjustedCount: number
  validatedCount: number
  /** Remarque du département à la réception, s'il en a laissé une. */
  receptionNote: string | null
  status: 'PENDING' | 'ACCEPTED' | 'DELIVERED' | 'RECEIVED' | 'CANCELLED'
  /** Commande urgente de l'administration : bordure bordeaux, badge. */
  isUrgent?: boolean
  createdAt: string
  /** Les passages complémentaires : la page des écarts imprime le dernier. */
  lastRefillRank: number
  refills: BoardRefill[]
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
export type EmptyDepartment = { id: string; name: string; color: string; icon: string | null }

export function DayBoard({
  board, basePath, admin = false, vides = [],
}: {
  board: Board
  basePath: string
  /** L'administration : elle seule rouvre un servi dont le bon est émis. */
  admin?: boolean
  /** Les services qui n'ont encore rien commandé : leur espace du jour reste ouvert, vide. */
  vides?: EmptyDepartment[]
}) {
  if (board.departments.length === 0 && vides.length === 0) {
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

  const tous = board.departments.flatMap((g) => g.orders.map((o) => o.id))
  // Les cartes : un ticket, plus sa suite quand il en a une.
  const nbCartes = (orders: BoardOrder[]) => orders.reduce((n, o) => n + 1 + (o.refills.length > 0 ? 1 : 0), 0)
  return (
    <OrderDeletionProvider>
    <div className="space-y-5">
      {/* L'administration peut vider la journée d'un geste : la question
          posée avant dit combien de tickets partent. */}
      {admin && tous.length > 1 ? (
        <div className="flex justify-end">
          <DeleteOrdersButton variant="text" ids={tous} intitule="de la journée" cartes={nbCartes(board.departments.flatMap((g) => g.orders))} />
        </div>
      ) : null}
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
                  <span className="block text-[0.85rem] font-medium tabular-nums text-fg sm:text-[0.78rem]">
                    {g.orderCount} ticket{g.orderCount > 1 ? 's' : ''} · {g.lineCount} ligne
                    {g.lineCount > 1 ? 's' : ''}
                    {board.isRange ? ` · ${joursCouverts(g.orders)} jour${joursCouverts(g.orders) > 1 ? 's' : ''}` : ''}
                  </span>
                </span>
              </h2>

              {/* La part servie plutôt qu'un total : on ne cumule pas des
                  kilos avec des litres. */}
              <div className="flex shrink-0 items-center gap-3">
                {admin ? <DeleteOrdersButton variant="text" ids={g.orders.map((o) => o.id)} intitule={`du ${g.department.name}`} cartes={nbCartes(g.orders)} /> : null}
                <p className="text-right text-[0.9rem] tabular-nums sm:text-[0.82rem]">
                  <span className="font-bold text-ok">
                    {g.totalAsked > 0
                      ? Math.min(100, Math.round((g.totalServed / g.totalAsked) * 100))
                      : 0}%
                  </span>
                  <span className="font-medium text-fg"> servi</span>
                </p>
              </div>
            </header>

            <div className="grid gap-2.5 p-3 sm:grid-cols-2 sm:p-3.5 xl:grid-cols-3">
              {g.orders.map((o) => (
                <React.Fragment key={o.id}>
                  <Dissolvable id={o.id} color={c}>
                  <TicketCard
                    order={o}
                    color={c}
                    href={`${basePath}/${o.id}`}
                    showDay={board.isRange}
                    admin={admin}
                  />
                  </Dissolvable>
                  {/* Tout ce qui suit le premier servi tient sur une seule
                      carte, à côté du ticket : la suite de commande. Elle
                      s'ouvre sur la fiche qui montre chaque passage et chaque
                      article, du 1ᵉʳ servi au dernier. */}
                  {o.refills.length > 0 ? (
                    <Dissolvable id={`${o.id}:suite`} color={c}>
                    <SuiteCard
                      order={o}
                      color={c}
                      showDay={board.isRange}
                      admin={admin}
                      href={`${basePath}/${o.id}/suite`}
                    />
                    </Dissolvable>
                  ) : null}
                </React.Fragment>
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

      {/* Les services sans ticket gardent leur place sur le tableau : on voit
          d'un coup d'œil qui n'a pas encore commandé, et la journée se lit
          service par service, pas seulement par ce qui est déjà arrivé. */}
      {vides.map((d) => (
        <section
          key={`vide-${d.id}`}
          className="overflow-hidden rounded-[calc(var(--radius)+4px)] border border-dashed bg-white/30 backdrop-blur-xl"
          style={{ borderColor: `${d.color}55` }}
        >
          <header
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-dashed px-3.5 py-3 sm:px-4"
            style={{ borderColor: `${d.color}33`, background: `linear-gradient(120deg, ${d.color}12, transparent 70%)` }}
          >
            <h2 className="flex min-w-0 items-center gap-2.5">
              <span
                className="grid size-10 shrink-0 place-items-center rounded-xl text-white opacity-80 shadow-sm"
                style={{ background: `linear-gradient(140deg, ${d.color}, ${d.color}bb)` }}
              >
                <Icon name={d.icon ?? 'Building2'} className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[1.15rem] font-bold leading-tight tracking-tight text-fg sm:text-[1.05rem]">
                  {d.name}
                </span>
                <span className="block text-[0.85rem] font-medium text-fg-muted sm:text-[0.78rem]">
                  Aucun ticket pour l’instant
                </span>
              </span>
            </h2>
            <p className="shrink-0 text-right text-[0.9rem] tabular-nums text-fg-subtle sm:text-[0.82rem]">
              <span className="font-bold">—</span>
              <span className="font-medium"> servi</span>
            </p>
          </header>
          <div className="grid gap-2.5 p-3 sm:grid-cols-2 sm:p-3.5 xl:grid-cols-3">
            <div
              className="flex min-h-[7.5rem] items-center gap-3 rounded-xl border border-dashed p-3 text-fg-muted"
              style={{ borderColor: `${d.color}66`, background: `${d.color}0a` }}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-dashed" style={{ borderColor: `${d.color}80`, color: d.color }}>
                <Inbox className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[0.92rem] font-semibold text-fg">Espace de la journée</span>
                <span className="block text-[0.8rem]">
                  La commande de {d.name} apparaîtra ici dès qu’elle sera envoyée.
                </span>
              </span>
            </div>
          </div>
        </section>
      ))}
    </div>
    </OrderDeletionProvider>
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
  order: o, color, href, showDay, admin = false,
}: {
  order: BoardOrder
  color: string
  href: string
  /** Sur une période, la journée du ticket devient une information utile. */
  showDay?: boolean
  /** L'administration : elle seule rouvre ou referme une commande livrée. */
  admin?: boolean
}) {
  // Rouverte : rendue à l'état accepté alors que son bon était émis. Le
  // ticket le dit, pour que l'économat sache qu'il peut y revenir.
  const rouverte = o.status === 'ACCEPTED' && !!o.deliveredAt
  const gerable = admin && (o.status === 'DELIVERED' || o.status === 'RECEIVED' || rouverte)
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
    // La carte est le conteneur ; le lien n'en est que le contenu. Le bouton
    // de l'administration vit à côté, dans sa propre colonne : posé par-dessus
    // en absolu, il recouvrait les comptes.
    <div
      className={cn(
        'group relative flex h-full overflow-hidden rounded-xl border transition-[transform,box-shadow,border-color] duration-200',
        'hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-12px_rgb(var(--shadow-ambient)/0.4)]',
        CARTE[o.status],
        // Urgente : la carte garde la teinte de son état, mais son contour
        // pulse en néon rouge — c'est elle qu'on doit voir en premier.
        o.isUrgent && 'border-2 border-[#c8102e] animate-neon-urgent',
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

      <div className="flex min-w-0 flex-1 flex-col">
      <Link href={href} className="min-w-0 flex-1 p-3">
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
              <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                {o.isUrgent ? (
                  <span className="animate-neon-badge inline-flex items-center gap-1 rounded-full bg-[#c8102e] px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-white">
                    <Siren className="size-3" aria-hidden="true" />
                    Urgent
                  </span>
                ) : null}
                {rouverte ? (
                  <Badge tone="warn" icon={<PackagePlus className="size-3.5" aria-hidden="true" />}>Rouverte</Badge>
                ) : (
                  <StatusBadge status={o.status} />
                )}
              </span>
            </div>
            {/* En noir et gras : sur les fonds colorés des cartes, le gris se
                lisait mal. */}
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[0.88rem] font-semibold tabular-nums text-fg sm:text-[0.82rem]">
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
            <p className="truncate font-mono text-[0.82rem] font-bold text-fg sm:text-[0.76rem]">{o.reference}</p>
            {/* Les quatre moments, nommés : sans intitulé, une suite d'heures
                ne dit pas de quoi elle parle. */}
            <OrderDates order={o} compact className="mt-1" />
            {/* La remarque du département à la réception : c'est le seul
                signal qu'il envoie quand quelque chose n'allait pas. */}
            {o.receptionNote ? (
              <p className="mt-1 flex items-start gap-1 text-[0.76rem] font-medium leading-snug text-danger">
                <MessageSquareWarning className="mt-px size-3.5 shrink-0" />
                {o.receptionNote}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-[rgb(var(--glass-edge)/0.16)] pt-2.5 text-[0.85rem] tabular-nums sm:text-[0.78rem]">
          <span className={cn('font-bold', rien ? 'text-warn' : 'text-ok')}>
            {part}
            <span className={rien ? 'text-warn/70' : 'text-ok/70'}>%</span>
            <span className="font-medium text-fg"> servi</span>
          </span>
          <span className="font-medium text-fg">
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
      </Link>

      {/* Le geste de l'administration, en pied de carte : une ligne à lui,
          sous les comptes, qui ne rogne rien et ne recouvre rien. */}
      {admin ? (
        <div className="flex items-center justify-between gap-2 border-t border-[rgb(var(--glass-edge)/0.18)] px-3 py-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-fg-subtle">Administration</span>
          <span className="flex items-center gap-1.5">
            {gerable ? <ReopenOrder id={o.id} reference={o.reference} ouverte={rouverte} recue={!!o.receivedAt} /> : null}
            <DeleteOrdersButton ids={[o.id]} intitule={o.reference} />
          </span>
        </div>
      ) : null}
      </div>
    </div>
  )
}

/**
 * Carte de la suite d'une commande : tous les passages après le premier.
 *
 * Une carte par passage encombrait le tableau — trois servis, trois
 * cartes — sans rien dire de plus qu'une ligne chacun. Celle-ci les résume,
 * teintée comme le passage le moins avancé : reçu partout en vert, un bon
 * en route en bleu, un passage encore ouvert en orange.
 */
function SuiteCard({
  order: o, color, showDay, admin = false, href,
}: {
  order: BoardOrder
  color: string
  showDay?: boolean
  admin?: boolean
  href: string
}) {
  const servis = [...o.refills].sort((a, b) => a.rank - b.rank)
  const recus = servis.filter((r) => r.receivedAt).length
  const ouverts = servis.filter((r) => !r.deliveredAt).length
  const enRoute = servis.length - recus - ouverts
  const articles = servis.reduce((n, r) => n + r.lineCount, 0)
  const dernier = servis[servis.length - 1]
  const etat: BoardOrder['status'] = ouverts > 0 ? 'ACCEPTED' : enRoute > 0 ? 'DELIVERED' : 'RECEIVED'
  return (
    <div
      className={cn(
        'group relative flex h-full overflow-hidden rounded-xl border transition-[transform,box-shadow,border-color] duration-200',
        'hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-12px_rgb(var(--shadow-ambient)/0.4)]',
        CARTE[etat],
        // Une commande urgente le reste jusqu'au bout : sa suite porte le
        // même bordeaux que son ticket, et se nomme comme lui.
        o.isUrgent && 'border-2 border-[#c8102e] animate-neon-urgent',
      )}
    >
      <span aria-hidden className={cn('w-1.5 shrink-0', ouverts > 0 ? 'bg-warn/70' : 'bg-ok')} />
      <div className="flex min-w-0 flex-1 flex-col">
      <Link href={href} className="min-w-0 flex-1 p-3">
        <div className="flex items-start gap-2.5">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-sm sm:size-9"
            style={{ background: o.isUrgent ? 'linear-gradient(140deg, #8b1e2d, #b3384a)' : `linear-gradient(140deg, ${color}, ${color}c4)` }}
          >
            {o.isUrgent ? <Siren className="size-5 sm:size-4" /> : <PackagePlus className="size-5 sm:size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-[1rem] font-bold leading-tight text-fg sm:text-[0.92rem]">
                {o.isUrgent ? 'Commande urgente' : 'Suite de commande'}
                <span className="ml-1.5 font-semibold text-fg-muted">{servis.length} servi{servis.length > 1 ? 's' : ''}</span>
              </p>
              <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
              {o.isUrgent ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#8b1e2d] px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-white">
                  <Siren className="size-3" aria-hidden="true" />
                  Urgent
                </span>
              ) : null}
              {ouverts > 0 ? (
                <Badge tone="warn" icon={<PackagePlus className="size-3.5" aria-hidden="true" />}>Ouvert</Badge>
              ) : recus === servis.length ? (
                <Badge tone="ok" icon={<CheckCircle2 className="size-3.5" aria-hidden="true" />}>Reçu</Badge>
              ) : (
                <Badge tone="info" icon={<Truck className="size-3.5" aria-hidden="true" />}>Livré</Badge>
              )}
              </span>
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[0.88rem] font-semibold tabular-nums text-fg sm:text-[0.82rem]">
              {showDay ? (
                <span className="rounded-md bg-[rgb(var(--glass-edge)/0.22)] px-1.5 font-semibold capitalize text-fg">{formatShortDay(o.businessDay)}</span>
              ) : null}
              <span className="truncate">dernier servi {formatInstantDate(dernier.createdAt)} à {formatTime(dernier.createdAt)}</span>
            </p>
            <p className="truncate font-mono text-[0.82rem] font-bold text-fg sm:text-[0.76rem]">{o.reference}</p>
            {/* Chaque passage, en une pastille : son rang, son heure, son état. */}
            <p className="mt-1.5 flex flex-wrap gap-1">
              {servis.map((r) => (
                <span key={r.id} className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.72rem] font-semibold tabular-nums',
                  r.receivedAt ? 'bg-ok/14 text-ok' : r.deliveredAt ? 'bg-info/14 text-info' : 'bg-warn/16 text-warn')}>
                  {r.rank}ᵉ · {formatTime(r.createdAt)}
                  {r.receivedAt ? <CheckCircle2 className="size-3" /> : r.deliveredAt ? <Truck className="size-3" /> : <PackagePlus className="size-3" />}
                </span>
              ))}
            </p>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-[rgb(var(--glass-edge)/0.16)] pt-2.5 text-[0.85rem] tabular-nums sm:text-[0.78rem]">
          <span className="font-medium text-fg">{articles} article{articles > 1 ? 's' : ''} complété{articles > 1 ? 's' : ''}</span>
          {recus > 0 ? <span className="rounded-full bg-ok/14 px-1.5 font-medium text-ok">{recus} reçu{recus > 1 ? 's' : ''}</span> : null}
          {enRoute > 0 ? <span className="rounded-full bg-info/14 px-1.5 font-medium text-info">{enRoute} à réceptionner</span> : null}
          {ouverts > 0 ? <span className="rounded-full bg-warn/16 px-1.5 font-medium text-warn">{ouverts} ouvert{ouverts > 1 ? 's' : ''}</span> : null}
          <ChevronRight className="ml-auto size-4 shrink-0 text-fg-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-accent" />
        </div>
      </Link>
      {/* L'administration rouvre ou referme chaque passage non signé d'ici. */}
      {admin ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgb(var(--glass-edge)/0.18)] px-3 py-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-fg-subtle">Administration</span>
          <span className="flex flex-wrap items-center gap-1.5">
            {servis.filter((r) => !r.receivedAt).map((r) => <ReopenRefill key={r.id} id={r.id} rank={r.rank} ouvert={!r.deliveredAt} />)}
            <DeleteSuiteButton orderId={o.id} reference={o.reference} nbServis={servis.length} />
          </span>
        </div>
      ) : null}
      </div>
    </div>
  )
}

/**
 * Carte d'un servi complémentaire.
 *
 * Même vocabulaire et mêmes teintes que le ticket : livré tant que le
 * département n'a pas signé, reçu ensuite. Elle ouvre le bon de livraison du
 * passage, prêt à imprimer.
 */
export function RefillCard({
  refill: r, order: o, color, showDay, admin = false, href,
}: {
  refill: BoardRefill
  order: BoardOrder
  color: string
  showDay?: boolean
  admin?: boolean
  href: string
}) {
  const recu = !!r.receivedAt
  // Un bon émis fige le servi pour l'économat. L'administration, et elle
  // seule, le rouvre depuis la carte — tant que le département n'a pas signé
  // — et le referme si elle s'est trompée.
  const rouvert = !r.deliveredAt
  return (
    <div
      className={cn(
        'group relative flex overflow-hidden rounded-xl border transition-[transform,box-shadow,border-color] duration-200',
        'hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-12px_rgb(var(--shadow-ambient)/0.4)]',
        CARTE[recu ? 'RECEIVED' : 'DELIVERED'],
      )}
    >
      {/* Le rail : plein dès que le servi est parti, il n'y a rien à
          mesurer — la carte dit seulement s'il a été reçu. */}
      <span aria-hidden className="w-1.5 shrink-0 bg-ok" />

      {/* La fiche du passage, pas le papier : on relit d'abord ce qui est
          sorti, et le bon s'imprime depuis cette fiche. Ouvrir le PDF au clic
          faisait de la carte un bouton d'impression déguisé. */}
      <div className="flex min-w-0 flex-1 flex-col">
      <Link href={href} className="min-w-0 flex-1 p-3">
        <div className="flex items-start gap-2.5">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-sm sm:size-9"
            style={{ background: `linear-gradient(140deg, ${color}, ${color}c4)` }}
          >
            <PackagePlus className="size-5 sm:size-4" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-[1rem] font-bold leading-tight text-fg sm:text-[0.92rem]">
                {r.rank}ᵉ servi
                {r.createdBy ? (
                  <span className="ml-1.5 font-semibold text-fg-muted">par {r.createdBy.fullName}</span>
                ) : null}
              </p>
              {recu ? (
                <Badge tone="ok" icon={<CheckCircle2 className="size-3.5" aria-hidden="true" />}>Reçu</Badge>
              ) : rouvert ? (
                // Rouvert par l'administration, ou jamais émis : l'économat
                // peut encore le compléter, et le bon reste à émettre.
                <Badge tone="warn" icon={<PackagePlus className="size-3.5" aria-hidden="true" />}>Ouvert</Badge>
              ) : (
                <Badge tone="info" icon={<Truck className="size-3.5" aria-hidden="true" />}>Livré</Badge>
              )}
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[0.88rem] font-semibold tabular-nums text-fg sm:text-[0.82rem]">
              {showDay ? (
                <span className="rounded-md bg-[rgb(var(--glass-edge)/0.22)] px-1.5 font-semibold capitalize text-fg">
                  {formatShortDay(o.businessDay)}
                </span>
              ) : null}
              <span className="truncate">
                {formatInstantDate(r.createdAt)} à {formatTime(r.createdAt)}
              </span>
            </p>
            {/* Le ticket complété : c'est lui qu'on retrouve sur le bon. */}
            <p className="truncate font-mono text-[0.82rem] font-bold text-fg sm:text-[0.76rem]">{o.reference}</p>
            {r.receptionNote ? (
              <p className="mt-1 flex items-start gap-1 text-[0.76rem] font-medium leading-snug text-danger">
                <MessageSquareWarning className="mt-px size-3.5 shrink-0" />
                {r.receptionNote}
              </p>
            ) : null}
            <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.74rem] tabular-nums">
              <span className="whitespace-nowrap">
                <span className="font-semibold text-fg">Servi </span>
                <span className="font-bold text-accent">{formatTime(r.createdAt)}</span>
              </span>
              {r.receivedAt ? (
                <span className="whitespace-nowrap">
                  <span className="font-semibold text-fg">Réception </span>
                  <span className="font-bold text-accent">{formatTime(r.receivedAt)}</span>
                </span>
              ) : null}
            </p>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-[rgb(var(--glass-edge)/0.16)] pt-2.5 text-[0.85rem] tabular-nums sm:text-[0.78rem]">
          <span className="font-medium text-fg">
            {r.lineCount} article{r.lineCount > 1 ? 's' : ''} complété{r.lineCount > 1 ? 's' : ''}
          </span>
          {/* Qui a signé, ou ce qu'on attend encore du département. */}
          {recu ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-ok/14 px-1.5 font-medium text-ok">
              <UserCheck className="size-3.5" />
              Reçu par {r.receivedBy?.fullName ?? 'le département'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-info/12 px-1.5 font-medium text-info">
              <PackageCheck className="size-3.5" />
              À réceptionner
            </span>
          )}
          {/* Le même chevron que sur un ticket : la carte ouvre une fiche,
              et le bon s'imprime depuis elle. L'imprimante annonçait un
              raccourci vers le papier qui n'existe plus ici. */}
          <ChevronRight className="ml-auto size-4 shrink-0 text-fg-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-accent" />
        </div>
      </Link>

      {admin && !recu ? (
        <div className="flex items-center justify-between gap-2 border-t border-[rgb(var(--glass-edge)/0.18)] px-3 py-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-fg-subtle">Administration</span>
          <ReopenRefill id={r.id} rank={r.rank} ouvert={rouvert} />
        </div>
      ) : null}
      </div>
    </div>
  )
}

export { DayTotals } from './day-totals'
