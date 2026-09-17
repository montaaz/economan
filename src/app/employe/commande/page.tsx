import type { Metadata } from 'next'
import { executeGraphQL } from '@/server/graphql/execute'
import { PageHeader } from '@/components/ui/stat'
import { requireEmployeeDepartment } from '@/server/auth/guards'
import { businessDay, formatLongDate } from '@/lib/utils'
import { LiveClock } from '@/components/ui/live-clock'
import { NewOrderForm, type CatalogProduct } from './new-order-form'

export const metadata: Metadata = { title: 'Nouvelle commande' }
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

export default async function NewOrderPage() {
  const user = await requireEmployeeDepartment()
  const data = await executeGraphQL<{ myCatalog: CatalogProduct[] }>(QUERY)

  return (
    <>
      {/* La date accompagne le titre plutôt que le cartouche de la feuille :
          c'est la première chose à vérifier avant de saisir. */}
      <PageHeader
        title="Nouvelle commande"
        actions={
          <p className="flex items-baseline gap-2.5 text-[1.15rem] font-bold tabular-nums text-fg sm:text-[1.3rem]">
            <span className="capitalize">{formatLongDate(businessDay())}</span>
            <LiveClock />
          </p>
        }
      />
      <NewOrderForm
        products={data.myCatalog}
        departmentName={user.departmentName ?? '—'}
        userName={user.fullName}
        businessDay={businessDay().toISOString()}
      />
    </>
  )
}
