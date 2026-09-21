import * as React from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Printer, ListRestart } from 'lucide-react'
import { executeGraphQL } from '@/server/graphql/execute'
import { requireEmployeeDepartment } from '@/server/auth/guards'
import { GlassCard, Badge, TableWrap, Th, Td, Button } from '@/components/ui/glass'
import { StatusBadge, statusSteps } from '@/components/ui/status'
import { Ticket, ticketVariant, type TicketOrder } from '@/components/ui/ticket'
import { formatLongDate, formatTime, cn } from '@/lib/utils'
import { ReceptionPanel } from './reception-panel'
import { RefillReception, type RefillView } from './refill-reception'
import { OrderLines } from './order-lines'
import { OrderDates } from '@/components/orders/order-dates'
import { PrintButton } from '@/components/ui/print-button'

export const metadata: Metadata = { title: 'Commande' }
export const dynamic = 'force-dynamic'

const QUERY = /* GraphQL */ `
  query Order($id: ID!) {
    order(id: $id) {
      id
      reference
      ticketNumber
      businessDay
      status
      note
      createdAt
      acceptedAt
      deliveredAt
      receivedAt
      lineCount
      totalAsked
      totalServed
      department { name code color }
      createdBy { id fullName }
      processedBy { fullName }
      receivedBy { fullName }
      # Les services complémentaires : la marchandise manquante arrivée après
      # coup, que le département réceptionne un par un.
      refills {
        id
        rank
        createdAt
        receivedAt
        createdBy { fullName }
        receivedBy { fullName }
        lines {
          lineId productName productRef categoryName unitSymbol
          stockFixe quantityAsked firstServed quantity remaining rejectReason
        }
      }
      lines {
        id
        productId
        productName
        productRef
        categoryName
        unitSymbol
        stockFixe
        quantityOnHand
        quantityAsked
        # Servi en tout, compléments reçus compris : c'est ce que le rayon a
        # vraiment, et ce que la réception compare au compté.
        quantityServed: quantityServedTotal
        quantityReceived
        receiptGap
        status
        rejectReason
      }
    }
    # La feuille du département, dans son ordre. Tant que la commande est
    # modifiable, les articles dont le rayon était plein n'ont pas de ligne :
    # il faut les retrouver ici pour pouvoir les commander après coup.
    myCatalog {
      id
      name
      reference
      stockFixe
      category { name }
      baseUnit { symbol }
    }
  }
`

type CatalogEntry = {
  id: string
  name: string
  reference: string
  stockFixe: number
  category: { name: string }
  baseUnit: { symbol: string }
}

type Order = Omit<TicketOrder, 'createdBy' | 'lines'> & {
  id: string
  // Le ticket papier n'a que faire de l'identifiant produit ; le crayon de
  // correction en a besoin pour renvoyer la commande au serveur.
  lines: (TicketOrder['lines'][number] & { productId: string })[]
  createdBy: { id: string; fullName: string }
  // Tout le service peut confirmer la réception ; le ticket papier n'en a que
  // faire, l'écran si.
  receivedBy: { fullName: string } | null
  // Les heures de passage d'une étape à l'autre, pour la frise.
  acceptedAt: string | null
  deliveredAt: string | null
  receivedAt: string | null
  refills: RefillView[]
  status: 'PENDING' | 'ACCEPTED' | 'DELIVERED' | 'RECEIVED' | 'CANCELLED'
  lineCount: number
  totalAsked: number
  totalServed: number
  department: { name: string; code: string; color: string }
}

const LINE_TONE = {
  PENDING: 'neutral',
  VALIDATED: 'ok',
  ADJUSTED: 'warn',
  REJECTED: 'danger',
} as const

