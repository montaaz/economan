import type { Metadata } from 'next'
import { Receipt } from 'lucide-react'
import { executeGraphQL } from '@/server/graphql/execute'
import { requireRole } from '@/server/auth/guards'
import { PageHeader } from '@/components/ui/stat'
import { Badge } from '@/components/ui/glass'
import { DayInput } from '@/components/orders/day-input'
import { ZForm, type CardItem } from './z-form'
import { formatInstantDate, formatTime } from '@/lib/utils'

export const metadata: Metadata = { title: 'Note Z' }
export const dynamic = 'force-dynamic'

const QUERY = /* GraphQL */ `
  query Z($day: Date) {
    currentSalesDay
    salesCard {
      id
      name
      items { id name code price sortOrder department { id name color icon } }
    }
    departments { id name color icon }
    salesReport(day: $day) {
      id
      businessDay
      note
      createdAt
      createdBy { fullName }
      totalQuantity
      totalAmount
      lineCount
      totalAmount
      byDepartment {
        department { id name color }
        quantity
        amount
        lineCount
      }
      lines { itemId quantity }
    }
  }
`

type Data = {
  currentSalesDay: string
  salesCard: {
    id: string
    name: string
    items: {
      id: string
      name: string
      code: string | null
      price: number | null
      sortOrder: number
      department: { id: string; name: string; color: string; icon: string | null } | null
    }[]
  }[]
  departments: { id: string; name: string; color: string; icon: string | null }[]
  salesReport: {
    id: string
    businessDay: string
    note: string | null
    createdAt: string
    createdBy: { fullName: string } | null
    totalQuantity: number
    totalAmount: number
    lineCount: number
    byDepartment: {
      department: { id: string; name: string; color: string } | null
      quantity: number
      amount: number
      lineCount: number
    }[]
    lines: { itemId: string; quantity: number }[]
  } | null
}

/**
 * Saisie de la note Z d'une journée de service.
 *
 * La journée proposée est celle du service en cours, décalée par la clôture
 * de 3 h : à 02 h 30, c'est encore la veille. Le contrôleur peut en choisir
 * une autre pour rattraper un Z oublié.
 */
export default async function ZPage({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string }>
}) {
  const { jour } = await searchParams
  const [, data] = await Promise.all([
    requireRole(['CONTROLEUR', 'ADMIN'], '/controle/login'),
    executeGraphQL<Data>(QUERY, { day: jour ?? null }),
  ])

  const day = data.salesReport?.businessDay ?? jour ?? data.currentSalesDay

  // La carte à plat : le formulaire groupe lui-même par famille, et n'a
  // besoin que du nom de celle-ci sur chaque ligne.
  const items: CardItem[] = data.salesCard.flatMap((f) =>
    f.items.map((i) => ({ ...i, familyId: f.id, familyName: f.name })),
  )

  const saved = Object.fromEntries(
    (data.salesReport?.lines ?? []).map((l) => [l.itemId, l.quantity]),
  )

  return (
    <>
      <PageHeader
        title="Note Z"
        description="La bande de caisse de la journée, article par article. Le service ferme à 3 h : avant cette heure, la journée proposée est celle de la veille."
        actions={
          data.salesReport ? (
            <Badge tone="ok" icon={<Receipt className="size-3.5" />}>
              Enregistrée le {formatInstantDate(data.salesReport.createdAt)} à{' '}
              {formatTime(data.salesReport.createdAt)}
              {data.salesReport.createdBy ? ` par ${data.salesReport.createdBy.fullName}` : ''}
            </Badge>
          ) : null
        }
      />

      {/* Une seule journée : on saisit un Z, pas une période. */}
      <DayInput
        value={day}
        basePath="/controle/z"
        label="Journée du Z"
        max={data.currentSalesDay}
      />

      <ZForm
        items={items}
        families={data.salesCard.map((f) => ({ id: f.id, name: f.name }))}
        departments={data.departments}
        day={day}
        defaultDay={data.currentSalesDay}
        saved={saved}
        savedNote={data.salesReport?.note ?? null}
        savedTotal={data.salesReport?.totalAmount ?? null}
        savedByDepartment={data.salesReport?.byDepartment ?? []}
      />
    </>
  )
}
