import type { Metadata } from 'next'
import Link from 'next/link'
import { ClipboardList, PlusCircle, PackageCheck } from 'lucide-react'
import { executeGraphQL } from '@/server/graphql/execute'
import { PageHeader } from '@/components/ui/stat'
import { GlassCard, Button, EmptyState, Badge } from '@/components/ui/glass'
import { StatusBadge } from '@/components/ui/status'
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
      totalAsked
      totalServed
      note
      department { name color }
      createdBy { fullName }
    }
  }
`

type Order = {
  id: string
  reference: string
  ticketNumber: number
  businessDay: string
  status: 'PENDING' | 'ACCEPTED' | 'DELIVERED' | 'RECEIVED' | 'CANCELLED'
  createdAt: string
  lineCount: number
  totalAsked: number
  totalServed: number
  note: string | null
  department: { name: string; color: string }
  createdBy: { fullName: string }
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
  DELIVERED: '!bg-ok/[0.26] !border-ok/45',
  // Reçue : le cycle est clos, la carte n'appelle plus rien et s'efface.
  RECEIVED: '!bg-ok/[0.10] !border-ok/25',
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
                <span className="ml-2 text-[0.8rem] font-normal tabular-nums text-fg-subtle">
                  {orders.length} commande{orders.length > 1 ? 's' : ''}
                </span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {orders.map((o) => (
                  <Link key={o.id} href={`/employe/commandes/${o.id}`}>
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
                            <p className="mt-0.5 text-[0.82rem] tabular-nums text-fg-muted">
                              {formatInstantDate(o.createdAt)} à {formatTime(o.createdAt)}
                            </p>
                          </div>
                          <StatusBadge status={o.status} />
                        </div>

                        <p className="flex items-center gap-2">
                          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/12 text-[0.78rem] font-bold tabular-nums text-accent">
                            {o.ticketNumber}
                          </span>
                          <span className="truncate font-mono text-[0.8rem] font-semibold text-fg-muted">
                            {o.reference}
                          </span>
                        </p>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* Le nombre d'articles suffit : cumuler des unités,
                              des kilos et des litres en un seul total ne
                              désignait aucune grandeur réelle. */}
                          <Badge tone="neutral">{o.lineCount} article{o.lineCount > 1 ? 's' : ''}</Badge>
                        </div>

                        {o.status === 'DELIVERED' ? (
                          <p className="flex items-center gap-1.5 rounded-lg bg-info/10 px-2.5 py-1.5 text-[0.78rem] font-medium text-info">
                            <PackageCheck className="size-4 shrink-0" />
                            À confirmer en réception
                          </p>
                        ) : null}
                      </div>
                    </GlassCard>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
