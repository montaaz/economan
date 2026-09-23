import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Siren } from 'lucide-react'
import { prisma } from '@/server/db'
import { executeGraphQL } from '@/server/graphql/execute'
import { requireRole } from '@/server/auth/guards'
import { PageHeader } from '@/components/ui/stat'
import { BackLink } from '@/components/ui/back-link'
import { Icon } from '@/components/ui/icon'
import { LiveClock } from '@/components/ui/live-clock'
import { NewOrderForm, type CatalogProduct } from '@/app/employe/commande/new-order-form'
import { businessDay, formatLongDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Commande urgente' }
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
 * La feuille d'un département, ouverte par l'administration pour une
 * commande urgente.
 *
 * Exactement l'écran de l'employé — même feuille, mêmes familles, même
 * saisie du stock compté, même brouillon — parce que c'est ce geste-là qu'on
 * connaît. Seules changent la personne qui signe et la couleur du ticket.
 */
export default async function UrgentOrderPage({ params }: { params: Promise<{ dep: string }> }) {
  const user = await requireRole(['ADMIN'], '/admin/login')
  const { dep } = await params
  const departmentId = Number(dep)
  if (!Number.isInteger(departmentId)) notFound()

  const [department, data] = await Promise.all([
    prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true, color: true, icon: true },
    }),
    executeGraphQL<{ departmentCatalog: CatalogProduct[] }>(QUERY, { departmentId: String(departmentId) }),
  ])
  if (!department) notFound()

  return (
    <>
      <BackLink href="/admin">Retour</BackLink>
      <PageHeader
        title="Commande urgente"
        description={`La feuille de ${department.name}, telle que ses employés la remplissent. Le ticket portera votre nom.`}
        actions={
          <p className="flex items-baseline gap-2.5 text-[1.15rem] font-bold tabular-nums text-fg sm:text-[1.3rem]">
            <span className="capitalize">{formatLongDate(businessDay())}</span>
            <LiveClock />
          </p>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.8rem] font-semibold text-white"
            style={{ background: department.color }}
          >
            <Icon name={department.icon ?? 'Building2'} className="size-3.5" />
            {department.name}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#7f1d1d] px-2.5 py-1 text-[0.72rem] font-bold uppercase tracking-wide text-white">
            <Siren className="size-3.5" aria-hidden="true" />
            Urgent — {user.fullName}
          </span>
        </div>
      </PageHeader>
      <NewOrderForm
        products={data.departmentCatalog}
        departmentName={department.name}
        userName={user.fullName}
        businessDay={businessDay().toISOString()}
        urgent={{ departmentId: String(department.id) }}
      />
    </>
  )
}
