import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/server/db'
import { requireRole } from '@/server/auth/guards'
import { RefillTicketSheet } from '@/components/ui/refill-ticket'
import { businessDay } from '@/lib/utils'

export const metadata: Metadata = { title: 'Bon de servi' }
export const dynamic = 'force-dynamic'

/**
 * Feuille imprimable d'un passage, pour tout un département.
 *
 * Un même service touche plusieurs commandes du même rayon : les réunir sur un
 * seul bon évite de faire circuler deux papiers pour une seule tournée.
 */
export default async function ServiceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ dep?: string; rang?: string; jour?: string }>
}) {
  await requireRole(['ECONOMAN', 'ADMIN'])
  const { dep, rang, jour } = await searchParams
  const departmentId = Number(dep)
  const rank = Number(rang)
  if (!departmentId || !rank) notFound()

  // La journée arrive en AAAA-MM-JJ ; la colonne est de type date.
  const day = jour ? new Date(`${jour}T00:00:00.000Z`) : businessDay()

  const refills = await prisma.orderRefill.findMany({
    where: {
      rank,
      order: { departmentId, businessDay: day },
    },
    include: {
      createdBy: { select: { fullName: true } },
      order: {
        include: {
          department: { select: { name: true, code: true } },
          createdBy: { select: { fullName: true } },
        },
      },
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
    orderBy: { order: { ticketNumber: 'asc' } },
  })
  if (refills.length === 0) notFound()

  const premier = refills[0]

  const lines = refills
    .flatMap((r) => r.lines.map((l) => ({ ...l, ref: r.order.reference })))
    .map((l) => {
      const ol = l.orderLine
      const anterieurs = ol.refills
        .filter((r) => (r.refill?.rank ?? 0) <= rank)
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
        orderRef: l.ref,
        status: ol.status,
      }
    })

  // Le même ordre que l'écran des écarts et que la feuille de tournée : les
  // ajustées puis les ruptures, familles groupées. Le bon se relit en regard
  // de la feuille qu'on vient de remplir ; deux ordres obligeraient à
  // chercher chaque ligne.
  const ordonnees = (['ADJUSTED', 'REJECTED'] as const).flatMap((etat) => {
    const g = lines.filter((l) => l.status === etat)
    const familles: string[] = []
    for (const l of g) if (!familles.includes(l.categoryName)) familles.push(l.categoryName)
    return familles.flatMap((c) => g.filter((l) => l.categoryName === c))
  })

  return (
    <RefillTicketSheet
      refill={{
        rank,
        createdAt: premier.createdAt.toISOString(),
        createdBy: premier.createdBy,
        order: {
          // Le bon porte le département, pas un ticket : plusieurs commandes
          // y figurent, chaque ligne rappelant la sienne.
          reference: refills.map((r) => r.order.reference).join(' · '),
          ticketNumber: premier.order.ticketNumber,
          businessDay: premier.order.businessDay.toISOString(),
          department: premier.order.department,
          createdBy: premier.order.createdBy,
        },
        lines: ordonnees,
      }}
    />
  )
}
