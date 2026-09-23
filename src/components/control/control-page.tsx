import { ClipboardCheck } from 'lucide-react'
import { prisma } from '@/server/db'
import { executeGraphQL } from '@/server/graphql/execute'
import { requireRole } from '@/server/auth/guards'
import { PageHeader } from '@/components/ui/stat'
import { GlassCard, Badge, EmptyState } from '@/components/ui/glass'
import { DepartmentFilter } from '@/components/orders/department-filter'
import { DayInput } from '@/components/orders/day-input'
import { ControlTable, type ControlGroup } from './control-table'
import { formatLongDate, businessDay, toDateKey } from '@/lib/utils'

const QUERY = /* GraphQL */ `
  query Control($day: Date, $departmentId: ID) {
    stockControl(day: $day, departmentId: $departmentId) {
      department { id name code color icon }
      lineCount
      uncountedCount
      soldOn
      zMissing
      lines {
        productId
        productName
        productRef
        categoryName
        unitSymbol
        stockFixe
        countedStock
        quantityAsked
        quantityServed
        gap
        countedPrev
        countedPrevOn
        deliveredSince
        soldSince
        soldFromZ
        soldDeclared
        expected
        variance
      }
    }
  }
`

/**
 * Contrôle des stocks : ce que chaque service détient face à sa cible.
 *
 * Le comptage vient de la commande du jour — c'est là que l'employé déclare
 * son rayon. Le contrôle lit la même feuille que l'économat, avec les mêmes
 * familles et le même filtre par service, pour qu'on parle des mêmes lignes.
 */
export async function ControlPage({
  searchParams, base,
}: {
  searchParams: Promise<{ jour?: string; dep?: string }>
  /** L'espace appelant : le contrôle ou l'administration, même écran. */
  base: '/controle' | '/admin/controle'
}) {
  const { jour, dep } = await searchParams
  const [, allDepartments] = await Promise.all([
    requireRole(['CONTROLEUR', 'ADMIN'], base === '/controle' ? '/controle/login' : '/admin/login'),
    prisma.department.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, color: true, icon: true },
    }),
  ])

  const day = jour ?? toDateKey(businessDay())
  const selected = dep && allDepartments.some((d) => String(d.id) === dep) ? dep : null

  const { stockControl } = await executeGraphQL<{ stockControl: ControlGroup[] }>(QUERY, {
    day,
    departmentId: selected,
  })

  const lignes = stockControl.reduce((n, g) => n + g.lineCount, 0)
  const nonComptees = stockControl.reduce((n, g) => n + g.uncountedCount, 0)

  return (
    <>
      <PageHeader
        title="Contrôle des stocks"
        description="Stock fixe, stock compté, stock théorique (compté la veille + livré − vendu d’après le Z et les fiches techniques) et l’écart qui dit si le comptage tient."
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[0.9rem] font-semibold capitalize text-fg">
            {formatLongDate(day)}
          </span>
          <Badge tone="neutral">{lignes} ligne{lignes > 1 ? 's' : ''}</Badge>
          {/* Un rayon non compté n'est pas un rayon plein : sans commande ce
              jour-là, le service n'a rien déclaré. */}
          {nonComptees > 0 ? (
            <Badge tone="warn">{nonComptees} non compté{nonComptees > 1 ? 's' : ''}</Badge>
          ) : null}
        </div>
      </PageHeader>

      <DayInput value={day} basePath={base} label="Journée" />

      <DepartmentFilter
        departments={allDepartments.map((d) => ({
          id: String(d.id), name: d.name, color: d.color, icon: d.icon,
        }))}
        groups={[]}
        // La pastille compte les articles de la feuille, pas des tickets.
        counts={new Map(stockControl.map((g) => [String(g.department.id), g.lineCount]))}
        current={selected}
        basePath={base}
        day={day}
        dayTo={null}
      />

      {stockControl.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<ClipboardCheck className="size-6" />}
            title="Aucun service"
            description="Aucun département actif ne porte d’articles pour cette journée."
          />
        </GlassCard>
      ) : (
        <div className="space-y-5">
          {stockControl.map((g) => (
            <ControlTable key={g.department.id} group={g} day={day} zPath={base === '/controle' ? '/controle/z' : null} />
          ))}
        </div>
      )}
    </>
  )
}
