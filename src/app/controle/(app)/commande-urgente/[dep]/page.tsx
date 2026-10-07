import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Siren } from 'lucide-react'
import { prisma } from '@/server/db'
import { executeGraphQL } from '@/server/graphql/execute'
import { requireRole } from '@/server/auth/guards'
import { PageHeader } from '@/components/ui/stat'
import { Icon } from '@/components/ui/icon'
import { LiveClock } from '@/components/ui/live-clock'
import { NewOrderForm, type CatalogProduct } from '@/app/employe/commande/new-order-form'
import { businessDay, formatLongDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Commande urgente' }
export const dynamic = 'force-dynamic'

const QUERY = /* GraphQL */ `
  query Catalog {
    myCatalog {
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
 * La commande urgente du contrôle de gestion, pour le département où il est
 * entré : on tape directement les quantités, sans horaire ni plafond. Le
 * ticket porte son nom.
 */
export default async function ControleUrgentPage({ params }: { params: Promise<{ dep: string }> }) {
  const user = await requireRole(['CONTROLEUR'], '/controle/login')
  const { dep } = await params
  // La feuille est celle du département où le contrôleur est entré : on y
  // passe par le menu des départements.
  if (!user.departmentId || String(user.departmentId) !== dep) redirect('/controle/commande-urgente')

  const [department, data] = await Promise.all([
    prisma.department.findUnique({ where: { id: user.departmentId }, select: { id: true, name: true, color: true, icon: true } }),
    executeGraphQL<{ myCatalog: CatalogProduct[] }>(QUERY),
  ])
  if (!department) redirect('/controle/commande-urgente')

  return (
    <>
      <PageHeader
        title="Commande urgente"
        description={`La feuille de ${department.name}. Tapez directement les quantités à commander, sans limite de stock fixe. Le ticket portera votre nom.`}
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
          <span className="inline-flex items-center gap-1 rounded-full bg-[#7f1d1d] px-2.5 py-1 text-[0.72rem] font-bold uppercase tracking-wide text-white">
            <Siren className="size-3.5" aria-hidden="true" />
            Urgent — {user.fullName}
          </span>
        </div>
      </PageHeader>
      <NewOrderForm
        products={data.myCatalog}
        departmentName={department.name}
        userName={user.fullName}
        businessDay={businessDay().toISOString()}
        urgent={{ departmentId: String(department.id), retour: '/employe/commandes' }}
      />
    </>
  )
}
