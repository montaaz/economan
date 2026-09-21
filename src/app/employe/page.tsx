import * as React from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ClipboardList, PlusCircle, PackageCheck, UserCheck, PackagePlus, Truck, CheckCircle2,
} from 'lucide-react'
import { executeGraphQL } from '@/server/graphql/execute'
import { PageHeader } from '@/components/ui/stat'
import { GlassCard, Button, EmptyState, Badge } from '@/components/ui/glass'
import { StatusBadge } from '@/components/ui/status'
import { OrderDates } from '@/components/orders/order-dates'
import { cn, formatInstantDate, formatLongDate, formatTime } from '@/lib/utils'

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

      {myOrders.length === 0 ? (
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

                  {/* Un servi complémentaire a sa propre carte, juste après
                      celle de sa commande : il arrive à part, se réceptionne à
                      part, et une ligne dans la carte de la commande ne
                      disait ni quand ni par qui. La carte ouvre le servi seul,
                      pas la commande entière : le barman compte ce qui vient
                      d'arriver, pas cent lignes déjà reçues. */}
                  {o.refills.map((r) => (
                    <Link key={r.id} href={`/employe/commandes/${o.id}/servi/${r.rank}`}>
                      <GlassCard
                        hover
                        className={cn('h-full', CARTE[r.receivedAt ? 'RECEIVED' : 'DELIVERED'])}
                      >
                        <div className="space-y-3 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[0.95rem] font-bold leading-tight text-fg">
                                {r.rank}ᵉ servi
                                {r.createdBy ? (
                                  <span className="ml-1.5 font-semibold text-fg-muted">
                                    par {r.createdBy.fullName}
                                  </span>
                                ) : null}
                              </p>
                              <p className="mt-0.5 text-[0.88rem] font-semibold tabular-nums text-fg">
                                {formatInstantDate(r.createdAt)} à {formatTime(r.createdAt)}
                              </p>
                            </div>
                            {/* Le même vocabulaire que la commande, au masculin :
                                un service est livré tant que personne n'a
                                signé, reçu ensuite. */}
                            {r.receivedAt ? (
                              <Badge tone="ok" icon={<CheckCircle2 className="size-3.5" aria-hidden="true" />}>
                                Reçu
                              </Badge>
                            ) : (
                              <Badge tone="info" icon={<Truck className="size-3.5" aria-hidden="true" />}>
                                Livré
                              </Badge>
                            )}
                          </div>

                          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.74rem] tabular-nums">
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

                          {/* Le ticket de la commande complétée : c'est lui
                              qu'on retrouve sur le bon qui accompagne la
                              marchandise. */}
                          <p className="flex items-center gap-2">
                            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent">
                              <PackagePlus className="size-4" />
                            </span>
                            <span className="truncate font-mono text-[0.85rem] font-bold text-fg">
                              {o.reference}
                            </span>
                          </p>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone="neutral">
                              {r.lineCount} article{r.lineCount > 1 ? 's' : ''} complété
                              {r.lineCount > 1 ? 's' : ''}
                            </Badge>
                          </div>

                          {r.receivedAt ? (
                            <p className="flex items-center gap-1.5 rounded-lg bg-info/10 px-2.5 py-1.5 text-[0.78rem] font-medium text-info">
                              <UserCheck className="size-4 shrink-0" />
                              Reçu par {r.receivedBy?.fullName ?? 'le département'}
                            </p>
                          ) : (
                            <p className="flex items-center gap-1.5 rounded-lg bg-info/10 px-2.5 py-1.5 text-[0.78rem] font-medium text-info">
                              <PackageCheck className="size-4 shrink-0" />
                              À confirmer en réception
                            </p>
                          )}
                        </div>
                      </GlassCard>
                    </Link>
                  ))}
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
