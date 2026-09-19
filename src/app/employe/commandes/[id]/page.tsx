import * as React from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Printer, Pencil } from 'lucide-react'
import { executeGraphQL } from '@/server/graphql/execute'
import { GlassCard, Badge, TableWrap, Th, Td, Button } from '@/components/ui/glass'
import { StatusBadge, statusSteps } from '@/components/ui/status'
import { Ticket, ticketVariant, type TicketOrder } from '@/components/ui/ticket'
import { formatLongDate, formatQty, formatTime, cn } from '@/lib/utils'
import { ReceptionPanel } from './reception-panel'
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
      createdBy { fullName }
      processedBy { fullName }
      lines {
        id
        productName
        productRef
        categoryName
        unitSymbol
        stockFixe
        quantityOnHand
        quantityAsked
        quantityServed
        quantityReceived
        receiptGap
        status
        rejectReason
      }
    }
  }
`

type Order = TicketOrder & {
  id: string
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
  const { order } = await executeGraphQL<{ order: Order | null }>(QUERY, { id })
  if (!order) notFound()

  // Les lignes d'une commande sont figées à l'envoi : celles passées avant que
  // les feuilles soient regroupées gardent leurs familles éparpillées. On les
  // rassemble pour l'affichage, sans toucher au ticket enregistré.
  const ordreFamilles: string[] = []
  for (const l of order.lines) {
    if (!ordreFamilles.includes(l.categoryName)) ordreFamilles.push(l.categoryName)
  }
  const lignes = ordreFamilles.flatMap((c) => order.lines.filter((l) => l.categoryName === c))

  const steps = statusSteps(order.status)

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/employe"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[0.83rem] font-medium text-fg-muted transition-colors hover:bg-[rgb(var(--glass-edge)/0.14)] hover:text-fg"
        >
          <ArrowLeft className="size-4" />
          Mes commandes
        </Link>
        <div className="flex items-center gap-2">
          {/* Corriger reste possible tant que l'économat n'a pas pris la
              commande en main. Passé ce point le bouton disparaît : la
              marchandise est peut-être déjà sortie du magasin. */}
          {order.status === 'PENDING' ? (
            <Link href={`/employe/commandes/${order.id}/modifier`}>
              <Button variant="primary" size="sm">
                <Pencil className="size-3.5" />
                Modifier
              </Button>
            </Link>
          ) : null}
          <PrintButton variant="secondary" size="sm">
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

          <div className="flex flex-wrap gap-1.5 border-t border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
            {/* Le nombre d'articles suffit : cumuler des unités, des kilos et
                des litres en un seul total ne désignait aucune grandeur
                réelle. Le détail par article est dans le tableau. */}
            <Badge tone="accent">
              {order.lineCount} article{order.lineCount > 1 ? 's' : ''} commandé
              {order.lineCount > 1 ? 's' : ''}
            </Badge>
            {order.status === 'DELIVERED' || order.status === 'RECEIVED' ? (
              <Badge tone="ok">{formatQty(order.totalServed)} servi</Badge>
            ) : null}
            {order.processedBy ? (
              <Badge tone="neutral">Traité par {order.processedBy.fullName}</Badge>
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
          <TableWrap minWidth="46rem">
            <thead>
              <tr>
                <Th className="w-10 text-right">#</Th>
                <Th className="w-full">Article</Th>
                {/* Les deux valeurs d'où sort la quantité commandée : la cible
                    du département moins ce qui restait en rayon. Sans elles,
                    un chiffre inattendu reste inexplicable. */}
                <Th className="text-right">Stock fixe</Th>
                <Th className="text-right">Mon stock</Th>
                {/* Même intitulé que l'écran de l'économat et la feuille
                    papier : une seule notion, un seul mot. */}
                <Th className="text-right">Commande</Th>
                <Th className="text-right">Servi</Th>
                {order.status === 'RECEIVED' ? (
                  <Th className="text-right">Reçu</Th>
                ) : null}
                <Th>État</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
              {lignes.map((l, i) => (
                <React.Fragment key={l.id}>
                  {i === 0 || lignes[i - 1].categoryName !== l.categoryName ? (
                    <tr>
                      <td
                        colSpan={order.status === 'RECEIVED' ? 8 : 7}
                        className="bg-ok/12 px-2 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.06em] text-ok sm:px-3 sm:text-[0.76rem]"
                      >
                        {l.categoryName}
                      </td>
                    </tr>
                  ) : null}
                <tr className={cn(l.status === 'REJECTED' && 'bg-danger/[0.06]')}>
                  <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{i + 1}</Td>
                  <Td className="max-w-0">
                    <p className="truncate text-[0.85rem] font-medium text-fg">{l.productName}</p>
                    {/* La famille est portée par le bandeau : la répéter sous
                        chaque nom allongeait sans rien apprendre. */}
                    <p className="truncate font-mono text-[0.7rem] text-fg-subtle">
                      {l.productRef}
                    </p>
                  </Td>
                  <Td className="whitespace-nowrap text-right tabular-nums text-fg-subtle">
                    {formatQty(l.stockFixe)} {l.unitSymbol}
                  </Td>
                  <Td className="whitespace-nowrap text-right tabular-nums text-fg-subtle">
                    {formatQty(l.quantityOnHand)} {l.unitSymbol}
                  </Td>
                  <Td className="whitespace-nowrap text-right font-semibold tabular-nums text-fg">
                    {formatQty(l.quantityAsked)} {l.unitSymbol}
                  </Td>
                  <Td className="whitespace-nowrap text-right font-medium tabular-nums text-fg">
                    {l.quantityServed === null ? '—' : `${formatQty(l.quantityServed)} ${l.unitSymbol}`}
                  </Td>
                  {order.status === 'RECEIVED' ? (
                    <Td className="whitespace-nowrap text-right tabular-nums">
                      {l.quantityReceived == null ? (
                        <span className="text-fg-subtle">—</span>
                      ) : (
                        <span className={cn((l.receiptGap ?? 0) !== 0 && 'font-bold text-warn')}>
                          {formatQty(l.quantityReceived)} {l.unitSymbol}
                          {(l.receiptGap ?? 0) !== 0 ? (
                            <span className="ml-1 text-[0.72rem]">
                              ({(l.receiptGap ?? 0) > 0 ? '+' : ''}{formatQty(l.receiptGap ?? 0)})
                            </span>
                          ) : null}
                        </span>
                      )}
                    </Td>
                  ) : null}
                  <Td>
                    <Badge tone={LINE_TONE[l.status]}>{LINE_LABEL[l.status]}</Badge>
                    {l.rejectReason ? (
                      <p className="mt-0.5 text-[0.7rem] text-danger">{l.rejectReason}</p>
                    ) : null}
                  </Td>
                </tr>
                </React.Fragment>
              ))}
            </tbody>
          </TableWrap>
        </GlassCard>
        )}
      </div>

      {/* Version papier */}
      <div className="print-only">
        <Ticket order={order} variant={ticketVariant(order.status)} />
      </div>
    </>
  )
}
