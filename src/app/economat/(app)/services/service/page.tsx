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
  // « 2,3 » : un bon peut rattraper plusieurs passages enregistrés mais pas
  // encore imprimés. Un seul rang garde exactement l'ancienne mise en page.
  const rangs = (rang ?? '')
    .split(',')
    .map((r) => Number(r.trim()))
    .filter((r) => Number.isInteger(r) && r > 1)
    .sort((a, b) => a - b)
  const rank = rangs[rangs.length - 1]
  if (!departmentId || rangs.length === 0) notFound()

  // La journée arrive en AAAA-MM-JJ ; la colonne est de type date.
  const day = jour ? new Date(`${jour}T00:00:00.000Z`) : businessDay()

  const refills = await prisma.orderRefill.findMany({
    where: {
      rank: { in: rangs },
      order: { departmentId, businessDay: day },
    },
    include: {
      createdBy: { select: { fullName: true } },
      order: {
        include: {
          department: { select: { name: true, code: true } },
          createdBy: { select: { fullName: true } },
          // Toutes les lignes du ticket, pour reprendre leur numéro.
          lines: { select: { id: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
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
    orderBy: [{ rank: 'asc' }, { order: { ticketNumber: 'asc' } }],
  })
  if (refills.length === 0) notFound()

  /** Numéro de chaque ligne sur son ticket. */
  const rangDe = new Map<number, number>()
  for (const r of refills) r.order.lines.forEach((l, i) => rangDe.set(l.id, i + 1))

  const premier = refills[0]

  /**
   * Une ligne par article, quels que soient les passages couverts.
   *
   * Un même article servi au 2ᵉ puis au 3ᵉ ne doit pas produire deux lignes :
   * le porteur lirait deux fois le même nom sans savoir s'il prend l'un,
   * l'autre ou les deux. On cumule donc par ligne de commande, en gardant le
   * détail passage par passage.
   */
  const parLigne = new Map<number, {
    productName: string; productRef: string; categoryName: string; unitSymbol: string
    stockFixe: number; quantityAsked: number; firstServed: number
    quantity: number; remaining: number; orderRef: string; status: string
    parRang: Record<number, number>
    /** Ce que les passages d'avant (2ᵉ, 3ᵉ…) ont déjà sorti, rang par rang. */
    precedents: Record<number, number>
    rang: number
    ticket: number
  }>()
  const premierRang = Math.min(...rangs)

  for (const r of refills) {
    for (const l of r.lines) {
      const ol = l.orderLine
      const existante = parLigne.get(l.orderLineId)
      if (existante) {
        existante.quantity += Number(l.quantity)
        existante.parRang[r.rank] = (existante.parRang[r.rank] ?? 0) + Number(l.quantity)
        continue
      }
      // Sorti jusqu'au dernier passage couvert : le premier servi, plus les
      // compléments de rang inférieur ou égal.
      const anterieurs = ol.refills
        .filter((x) => (x.refill?.rank ?? 0) <= rank)
        .reduce((n, x) => n + Number(x.quantity), 0)
      const sorti = Number(ol.quantityServed ?? 0) + anterieurs
      // Les passages d'avant ce bon, chacun avec sa quantité : le porteur
      // du 3ᵉ servi doit voir ce que le 2ᵉ a déjà sorti, pas seulement un
      // reste qui en tient compte sans le dire.
      const precedents: Record<number, number> = {}
      for (const x of ol.refills) {
        const rg = x.refill?.rank ?? 0
        if (rg >= 2 && rg < premierRang) precedents[rg] = (precedents[rg] ?? 0) + Number(x.quantity)
      }
      parLigne.set(l.orderLineId, {
        productName: ol.productName,
        productRef: ol.productRef,
        categoryName: ol.categoryName,
        unitSymbol: ol.unit?.symbol ?? '',
        stockFixe: Number(ol.stockFixe),
        quantityAsked: Number(ol.quantityAsked),
        firstServed: Number(ol.quantityServed ?? 0),
        quantity: Number(l.quantity),
        remaining: Math.max(Number(ol.quantityAsked) - sorti, 0),
        orderRef: r.order.reference,
        status: ol.status,
        parRang: { [r.rank]: Number(l.quantity) },
        precedents,
        rang: rangDe.get(l.orderLineId) ?? 0,
        ticket: r.order.ticketNumber,
      })
    }
  }

  // Le même ordre que l'écran des écarts et que la feuille de tournée : celui
  // de la feuille, ticket par ticket, chaque ligne à son numéro. Le bon se
  // relit en regard de la feuille qu'on vient de remplir ; deux ordres
  // obligeraient à chercher chaque ligne.
  const ordonnees = [...parLigne.values()].sort((a, b) => a.ticket - b.ticket || a.rang - b.rang)
  // Les colonnes des passages antérieurs : tous ceux qui ont sorti quelque
  // chose pour au moins une ligne, dans l'ordre.
  const rangsPrecedents = [...new Set(ordonnees.flatMap((l) => Object.keys(l.precedents).map(Number)))].sort((a, b) => a - b)

  return (
    <RefillTicketSheet
      refill={{
        rank,
        ranks: rangs,
        previousRanks: rangsPrecedents,
        createdAt: premier.createdAt.toISOString(),
        createdBy: premier.createdBy,
        order: {
          // Le bon porte le département, pas un ticket : plusieurs commandes
          // y figurent, chaque ligne rappelant la sienne.
          // Chaque ticket une fois : quatre passages d'une même commande ne
          // font pas quatre références.
          reference: [...new Set(refills.map((r) => r.order.reference))].join(' · '),
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
