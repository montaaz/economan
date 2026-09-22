import type { Metadata } from 'next'
import { executeGraphQL } from '@/server/graphql/execute'
import { requireRole } from '@/server/auth/guards'
import { PageHeader } from '@/components/ui/stat'
import { CardManager, type CardFamily, type Dept } from './card-manager'

export const metadata: Metadata = { title: 'Carte de vente' }
export const dynamic = 'force-dynamic'

const QUERY = /* GraphQL */ `
  query Card {
    salesCard(includeInactive: false) {
      id
      name
      sortOrder
      itemCount
      items { id name code price sortOrder department { id name color } }
    }
    departments { id name color icon }
  }
`

/**
 * La carte de vente, réglée par l'administration.
 *
 * C'est elle qui alimente la saisie du Z : sans carte, le contrôle n'a rien
 * à pointer. Distincte du catalogue d'économat — on ne vend pas ce qu'on
 * stocke, et les deux nomenclatures n'ont pas les mêmes lignes.
 */
export default async function CartePage() {
  const [, { salesCard, departments }] = await Promise.all([
    requireRole(['ADMIN'], '/admin/login'),
    executeGraphQL<{ salesCard: CardFamily[]; departments: Dept[] }>(QUERY),
  ])

  return (
    <>
      <PageHeader
        title="Carte de vente"
        description="Les familles et les articles tels qu’ils sortent sur le Z de la caisse. Le contrôle de gestion y pointe les ventes de chaque journée."
      />
      <CardManager families={salesCard} departments={departments} />
    </>
  )
}
