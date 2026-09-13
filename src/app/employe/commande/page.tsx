import type { Metadata } from 'next'
import { executeGraphQL } from '@/server/graphql/execute'
import { PageHeader } from '@/components/ui/stat'
import { requireEmployeeDepartment } from '@/server/auth/guards'
import { businessDay } from '@/lib/utils'
import { NewOrderForm, type CatalogProduct } from './new-order-form'

export const metadata: Metadata = { title: 'Nouvelle commande' }
export const dynamic = 'force-dynamic'

const QUERY = /* GraphQL */ `
  query Catalog {
    myCatalog {
      id
      name
      reference
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
      <PageHeader
        title="Nouvelle commande"
        description="Renseignez chaque ligne de la feuille. Saisissez 0 pour un article dont vous n’avez pas besoin — seules les quantités supérieures à 0 partent à l’économat."
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
