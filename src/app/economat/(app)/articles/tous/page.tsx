import type { Metadata } from 'next'
import { Layers, Printer } from 'lucide-react'
import { prisma } from '@/server/db'
import { executeGraphQL } from '@/server/graphql/execute'
import { requireRole } from '@/server/auth/guards'
import { BackLink } from '@/components/ui/back-link'
import { PageHeader } from '@/components/ui/stat'
import { GlassCard, EmptyState } from '@/components/ui/glass'
import { formatJourneeTravail, formatPeriod } from '@/lib/utils'
import { CumulArticles, type CumulLine } from '../cumul-articles'

export const metadata: Metadata = { title: 'Tous les articles de la journée' }
export const dynamic = 'force-dynamic'

const BOARD = /* GraphQL */ `
  query Journee($day: Date, $dayTo: Date) {
    dayBoard(day: $day, dayTo: $dayTo) {
      day dayTo isRange orderCount lineCount
      departments { department { id } orderCount orders { id reference status createdBy { fullName } } }
    }
  }
`
const ARTICLES = /* GraphQL */ `
  query ArticlesDuRayon($departmentId: ID!, $day: Date, $dayTo: Date) {
    dayArticles(departmentId: $departmentId, day: $day, dayTo: $dayTo) {
      productId productName productRef categoryName unitSymbol
      stockFixe quantityAsked quantityServed ticketCount status servedRank urgentAsked
    }
  }
`

type Board = {
  day: string
  dayTo: string
  isRange: boolean
  orderCount: number
  lineCount: number
  departments: {
    department: { id: string }
    orderCount: number
    orders: { id: string; reference: string; status: string; createdBy: { fullName: string } }[]
  }[]
}

/**
 * Le total de la journée : tous les départements sur une seule page, chacun
 * avec le même tableau que « Voir toute la journée » de son bloc — articles,
 * stock fixe, commandé, servi, état, et son impression.
 */
export default async function TousLesArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string; jusquau?: string }>
}) {
  await requireRole(['ECONOMAN', 'ADMIN'], '/economat/login')
  const { jour, jusquau } = await searchParams
  const { dayBoard: board } = await executeGraphQL<{ dayBoard: Board }>(BOARD, { day: jour ?? null, dayTo: jusquau ?? null })
  const rayons = board.departments.filter((d) => d.orderCount > 0)

  const [departments, articles] = await Promise.all([
    prisma.department.findMany({
      where: { id: { in: rayons.map((r) => Number(r.department.id)) } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, color: true, icon: true },
    }),
    Promise.all(rayons.map((r) => executeGraphQL<{ dayArticles: CumulLine[] }>(ARTICLES, {
      departmentId: r.department.id, day: board.day, dayTo: board.isRange ? board.dayTo : null,
    }).then((d) => [r.department.id, d.dayArticles] as const))),
  ])
  const lignesPar = new Map(articles)
  const retour = `/economat?jour=${board.day}${board.isRange ? `&jusquau=${board.dayTo}` : ''}`

  return (
    <>
      <BackLink href={retour}>Retour</BackLink>
      <PageHeader
        title={board.isRange ? 'Total de la période' : 'Total de la journée'}
        description={`${board.isRange ? formatPeriod(board.day, board.dayTo) : formatJourneeTravail(board.day)} · ${departments.length} département(s) · ${board.orderCount} ticket(s) · ${board.lineCount} ligne(s)`}
        actions={departments.length > 0 ? (
          // Un seul PDF : chaque département sur sa page, dans l'ordre.
          <a
            href={`/api/articles-jour?dep=tous&jour=${board.day}${board.isRange ? `&jusquau=${board.dayTo}` : ''}`}
            target="_blank"
            rel="noopener"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-b from-[#4f6ef7] to-[#3b4fd8] px-5 text-[1rem] font-bold text-white shadow-[0_10px_24px_-10px_rgb(59_79_216/0.8)] transition-[filter,transform] hover:brightness-110 active:scale-[0.98]"
          >
            <Printer className="size-5" />
            Imprimer toute la journée · tous les départements
          </a>
        ) : null}
      />
      {departments.length === 0 ? (
        <GlassCard>
          <EmptyState icon={<Layers className="size-6" />} title="Aucune commande" description="Aucun département n’a commandé sur cette journée." />
        </GlassCard>
      ) : (
        <div className="space-y-8">
          {departments.map((d) => {
            const rayon = rayons.find((r) => r.department.id === String(d.id))!
            return (
              <section key={d.id} id={`dep-${d.id}`}>
                <CumulArticles
                  department={d}
                  day={board.day}
                  dayTo={board.isRange ? board.dayTo : null}
                  tickets={rayon.orderCount}
                  enAttente={rayon.orders.filter((o) => o.status === 'PENDING').map((o) => ({ id: o.id, reference: o.reference, auteur: o.createdBy.fullName }))}
                  lines={lignesPar.get(rayon.department.id) ?? []}
                />
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
