import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/server/db'
import { executeGraphQL } from '@/server/graphql/execute'
import { requireRole } from '@/server/auth/guards'
import { BackLink } from '@/components/ui/back-link'
import { CumulArticles, type CumulLine } from './cumul-articles'

export const metadata: Metadata = { title: 'Articles de toute la journée' }
export const dynamic = 'force-dynamic'

const QUERY = /* GraphQL */ `
  query ArticlesCumules($departmentId: ID!, $day: Date, $dayTo: Date) {
    dayArticles(departmentId: $departmentId, day: $day, dayTo: $dayTo) {
      productId productName productRef categoryName unitSymbol
      stockFixe quantityAsked quantityServed ticketCount status servedRank urgentAsked
    }
    dayBoard(day: $day, dayTo: $dayTo) {
      day dayTo isRange
      departments { department { id } orderCount orders { id reference status createdBy { fullName } } }
    }
  }
`

type Board = {
  day: string
  dayTo: string
  isRange: boolean
  departments: {
    department: { id: string }
    orderCount: number
    orders: { id: string; reference: string; status: string; createdBy: { fullName: string } }[]
  }[]
}

/**
 * Tout ce qu'un département a commandé sur la journée, article par article.
 *
 * Le pied de bloc « Voir les articles cumulés » ouvrait une fenêtre : trop
 * étroite pour cent lignes, et sans papier. Cette page se lit comme la fiche
 * d'un ticket — mêmes colonnes, mêmes couleurs — mais pour le rayon entier :
 * un article revenu sur plusieurs tickets y est additionné.
 */
export default async function ArticlesCumulesPage({
  searchParams,
}: {
  searchParams: Promise<{ dep?: string; jour?: string; jusquau?: string }>
}) {
  await requireRole(['ECONOMAN', 'ADMIN'], '/economat/login')
  const { dep, jour, jusquau } = await searchParams
  const departmentId = Number(dep)
  if (!Number.isInteger(departmentId)) notFound()

  const [department, data] = await Promise.all([
    prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true, color: true, icon: true },
    }),
    executeGraphQL<{ dayArticles: CumulLine[]; dayBoard: Board }>(QUERY, {
      departmentId: String(departmentId), day: jour ?? null, dayTo: jusquau ?? null,
    }),
  ])
  if (!department) notFound()

  const board = data.dayBoard
  const rayon = board.departments.find((d) => d.department.id === String(departmentId))
  const tickets = rayon?.orderCount ?? 0
  // Les tickets encore en attente : on peut les accepter tous d'ici.
  const enAttente = (rayon?.orders ?? [])
    .filter((o) => o.status === 'PENDING')
    .map((o) => ({ id: o.id, reference: o.reference, auteur: o.createdBy.fullName }))
  const retour = `/economat?jour=${board.day}${board.isRange ? `&jusquau=${board.dayTo}` : ''}`

  return (
    <>
      <BackLink href={retour}>Retour</BackLink>
      <CumulArticles
        department={department}
        day={board.day}
        dayTo={board.isRange ? board.dayTo : null}
        tickets={tickets}
        enAttente={enAttente}
        lines={data.dayArticles}
      />
    </>
  )
}
