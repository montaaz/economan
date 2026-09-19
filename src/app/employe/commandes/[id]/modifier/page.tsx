import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { executeGraphQL } from '@/server/graphql/execute'
import { PageHeader } from '@/components/ui/stat'
import { requireEmployeeDepartment } from '@/server/auth/guards'
import { businessDay, formatLongDate } from '@/lib/utils'
import { LiveClock } from '@/components/ui/live-clock'
import { NewOrderForm, type CatalogProduct } from '@/app/employe/commande/new-order-form'

export const metadata: Metadata = { title: 'Modifier la commande' }
export const dynamic = 'force-dynamic'

const QUERY = /* GraphQL */ `
  query OrderToEdit($id: ID!) {
    order(id: $id) {
      id
      reference
      status
      note
      lines { productId quantityOnHand }
    }
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

type Data = {
  order: {
    id: string
    reference: string
    status: string
    note: string | null
    lines: { productId: string; quantityOnHand: number }[]
  } | null
  myCatalog: CatalogProduct[]
}

export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireEmployeeDepartment()
  const data = await executeGraphQL<Data>(QUERY, { id })
  if (!data.order) notFound()

  // Une commande prise en charge n'est plus modifiable : on renvoie au détail
  // plutôt que d'afficher un formulaire dont l'envoi serait refusé.
  if (data.order.status !== 'PENDING') redirect(`/employe/commandes/${id}`)

  // Le stock compté à l'envoi, pour rouvrir la feuille telle qu'elle a été
  // remplie. Les articles absents restent vides : ce sont ceux dont le stock
  // couvrait déjà la cible, donc rien n'avait été commandé.
  const onHand = Object.fromEntries(
    data.order.lines.map((l) => [l.productId, String(l.quantityOnHand)]),
  )

  return (
    <>
      <PageHeader
        title="Modifier la commande"
        description={`Ticket ${data.order.reference} — possible tant que l’économat ne l’a pas acceptée.`}
        actions={
          <p className="flex items-baseline gap-2.5 text-[1.15rem] font-bold tabular-nums text-fg sm:text-[1.3rem]">
            <span className="capitalize">{formatLongDate(businessDay())}</span>
            <LiveClock />
          </p>
        }
      >
        <Link
          href={`/employe/commandes/${id}`}
          className="mt-2 inline-flex items-center gap-1.5 text-[0.85rem] font-medium text-accent hover:underline"
        >
          <ArrowLeft className="size-4" />
          Revenir au détail
        </Link>
      </PageHeader>

      <NewOrderForm
        products={data.myCatalog}
        departmentName={user.departmentName ?? '—'}
        userName={user.fullName}
        businessDay={businessDay().toISOString()}
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
