import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/server/db'
import { executeGraphQL } from '@/server/graphql/execute'
import { requireRole } from '@/server/auth/guards'
import { PageHeader } from '@/components/ui/stat'
import { BackLink } from '@/components/ui/back-link'
import { DayPicker } from '@/components/orders/day-picker'
import { businessDay, formatLongDate, formatPeriod, toDateKey } from '@/lib/utils'
import { Valorisation, type Rayon } from './valorisation'

export const metadata: Metadata = { title: 'Commandes valorisées' }
export const dynamic = 'force-dynamic'

const ARTICLES = /* GraphQL */ `
  query Valo($departmentId: ID!, $day: Date, $dayTo: Date) {
    dayArticles(departmentId: $departmentId, day: $day, dayTo: $dayTo) {
      productId productName productRef categoryName unitSymbol stockFixe quantityAsked quantityServed status quantityOnHand
    }
  }
`
type Article = { productId: string; productName: string; productRef: string; categoryName: string; unitSymbol: string; stockFixe: number; quantityAsked: number; quantityServed: number; status: string; quantityOnHand: number | null }

export default async function ValorisationDepPage({ params, searchParams }: {
  params: Promise<{ dep: string }>
  searchParams: Promise<{ jour?: string; jusquau?: string }>
}) {
  await requireRole(['ADMIN'], '/admin/login')
  const { dep } = await params
  const { jour, jusquau } = await searchParams
  const tous = dep === 'tous'
  if (!tous && !Number.isInteger(Number(dep))) notFound()
  // Sans date choisie : la dernière journée qui a des commandes.
  const jours = (await prisma.$queryRaw<{ j: string }[]>`SELECT DISTINCT "businessDay"::text AS j FROM orders ORDER BY 1 DESC LIMIT 60`).map((r) => r.j)
  const debut = jour ?? jours[0] ?? toDateKey(businessDay())
  const fin = jusquau && jusquau > debut ? jusquau : null
  const periode = fin ? formatPeriod(debut, fin) : formatLongDate(debut)

  // Tous les départements se chargent ; le choix du menu n'est que le filtre de départ.
  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, color: true, icon: true },
  })
  if (departments.length === 0) notFound()

  const rayons: Rayon[] = (await Promise.all(departments.map(async (d) => {
    const [{ dayArticles }, prix] = await Promise.all([
      executeGraphQL<{ dayArticles: Article[] }>(ARTICLES, { departmentId: String(d.id), day: debut, dayTo: fin }),
      prisma.departmentProduct.findMany({ where: { departmentId: d.id }, select: { productId: true, unitPrice: true } }),
    ])
    const prixDe = new Map(prix.map((p) => [String(p.productId), p.unitPrice === null ? null : Number(p.unitPrice)]))
    return {
      id: d.id, nom: d.name, couleur: d.color,
      lignes: dayArticles.map((a) => ({
        id: a.productId, nom: a.productName, reference: a.productRef, famille: a.categoryName, unite: a.unitSymbol,
        fixe: a.stockFixe, restant: a.quantityOnHand, commande: a.quantityAsked,
        servi: a.status === 'REJECTED' ? 0 : a.quantityServed, prix: prixDe.get(a.productId) ?? null,
      })),
    }
  }))).filter((r) => r.lignes.length > 0)

  return (
    <>
      <BackLink href={`/admin/valorisation`}>Changer de département</BackLink>
      <PageHeader title="Commandes valorisées" description={periode} />
      <div className="mb-4">
        <DayPicker days={jours} current={debut} currentTo={fin} basePath={`/admin/valorisation/${dep}`} />
      </div>
      <Valorisation rayons={rayons} departements={departments.map((d) => ({ id: d.id, nom: d.name, couleur: d.color, icon: d.icon }))} initial={tous ? null : Number(dep)} periode={periode} />
    </>
  )
}
