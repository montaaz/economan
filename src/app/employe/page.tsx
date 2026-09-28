import * as React from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ClipboardList, PlusCircle, PackageCheck, UserCheck, PackagePlus, Truck, CheckCircle2, Siren,
} from 'lucide-react'
import { executeGraphQL } from '@/server/graphql/execute'
import { PageHeader } from '@/components/ui/stat'
import { GlassCard, Button, EmptyState, Badge } from '@/components/ui/glass'
import { StatusBadge } from '@/components/ui/status'
import { OrderDates } from '@/components/orders/order-dates'
import { cn, formatInstantDate, formatLongDate, formatTime, businessDay } from '@/lib/utils'

export const metadata: Metadata = { title: 'Commandes du département' }
export const dynamic = 'force-dynamic'

const QUERY = /* GraphQL */ `
  query MyOrders {
    myOrders(days: 3) {
      id
      reference
      ticketNumber
      businessDay
      status
      isUrgent
      createdAt
      lineCount
      acceptedAt
      deliveredAt
      receivedAt
      # Les services complémentaires : chacun a sa carte, à côté de celle de
      # la commande, et se réceptionne à part.
      refills {
        id
        rank
        createdAt
        receivedAt
        lineCount
        createdBy { fullName }
        receivedBy { fullName }
      }
      rejectedCount
      adjustedCount
      validatedCount
      note
      department { name color }
      createdBy { fullName }
      receivedBy { fullName }
    }
  }
`

type Refill = {
  id: string
  rank: number
  createdAt: string
  receivedAt: string | null
  lineCount: number
  createdBy: { fullName: string } | null
  receivedBy: { fullName: string } | null
}

type Order = {
  id: string
  reference: string
  ticketNumber: number
  businessDay: string
  status: 'PENDING' | 'ACCEPTED' | 'DELIVERED' | 'RECEIVED' | 'CANCELLED'
  isUrgent: boolean
  createdAt: string
  lineCount: number
  acceptedAt: string | null
  deliveredAt: string | null
  receivedAt: string | null
  refills: Refill[]
  rejectedCount: number
  adjustedCount: number
  validatedCount: number
  note: string | null
  department: { name: string; color: string }
  createdBy: { fullName: string }
  receivedBy: { fullName: string } | null
}

/**
 * Teinte de fond par état, du plus urgent au plus abouti.
 *
 * Le fond porte l'information, pas seulement la pastille : sur une liste de
 * cartes, l'état se lit alors sans rien déchiffrer. Les teintes restent
 * légères — la carte doit rester une carte, pas un bloc de couleur.
 */
const CARTE: Record<string, string> = {
  PENDING: '!bg-warn/[0.28] !border-warn/45',
  ACCEPTED: '!bg-danger/[0.22] !border-danger/45',
  // Bleu et vert foncés : une teinte claire poussée en opacité se délave au
  // lieu de foncer, d'où ces couleurs posées explicitement.
  DELIVERED: '!bg-[#1e4d8f]/[0.30] !border-[#1e4d8f]/55',
  RECEIVED: '!bg-[#0b6b4a]/[0.30] !border-[#0b6b4a]/55',
  CANCELLED: '!bg-[rgb(var(--glass-edge)/0.18)] !border-[rgb(var(--glass-edge)/0.35)]',
}

