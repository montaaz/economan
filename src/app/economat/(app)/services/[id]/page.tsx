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
      lines: { include: { orderLine: { include: { unit: true } } } },
    },
  })
  if (!refill) notFound()

  const lines = refill.lines
    .slice()
    .sort((a, b) => a.orderLine.sortOrder - b.orderLine.sortOrder)
    .map((l) => ({
      productName: l.orderLine.productName,
      productRef: l.orderLine.productRef,
      categoryName: l.orderLine.categoryName,
      unitSymbol: l.orderLine.unit?.symbol ?? '',
      quantity: Number(l.quantity),
    }))

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
