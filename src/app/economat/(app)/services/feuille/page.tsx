import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/server/db'
import { requireRole } from '@/server/auth/guards'
import { RefillTicketSheet } from '@/components/ui/refill-ticket'
import { businessDay } from '@/lib/utils'

export const metadata: Metadata = { title: 'Feuille de servi' }
export const dynamic = 'force-dynamic'

/**
 * Feuille de tournée, à remplir au stylo.
 *
 * Avant de saisir, l'économat descend au magasin avec ce papier : il y a tout
 * ce qui reste dû, et une colonne vide pour noter ce qu'il sort réellement.
 * La saisie à l'écran vient après, d'après ces notes.
 */
export default async function FeuilleServicePage({
  searchParams,
}: {
  searchParams: Promise<{ dep?: string; rang?: string; jour?: string }>
}) {
  await requireRole(['ECONOMAN', 'ADMIN'])
  const { dep, rang, jour } = await searchParams
  const departmentId = Number(dep)
  const rank = Number(rang)
  if (!departmentId || !rank) notFound()

  const day = jour ? new Date(`${jour}T00:00:00.000Z`) : businessDay()

  const orders = await prisma.order.findMany({
    where: { departmentId, businessDay: day },
    include: {
      department: { select: { name: true, code: true } },
      createdBy: { select: { fullName: true } },
      lines: {
        where: { status: { in: ['REJECTED', 'ADJUSTED'] } },
        include: {
          unit: true,
          refills: { select: { quantity: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { ticketNumber: 'asc' },
  })

  const lines = orders
    .flatMap((o) => o.lines.map((l) => ({ l, ref: o.reference })))
    .map(({ l, ref }) => {
      const complete = l.refills.reduce((n, r) => n + Number(r.quantity), 0)
      const sorti = Number(l.quantityServed ?? 0) + complete
      return {
        productName: l.productName,
        productRef: l.productRef,
        categoryName: l.categoryName,
        unitSymbol: l.unit?.symbol ?? '',
        stockFixe: Number(l.stockFixe),
        quantityAsked: Number(l.quantityAsked),
        firstServed: Number(l.quantityServed ?? 0),
        // Rien n'est encore sorti : la colonne reste vide pour le stylo.
        quantity: null,
        remaining: Math.max(Number(l.quantityAsked) - sorti, 0),
        orderRef: ref,
        status: l.status,
      }
    })

  // L'ordre de l'écran, à la ligne près : les ajustées puis les ruptures,
  // familles groupées dans chaque bloc. On descend au magasin avec ce papier
  // et on reporte ensuite à l'écran ligne par ligne ; deux ordres différents
  // obligeraient à chercher chaque article au lieu de suivre la liste.
  const ordonnees = (['ADJUSTED', 'REJECTED'] as const).flatMap((etat) => {
    const g = lines.filter((l) => l.status === etat)
    const familles: string[] = []
    for (const l of g) if (!familles.includes(l.categoryName)) familles.push(l.categoryName)
    return familles.flatMap((c) => g.filter((l) => l.categoryName === c))
  })

  if (orders.length === 0 || ordonnees.length === 0) notFound()

  const premier = orders[0]

  return (
    <RefillTicketSheet
      blank
      refill={{
        rank,
        createdAt: new Date().toISOString(),
        createdBy: null,
        order: {
          reference: orders.map((o) => o.reference).join(' · '),
          ticketNumber: premier.ticketNumber,
          businessDay: premier.businessDay.toISOString(),
          department: premier.department,
          createdBy: premier.createdBy,
        },
        lines: ordonnees,
      }}
    />
  )
}