export default async function MyOrdersPage() {
  const { myOrders } = await executeGraphQL<{ myOrders: Order[] }>(QUERY)

  // Regroupement par journée : l'employé raisonne en jours de service.
  const byDay = new Map<string, Order[]>()
  for (const o of myOrders) {
    const list = byDay.get(o.businessDay)
    if (list) list.push(o)
    else byDay.set(o.businessDay, [o])
  }
  // La journée en cours garde sa place en tête, même vide : c'est là que
  // le travail du jour commence, et le bouton pour le commencer est dedans.
  const aujourdhui = businessDay().toISOString().slice(0, 10)
  const journeeVide = !byDay.has(aujourdhui)

  return (
    <>
      <PageHeader
        title="Commandes du département"
        description="Les commandes de votre service sur les 3 derniers jours, la vôtre comme celles de vos collègues."
        actions={
          <Link href="/employe/commande">
            <Button variant="primary">
              <PlusCircle className="size-4" />
              Nouvelle commande
            </Button>
          </Link>
        }
      />

      {myOrders.length === 0 && !journeeVide ? (
        <GlassCard>
          <EmptyState
            icon={<ClipboardList className="size-6" />}
            title="Aucune commande"
            description="Vous n’avez passé aucune commande ces 3 derniers jours."
            action={
              <Link href="/employe/commande">
                <Button variant="primary">
                  <PlusCircle className="size-4" />
                  Passer une commande
                </Button>
              </Link>
            }
          />
        </GlassCard>
      ) : (
        <div className="space-y-6">
          {journeeVide ? (
            <section>
              <h2 className="mb-2.5 px-0.5 text-[0.9rem] font-semibold capitalize tracking-tight text-fg">
                {formatLongDate(aujourdhui)}
                <span className="ml-2 text-[0.82rem] font-semibold normal-case text-fg-muted">Aujourd’hui · aucune commande</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="flex h-full flex-col justify-between gap-4 rounded-[var(--radius)] border-2 border-dashed border-accent/40 bg-accent/[0.06] p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-dashed border-accent/60 text-accent">
                      <ClipboardList className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[0.95rem] font-bold leading-tight text-fg">Espace de la journée</p>
                      <p className="mt-1 text-[0.82rem] leading-snug text-fg-muted">
                        Votre service n’a pas encore passé sa commande du jour. Elle apparaîtra ici, avec ses servis, dès qu’elle sera envoyée.
                      </p>
                    </div>
                  </div>
                  <Link href="/employe/commande" className="block">
                    <Button variant="primary" className="w-full">
                      <PlusCircle className="size-4" />
                      Nouvelle commande
                    </Button>
                  </Link>
                </div>
              </div>
            </section>
          ) : null}
          {[...byDay.entries()].map(([day, orders]) => (
            <section key={day}>
              <h2 className="mb-2.5 px-0.5 text-[0.9rem] font-semibold capitalize tracking-tight text-fg">
                {formatLongDate(day)}
                <span className="ml-2 text-[0.82rem] font-semibold tabular-nums text-fg">
                  {orders.length} commande{orders.length > 1 ? 's' : ''}
                </span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {orders.map((o) => (
                  <React.Fragment key={o.id}>
                  <Link href={`/employe/commandes/${o.id}`}>
                    {/* La carte entière prend la couleur de son état : sur une
                        liste, repérer ce qui attend encore quelque chose se
                        faisait en lisant chaque pastille une par une. */}
                    <GlassCard hover className={cn('h-full', CARTE[o.status])}>
                      <div className="space-y-3 p-4">
                        {/* L'auteur et l'horodatage ouvrent la carte : c'est ce
                            qu'on cherche d'abord en la parcourant. */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[0.95rem] font-bold leading-tight text-fg">
                              {o.createdBy.fullName}
                            </p>
                            {/* En noir et gras : sur les fonds colorés des
                                cartes, le gris se lisait mal. */}
                            <p className="mt-0.5 text-[0.88rem] font-semibold tabular-nums text-fg">
                              {formatInstantDate(o.createdAt)} à {formatTime(o.createdAt)}
                            </p>
                          </div>
                          <StatusBadge status={o.status} />
                        </div>

                        {/* Les quatre moments, nommés : sans intitulé, une
                            suite d'heures ne dit pas de quoi elle parle. */}
                        <OrderDates order={o} compact />

                        <p className="flex items-center gap-2">
                          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/12 text-[0.78rem] font-bold tabular-nums text-accent">
                            {o.ticketNumber}
                          </span>
                          <span className="truncate font-mono text-[0.85rem] font-bold text-fg">
                            {o.reference}
                          </span>
                        </p>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* Le nombre d'articles suffit : cumuler des unités,
                              des kilos et des litres en un seul total ne
                              désignait aucune grandeur réelle. */}
                          <Badge tone="neutral">{o.lineCount} article{o.lineCount > 1 ? 's' : ''}</Badge>
                          {/* Le détail de ce qui s'est passé à la livraison,
                              sans avoir à ouvrir la commande. Tant qu'elle
                              n'est pas servie, ces comptes valent zéro et ne
                              s'affichent pas. */}
                          {o.rejectedCount > 0 ? (
                            <Badge tone="danger">
                              {o.rejectedCount} rupture{o.rejectedCount > 1 ? 's' : ''}
                            </Badge>
                          ) : null}
                          {o.adjustedCount > 0 ? (
                            <Badge tone="warn">
                              {o.adjustedCount} ajustée{o.adjustedCount > 1 ? 's' : ''}
                            </Badge>
                          ) : null}
                          {o.validatedCount > 0 ? (
                            <Badge tone="ok">
                              {o.validatedCount} conforme{o.validatedCount > 1 ? 's' : ''}
                            </Badge>
                          ) : null}
                        </div>

                        {o.status === 'DELIVERED' ? (
                          <p className="flex items-center gap-1.5 rounded-lg bg-info/10 px-2.5 py-1.5 text-[0.78rem] font-medium text-info">
                            <PackageCheck className="size-4 shrink-0" />
                            À confirmer en réception
                          </p>
                        ) : null}

                        {/* Tout le service peut réceptionner : savoir qui l'a
                            fait évite d'avoir à demander à la ronde ce qui
                            s'est passé à la livraison. */}
                        {o.status === 'RECEIVED' && o.receivedBy ? (
                          <p className="flex items-center gap-1.5 rounded-lg bg-info/10 px-2.5 py-1.5 text-[0.78rem] font-medium text-info">
                            <UserCheck className="size-4 shrink-0" />
                            Reçue par {o.receivedBy.fullName}
                          </p>
                        ) : null}
                      </div>
                    </GlassCard>
                  </Link>

                  {/* Tout ce qui suit le premier servi tient sur une carte :
                      la suite de commande. Elle ouvre la fiche de tous les
                      passages, et c'est de là qu'on réceptionne chacun. */}
                  {o.refills.length > 0 ? (() => {
                    const servis = [...o.refills].sort((a, b) => a.rank - b.rank)
                    const recus = servis.filter((r) => r.receivedAt).length
                    const articles = servis.reduce((n, r) => n + r.lineCount, 0)
                    const dernier = servis[servis.length - 1]
                    const tousRecus = recus === servis.length
                    return (
                    <Link href={`/employe/commandes/${o.id}/suite`}>
                      <GlassCard hover className={cn('h-full', CARTE[tousRecus ? 'RECEIVED' : 'DELIVERED'], o.isUrgent && '!border-2 !border-[#8b1e2d] shadow-[0_0_0_3px_rgb(139_30_45/0.18)]')}>
                        <div className="space-y-3 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[0.95rem] font-bold leading-tight text-fg">
                                {o.isUrgent ? 'Commande urgente' : 'Suite de commande'}
                                <span className="ml-1.5 font-semibold text-fg-muted">{servis.length} servi{servis.length > 1 ? 's' : ''}</span>
                              </p>
                              <p className="mt-0.5 text-[0.88rem] font-semibold tabular-nums text-fg">
                                dernier servi {formatInstantDate(dernier.createdAt)} à {formatTime(dernier.createdAt)}
                              </p>
                            </div>
                            <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                            {o.isUrgent ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#8b1e2d] px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-white"><Siren className="size-3" aria-hidden="true" />Urgent</span>
                            ) : null}
                            {tousRecus ? (
                              <Badge tone="ok" icon={<CheckCircle2 className="size-3.5" aria-hidden="true" />}>Reçu</Badge>
                            ) : (
                              <Badge tone="info" icon={<Truck className="size-3.5" aria-hidden="true" />}>Livré</Badge>
                            )}
                            </span>
                          </div>
                          <p className="flex flex-wrap gap-1">
                            {servis.map((r) => (
                              <span key={r.id} className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.74rem] font-semibold tabular-nums', r.receivedAt ? 'bg-ok/14 text-ok' : 'bg-info/14 text-info')}>
                                {r.rank}ᵉ · {formatTime(r.createdAt)}
                                {r.receivedAt ? <CheckCircle2 className="size-3" /> : <Truck className="size-3" />}
                              </span>
                            ))}
                          </p>
                          <p className="flex items-center gap-2">
                            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent"><PackagePlus className="size-4" /></span>
                            <span className="truncate font-mono text-[0.85rem] font-bold text-fg">{o.reference}</span>
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone="neutral">{articles} article{articles > 1 ? 's' : ''} complété{articles > 1 ? 's' : ''}</Badge>
                            {recus > 0 ? <Badge tone="ok">{recus} reçu{recus > 1 ? 's' : ''}</Badge> : null}
                          </div>
                          {tousRecus ? (
                            <p className="flex items-center gap-1.5 rounded-lg bg-info/10 px-2.5 py-1.5 text-[0.78rem] font-medium text-info">
                              <UserCheck className="size-4 shrink-0" />
                              Tous les servis sont réceptionnés
                            </p>
                          ) : (
                            <p className="flex items-center gap-1.5 rounded-lg bg-info/10 px-2.5 py-1.5 text-[0.78rem] font-medium text-info">
                              <PackageCheck className="size-4 shrink-0" />
                              {servis.length - recus} servi{servis.length - recus > 1 ? 's' : ''} à confirmer en réception
                            </p>
                          )}
                        </div>
                      </GlassCard>
                    </Link>
                    )
                  })() : null}
                  </React.Fragment>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
