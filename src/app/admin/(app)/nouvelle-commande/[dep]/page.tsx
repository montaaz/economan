import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/server/db'
import { executeGraphQL } from '@/server/graphql/execute'
import { requireRole } from '@/server/auth/guards'
import { PageHeader } from '@/components/ui/stat'
import { BackLink } from '@/components/ui/back-link'
import { Icon } from '@/components/ui/icon'
import { LiveClock } from '@/components/ui/live-clock'
import { NewOrderForm, type CatalogProduct } from '@/app/employe/commande/new-order-form'
import { businessDay, formatLongDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Nouvelle commande' }
export const dynamic = 'force-dynamic'

const QUERY = /* GraphQL */ `
  query DepartmentCatalog($departmentId: ID!) {
    departmentCatalog(departmentId: $departmentId) {
      id
      name
      reference
      stockFixe
      category { id name icon }
      baseUnit { id symbol allowsDecimals }
    }
  }
`

/**
 * La feuille d'un département, remplie par l'administration : la même que
 * celle de ses employés — on compte le stock, la quantité se calcule sur le
 * stock fixe en service. Le ticket porte le nom de l'administrateur.
 */
export default async function AdminNouvelleCommandePage({ params }: { params: Promise<{ dep: string }> }) {
  const user = await requireRole(['ADMIN'], '/admin/login')
  const { dep } = await params
  const departmentId = Number(dep)
  if (!Number.isInteger(departmentId)) notFound()

  const [department, data] = await Promise.all([
    prisma.department.findUnique({ where: { id: departmentId }, select: { id: true, name: true, color: true, icon: true } }),
    executeGraphQL<{ departmentCatalog: CatalogProduct[] }>(QUERY, { departmentId: String(departmentId) }),
  ])
  if (!department) notFound()

  return (
    <>
      <BackLink href="/admin/nouvelle-commande">Changer de département</BackLink>
      <PageHeader
        title="Nouvelle commande"
        description={`La feuille de ${department.name}, comme ses employés la remplissent : saisissez le stock compté, la quantité à commander se calcule. Le ticket portera votre nom.`}
        actions={
          <p className="flex items-baseline gap-2.5 text-[1.15rem] font-bold tabular-nums text-fg sm:text-[1.3rem]">
            <span className="capitalize">{formatLongDate(businessDay())}</span>
            <LiveClock />
          </p>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.8rem] font-semibold text-white" style={{ background: department.color }}>
            <Icon name={department.icon ?? 'Building2'} className="size-3.5" />
            {department.name}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/12 px-2.5 py-1 text-[0.78rem] font-semibold text-accent">
            Commande de {user.fullName}
          </span>
        </div>
      </PageHeader>
      <NewOrderForm
        products={data.departmentCatalog}
        departmentName={department.name}
        userName={user.fullName}
        businessDay={businessDay().toISOString()}
        pour={{ departmentId: String(department.id), retour: '/admin/commandes' }}
      />
    </>
  )
}
