import type { Metadata } from 'next'
import Link from 'next/link'
import { History } from 'lucide-react'
import { executeGraphQL } from '@/server/graphql/execute'
import { requireRole } from '@/server/auth/guards'
import { PageHeader } from '@/components/ui/stat'
import { GlassCard, EmptyState, TableWrap, Th, Td } from '@/components/ui/glass'
import { DateRangeFilter } from '@/components/orders/date-range-filter'
import { formatLongDate, formatQty, formatTime } from '@/lib/utils'

export const metadata: Metadata = { title: 'Historique des Z' }
export const dynamic = 'force-dynamic'

const QUERY = /* GraphQL */ `
  query ZHistory($from: Date, $to: Date) {
    salesReports(limit: 120, from: $from, to: $to) {
      id
      businessDay
      note
      createdAt
      createdBy { fullName }
      lineCount
      totalQuantity
      totalAmount
    }
  }
`

type Report = {
  id: string
  businessDay: string
  note: string | null
  createdAt: string
  createdBy: { fullName: string } | null
  lineCount: number
  totalQuantity: number
  totalAmount: number
}

/** Une borne de période, ou rien si la saisie est incomplète. */
function borne(v: string | undefined): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

/**
 * Les Z enregistrés, du plus récent au plus ancien.
 *
 * Une ligne par journée de service : c'est la maille du Z, et deux feuilles
 * ne peuvent pas coexister sur la même date.
 */
export default async function ZHistoriquePage({
  searchParams,
}: {
  searchParams: Promise<{ du?: string; au?: string }>
}) {
  const { du, au } = await searchParams
  let a = borne(du)
  let b = borne(au)
  // Choisir « du 14 au 10 » est courant dans deux champs de date : on
  // réordonne plutôt que de rendre une liste vide.
  if (a && b && a > b) [a, b] = [b, a]

  const [, { salesReports }] = await Promise.all([
    requireRole(['CONTROLEUR', 'ADMIN'], '/controle/login'),
    executeGraphQL<{ salesReports: Report[] }>(QUERY, { from: a, to: b }),
  ])

  return (
    <>
      <PageHeader
        title="Historique des Z"
        description="Les notes Z enregistrées, journée par journée."
      />

      <DateRangeFilter from={a} to={b} basePath="/controle/historique" />

      {salesReports.length === 0 ? (
        <GlassCard>
          {/* Une période vide n'est pas un historique vide : sans le dire, on
              croirait avoir tout perdu. */}
          <EmptyState
            icon={<History className="size-6" />}
            title={a || b ? 'Aucun Z sur cette période' : 'Aucun Z enregistré'}
            description={
              a || b
                ? 'Élargissez les bornes ou revenez à tout l’historique.'
                : 'Saisissez la première note Z depuis l’écran « Note Z ».'
            }
          />
        </GlassCard>
      ) : (
        <GlassCard>
          <TableWrap minWidth="44rem">
            <thead>
              <tr>
                <Th>Journée</Th>
                <Th className="text-right">Articles</Th>
                <Th className="text-right">Quantité</Th>
                <Th className="text-right">Recette</Th>
                <Th>Saisi par</Th>
                <Th className="w-full">Remarque</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
              {salesReports.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-[rgb(var(--glass-edge)/0.08)]">
                  <Td className="whitespace-nowrap capitalize font-medium text-fg">
                    <Link href={`/controle/z?jour=${r.businessDay}`} className="block">
                      {formatLongDate(r.businessDay)}
                      <span className="ml-1.5 text-[0.75rem] font-normal text-fg-subtle">
                        saisi à {formatTime(r.createdAt)}
                      </span>
                    </Link>
                  </Td>
                  <Td className="text-right tabular-nums text-fg-muted">{r.lineCount}</Td>
                  <Td className="text-right font-semibold tabular-nums text-fg">
                    {formatQty(r.totalQuantity)}
                  </Td>
                  <Td className="text-right tabular-nums text-fg-muted">
                    {r.totalAmount > 0 ? formatQty(r.totalAmount, 3) : '—'}
                  </Td>
                  <Td className="whitespace-nowrap text-fg-muted">
                    {r.createdBy?.fullName ?? <span className="text-fg-subtle">—</span>}
                  </Td>
                  <Td className="text-[0.82rem] text-fg-muted">
                    {r.note ?? <span className="text-fg-subtle">—</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <p className="border-t border-[rgb(var(--glass-edge)/0.14)] px-4 py-2.5 text-[0.78rem] tabular-nums text-fg-subtle">
            {salesReports.length} note{salesReports.length > 1 ? 's' : ''} Z
            {a || b ? ' sur la période' : ''}
          </p>
        </GlassCard>
      )}
    </>
  )
}
