import type { Metadata } from 'next'
import Link from 'next/link'
import { Ban, Layers, Pencil } from 'lucide-react'
import { prisma } from '@/server/db'
import { executeGraphQL } from '@/server/graphql/execute'
import { PageHeader } from '@/components/ui/stat'
import { Badge, Button } from '@/components/ui/glass'
import { formatLongDate } from '@/lib/utils'
import { DayBoard, DayTotals, type Board } from '@/components/orders/day-board'
import { DaySummary } from '@/components/orders/day-summary'
import { DayPicker } from '@/components/orders/day-picker'
import { DepartmentFilter } from '@/components/orders/department-filter'
import { UrgentOrderButton } from '@/components/orders/urgent-order-button'
import { DAY_BOARD_QUERY } from '@/lib/queries'

export const metadata: Metadata = { title: 'Tableau de bord' }
export const dynamic = 'force-dynamic'

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string; jusquau?: string; dep?: string }>
}) {
  const { jour, jusquau, dep } = await searchParams
  const [data, allDepartments] = await Promise.all([
    executeGraphQL<{ dayBoard: Board; activeDays: string[] }>(DAY_BOARD_QUERY, {
      day: jour ?? null,
      dayTo: jusquau ?? null,
    }),
    // La barre liste tous les services actifs, pas seulement ceux qui ont
    // commandé : sinon elle disparaîtrait les jours creux.
    prisma.department.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, color: true, icon: true },
    }),
  ])
  const board = data.dayBoard

  const groups = board.departments
  // Un département actif reste sélectionnable même sans commande du jour :
  // constater qu'un service n'a rien passé fait partie du pilotage.
  const selected = dep && allDepartments.some((d) => String(d.id) === dep) ? dep : null
  const shown = selected ? groups.filter((g) => g.department.id === selected) : groups
  // Sur une journée, les services qui n'ont pas commandé gardent leur
  // espace sur le tableau ; sur une période, on ne montre que ce qui a eu lieu.
  const vides = board.isRange
    ? []
    : allDepartments
        .filter((d) => !groups.some((g) => g.department.id === String(d.id)))
        .filter((d) => !selected || String(d.id) === selected)
        .map((d) => ({ id: String(d.id), name: d.name, color: d.color, icon: d.icon }))

  // Les totaux suivent le filtre. Garder ceux de la journée entière ferait
  // afficher « 3 tickets » au-dessus d'un seul, et l'écran se contredirait.
  const b: Board = selected
    ? {
        ...board,
        departments: shown,
        orderCount: shown.reduce((n, g) => n + g.orderCount, 0),
        lineCount: shown.reduce((n, g) => n + g.lineCount, 0),
        totalAsked: shown.reduce((n, g) => n + g.totalAsked, 0),
        totalServed: shown.reduce((n, g) => n + g.totalServed, 0),
        pendingCount: shown.reduce(
          (n, g) => n + g.orders.filter((o) => o.status === 'PENDING').length, 0,
        ),
      }
    : board

  // Les comptes portent sur le service choisi : ce qu'il reste à servir.
  const ruptures = shown.reduce((n, g) => n + g.orders.reduce((m, o) => m + o.rejectedCount, 0), 0)
  const ajustees = shown.reduce((n, g) => n + g.orders.reduce((m, o) => m + o.adjustedCount, 0), 0)
  // La vue des écarts reprend la journée et le service affichés ici.
  const lienEcart = (type: 'rupture' | 'ajuste' | 'tous') => {
    const p = new URLSearchParams({ jour: board.day, type })
    if (board.isRange) p.set('jusquau', board.dayTo)
    if (selected) p.set('dep', selected)
    return p.toString()
  }

  return (
    <>
      {/* Mobile : le geste d'urgence en haut à gauche, avant tout le reste. */}
      <div className="mb-3 sm:hidden">
        <UrgentOrderButton
          departments={allDepartments.map((d) => ({
            id: String(d.id), name: d.name, color: d.color, icon: d.icon,
          }))}
        />
      </div>
      <PageHeader
        title="Pilotage général"
        description={
          b.isRange
            ? 'Période : tickets de toutes les journées, cumulés par département.'
            : 'Journée de service : tickets par département, quantités commandées et servies.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Sur grand écran, à côté de la date ; sur mobile il est rendu
                en tête de page, à gauche — voir plus haut. */}
            <UrgentOrderButton
              className="hidden sm:inline-flex"
              departments={allDepartments.map((d) => ({
                id: String(d.id), name: d.name, color: d.color, icon: d.icon,
              }))}
            />
            <DayPicker
              days={data.activeDays}
              current={b.day}
              currentTo={b.isRange ? b.dayTo : null}
              basePath="/admin"
              keep={selected}
            />
          </div>
        }
      >
        {/* Les mêmes pastilles que l'économat : l'administration sert et
            corrige les écarts elle aussi, depuis son espace. */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[0.9rem] font-semibold capitalize text-fg">
            {formatLongDate(b.day)}
          </span>
          {b.pendingCount > 0 ? (
            <Badge tone="warn">{b.pendingCount} en attente de traitement</Badge>
          ) : null}
          {ruptures > 0 ? (
            <Link href={`/admin/ecarts?${lienEcart('rupture')}`}>
              <Button variant="danger" size="sm">
                <Ban className="size-3.5" />
                {ruptures} rupture{ruptures > 1 ? 's' : ''}
              </Button>
            </Link>
          ) : null}
          {ajustees > 0 ? (
            <Link href={`/admin/ecarts?${lienEcart('ajuste')}`}>
              <Button variant="warning" size="sm">
                <Pencil className="size-3.5" />
                {ajustees} ajustée{ajustees > 1 ? 's' : ''}
              </Button>
            </Link>
          ) : null}
          {ruptures > 0 && ajustees > 0 ? (
            <Link href={`/admin/ecarts?${lienEcart('tous')}`}>
              <Button variant="success" size="sm">
                <Layers className="size-3.5" />
                Tout ({ruptures + ajustees})
              </Button>
            </Link>
          ) : null}
        </div>
      </PageHeader>

      <DepartmentFilter
        departments={allDepartments.map((d) => ({
          id: String(d.id), name: d.name, color: d.color, icon: d.icon,
        }))}
        groups={groups}
        current={selected}
        basePath="/admin"
        day={board.day}
        dayTo={board.isRange ? board.dayTo : null}
      />

      {/* La date est portée par le bandeau : la répéter ici faisait doublon. */}
      <DaySummary board={b} />

      <DayBoard board={b} basePath="/admin/commandes" admin vides={vides} />
      {b.orderCount > 0 ? <DayTotals board={b} /> : null}
    </>
  )
}
