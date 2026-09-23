import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
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

export const metadata: Metadata = { title: 'Modifier la commande urgente' }
export const dynamic = 'force-dynamic'

const QUERY = /* GraphQL */ `
  query UrgentToEdit($id: ID!, $departmentId: ID!) {
    order(id: $id) {
      id reference status isUrgent note
      department { id }
      lines { productId quantityOnHand }
    }
    departmentCatalog(departmentId: $departmentId) {
      id name reference stockFixe
      category { id name icon }
      baseUnit { id symbol allowsDecimals }
    }
  }
`

type Data = {
  order: {
    id: string; reference: string; status: string; isUrgent: boolean; note: string | null
    department: { id: string }
    lines: { productId: string; quantityOnHand: number }[]
  } | null
  departmentCatalog: CatalogProduct[]
}

/**
 * La feuille d'une commande urgente, rouverte pour la corriger.
 *
 * Même écran que l'envoi, prérempli avec le stock compté à l'envoi ; le
 * ticket garde son numéro. Possible tant que l'économat ne l'a pas acceptée.
 */
export default async function EditUrgentOrderPage({
  params,
}: {
  params: Promise<{ dep: string; id: string }>
}) {
  const user = await requireRole(['ADMIN'], '/admin/login')
  const { dep, id } = await params
  const departmentId = Number(dep)
  if (!Number.isInteger(departmentId)) notFound()

  const [department, data] = await Promise.all([
    prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true, color: true, icon: true },
    }),
    executeGraphQL<Data>(QUERY, { id, departmentId: String(departmentId) }),
  ])
  if (!department || !data.order || data.order.department.id !== String(departmentId)) notFound()
  if (data.order.status !== 'PENDING') redirect(`/admin/commandes/${id}`)

  const onHand = Object.fromEntries(
    data.order.lines.map((l) => [l.productId, String(l.quantityOnHand)]),
  )

  return (
    <>
      <BackLink href={`/admin/commandes/${id}`}>Retour</BackLink>
      <PageHeader
        title="Modifier la commande urgente"
        description={`Ticket ${data.order.reference} — possible tant que l’économat ne l’a pas acceptée.`}
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
        editing={{
          id: data.order.id,
          reference: data.order.reference,
          note: data.order.note,
          onHand,
        }}
      />
    </>
  )
}
