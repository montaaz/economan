import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/server/db'
import { requireRole } from '@/server/auth/guards'
import { RefillTicketSheet } from '@/components/ui/refill-ticket'

export const metadata: Metadata = { title: 'Bon de service' }
export const dynamic = 'force-dynamic'

/**
 * Feuille imprimable d'un service complémentaire.
 *
 * Rendue seule, sans navigation : c'est elle que le rendu PDF capture.
 */
export default async function RefillSheetPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // Le bon d'un service se lit côté magasin : économat et administration.
  await requireRole(['ECONOMAN', 'ADMIN'])
  const { id } = await params

  const refill = await prisma.orderRefill.findUnique({
    where: { id: Number(id) },
    include: {
      createdBy: { select: { fullName: true } },
      order: {
        include: {
          department: { select: { name: true, code: true } },
          createdBy: { select: { fullName: true } },
        },
      },
      // Les autres passages de la même ligne : le reste annoncé doit tenir
      // compte de ce qui est sorti jusqu'ici, pas seulement de ce bon.
      lines: {
        include: {
          orderLine: {
            include: {
              unit: true,
              refills: { select: { quantity: true, refill: { select: { rank: true } } } },
            },
          },
        },
      },
    },
  })
  if (!refill) notFound()

  const lines = refill.lines
    .slice()
    .sort((a, b) => a.orderLine.sortOrder - b.orderLine.sortOrder)
    .map((l) => {
      const ol = l.orderLine
      // Ce qui est sorti jusqu'à ce passage inclus : le premier service, plus
      // les compléments de rang inférieur ou égal.
      const anterieurs = ol.refills
        .filter((r) => (r.refill?.rank ?? 0) <= refill.rank)
        .reduce((n, r) => n + Number(r.quantity), 0)
      const sorti = Number(ol.quantityServed ?? 0) + anterieurs
      return {
        productName: ol.productName,
        productRef: ol.productRef,
        categoryName: ol.categoryName,
        unitSymbol: ol.unit?.symbol ?? '',
        stockFixe: Number(ol.stockFixe),
        quantityAsked: Number(ol.quantityAsked),
        firstServed: Number(ol.quantityServed ?? 0),
        quantity: Number(l.quantity),
        remaining: Math.max(Number(ol.quantityAsked) - sorti, 0),
      }
    })

  return (
    <RefillTicketSheet
      refill={{
        rank: refill.rank,
        createdAt: refill.createdAt.toISOString(),
        createdBy: refill.createdBy,
        order: {
          reference: refill.order.reference,
          ticketNumber: refill.order.ticketNumber,
          businessDay: refill.order.businessDay.toISOString(),
          department: refill.order.department,
          createdBy: refill.order.createdBy,
        },
        lines,
      }}
    />
  )
}