const LINE_LABEL = {
  PENDING: 'En attente',
  VALIDATED: 'Servi',
  ADJUSTED: 'Ajusté',
  REJECTED: 'Rupture',
} as const

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [user, { order, myCatalog }] = await Promise.all([
    requireEmployeeDepartment(),
    executeGraphQL<{ order: Order | null; myCatalog: CatalogEntry[] }>(QUERY, { id }),
  ])
  if (!order) notFound()

  // Une rupture soldée par un complément reçu n'a plus de motif à montrer :
  // « sera disponible dans 2 jours » sous une ligne servie en entier
  // contredirait la ligne.
  order.lines = order.lines.map((l) =>
    l.status === 'VALIDATED' && l.rejectReason ? { ...l, rejectReason: null } : l,
  )

  const steps = statusSteps(order.status, {
    createdAt: order.createdAt,
    acceptedAt: order.acceptedAt,
    deliveredAt: order.deliveredAt,
    receivedAt: order.receivedAt,
  })

  // Sa commande, pas encore prise en charge : les deux conditions du serveur.
  const modifiable = order.status === 'PENDING' && order.createdBy.id === String(user.id)

  const ruptures = order.lines.filter((l) => l.status === 'REJECTED').length

  // Une commande ne retient que ce qu'il y avait à commander : un rayon déjà
  // plein ne produit pas de ligne. Tant qu'elle est modifiable, on rétablit la
  // feuille entière pour que ces articles-là restent corrigeables — un stock
  // mal compté ne doit pas obliger à refaire toute la feuille.
  //
  // Dès que l'économat l'accepte, la commande se fige sur ses lignes réelles :
  // afficher des articles à zéro ferait croire à une marchandise à sortir.
  const parProduit = new Map(order.lines.map((l) => [l.productId, l]))
  const lignes = modifiable
    ? myCatalog.map((p) => {
        const existante = parProduit.get(p.id)
        if (existante) return existante
        // Article absent de la commande : son rayon couvrait la cible. On le
        // montre tel qu'il a été compté, sans rien à commander.
        return {
          id: `catalogue-${p.id}`,
          productId: p.id,
          productName: p.name,
          productRef: p.reference,
          categoryName: p.category.name,
          unitSymbol: p.baseUnit.symbol,
          stockFixe: p.stockFixe,
          quantityOnHand: p.stockFixe,
          quantityAsked: 0,
          quantityServed: null,
          quantityReceived: null,
          receiptGap: null,
          status: 'PENDING' as const,
          rejectReason: null,
        }
      })
    : order.lines

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/employe"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[0.83rem] font-medium text-fg-muted transition-colors hover:bg-[rgb(var(--glass-edge)/0.14)] hover:text-fg"
        >
          <ArrowLeft className="size-4" />
          Commandes du service
        </Link>
        <div className="flex items-center gap-2">
          {/* Une ligne se corrige sur place, au crayon, dans le tableau : le
              bouton global obligeait à rouvrir cent lignes pour un chiffre.
              Reste ici la refonte complète, pour ajouter ou retirer un
              article — ce qu'une case seule ne permet pas.

              Corriger reste possible tant que l'économat n'a pas pris la
              commande en main. Passé ce point le lien disparaît : la
              marchandise est peut-être déjà sortie du magasin.

              Un collègue voit la commande — le service se relaie — mais ne la
              corrige pas : le serveur refuserait, autant ne pas proposer. */}
          {modifiable ? (
            <Link href={`/employe/commandes/${order.id}/modifier`}>
              <Button variant="secondary" size="sm">
                <ListRestart className="size-3.5" />
                Refaire la feuille
              </Button>
            </Link>
          ) : null}
          <PrintButton orderId={order.id} variant="secondary" size="sm">
            <Printer className="size-3.5" />
            Imprimer
          </PrintButton>
          {/* La confirmation vit désormais dans le panneau de vérification. */}
        </div>
      </div>

      {/* Version écran */}
      <div className="no-print space-y-4">
        <GlassCard>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3.5 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="grid size-11 shrink-0 place-items-center rounded-xl text-[0.95rem] font-bold text-white shadow-md"
                style={{ background: `linear-gradient(140deg, ${order.department.color}, ${order.department.color}bb)` }}
              >
                {order.ticketNumber}
              </span>
              <div className="min-w-0">
                <p className="truncate font-mono text-[0.95rem] font-bold leading-tight text-fg">
                  {order.reference}
                </p>
                <p className="text-[0.8rem] capitalize text-fg-muted">
                  {formatLongDate(order.businessDay)} · {formatTime(order.createdAt)}
                </p>
              </div>
            </div>
            <StatusBadge status={order.status} />
          </div>

          {/* Frise d'avancement */}
          <div className="scroll-x flex items-center gap-1 px-4 py-3.5 sm:px-5">
            {steps.map((s, i) => (
              <div key={s.status} className="flex min-w-0 flex-1 items-center gap-1">
                <div className="flex min-w-0 flex-col items-center gap-1.5">
                  <span
                    className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-full border-2 transition-colors',
                      s.done
                        ? 'border-accent bg-accent text-white'
                        : 'border-[rgb(var(--glass-edge)/0.35)] bg-white/50 text-fg-subtle',
                      s.current && 'ring-4 ring-accent/18',
                    )}
                  >
                    <s.Icon className="size-4" />
                  </span>
                  <span
                    className={cn(
                      'w-full truncate text-center text-[0.68rem] font-medium',
                      s.done ? 'text-fg' : 'text-fg-subtle',
                    )}
                  >
                    {s.label}
                  </span>
                  {/* L'heure sous l'étape franchie : la frise disait où en est
                      la commande, pas depuis quand. */}
                  {s.at ? (
                    <span className="w-full text-center text-[0.66rem] tabular-nums text-fg-subtle">
                      {formatTime(s.at)}
                    </span>
                  ) : null}
                </div>
                {i < steps.length - 1 ? (
                  <span
                    className={cn(
                      'mb-5 h-0.5 flex-1 rounded-full',
                      steps[i + 1].done ? 'bg-accent' : 'bg-[rgb(var(--glass-edge)/0.28)]',
                    )}
                  />
                ) : null}
              </div>
            ))}
          </div>

          {/* Les quatre moments, nommés : la frise dit l'étape, ce bloc dit
              quand chacune a été franchie. */}
          <OrderDates
            order={order}
            className="border-t border-[rgb(var(--glass-edge)/0.16)] px-4 py-2.5 sm:px-5"
          />

          <div className="flex flex-wrap gap-1.5 border-t border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
            {/* Le nombre d'articles suffit : cumuler des unités, des kilos et
                des litres en un seul total ne désignait aucune grandeur
                réelle. Le détail par article est dans le tableau. */}
            <Badge tone="accent">
              {order.lineCount} article{order.lineCount > 1 ? 's' : ''} commandé
              {order.lineCount > 1 ? 's' : ''}
            </Badge>
            {/* Qui a traité la commande n'apprenait rien à l'employé qui la
                relit ; ce qui manque ou diffère, si. Les compteurs cliquables
                sont au-dessus du tableau, là où ils filtrent. */}
            {ruptures > 0 ? (
              <Badge tone="danger">
                {ruptures} article{ruptures > 1 ? 's' : ''} non livré{ruptures > 1 ? 's' : ''}
              </Badge>
            ) : null}
            {/* Tout le service peut réceptionner : savoir qui l'a fait évite
                d'avoir à demander à la ronde ce qui s'est passé. */}
            {order.receivedBy ? (
              <Badge tone="info">Reçue par {order.receivedBy.fullName}</Badge>
            ) : null}
          </div>

          {order.note ? (
            <p className="border-t border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 text-[0.83rem] italic text-fg-muted sm:px-5">
              {order.note}
            </p>
          ) : null}
        </GlassCard>

        {/* À la réception, le panneau de vérification liste déjà tous les
            articles avec les mêmes colonnes : afficher le tableau de détail
            en dessous doublait la feuille sur 109 lignes. */}
        {order.status === 'DELIVERED' ? (
          <ReceptionPanel orderId={order.id} lines={order.lines} />
        ) : (
        <GlassCard overflowVisible>
          <OrderLines
            orderId={order.id}
            lines={lignes}
            editable={modifiable}
            showReceived={order.status === 'RECEIVED'}
          />
        </GlassCard>
        )}

        {/* Les passages complémentaires, chacun avec sa propre réception : la
            commande a pu être close depuis longtemps quand le complément
            arrive, et signer pour lui ne doit pas dépendre d'elle. */}
        {order.refills.map((r) => (
          <RefillReception key={r.id} orderId={order.id} refill={r} />
        ))}
      </div>

      {/* Version papier */}
      <div className="print-only">
        <Ticket order={order} variant={ticketVariant(order.status)} />
      </div>
    </>
  )
}
