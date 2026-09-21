import type { Metadata } from 'next'
import { prisma } from '@/server/db'
import { executeGraphQL } from '@/server/graphql/execute'
import { PageHeader } from '@/components/ui/stat'
import { DayBoard, DayTotals, type Board } from '@/components/orders/day-board'
import { DayPicker } from '@/components/orders/day-picker'
import { DepartmentFilter } from '@/components/orders/department-filter'
import Link from 'next/link'
import { Ban, Layers, Pencil } from 'lucide-react'
import { Badge, Button } from '@/components/ui/glass'
import { DAY_BOARD_QUERY } from '@/lib/queries'
import { formatLongDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Commandes du jour' }
export const dynamic = 'force-dynamic'

export default async function EconomatPage({
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
  const selected = dep && allDepartments.some((d) => String(d.id) === dep) ? dep : null
  const shown = selected ? groups.filter((g) => g.department.id === selected) : groups
  const parService = shown

  // Les totaux suivent le filtre : garder ceux de la journée entière ferait
  // afficher « 2 tickets » au-dessus d'un seul, et l'écran se contredirait.
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

  // Le compte est déjà dans le tableau : inutile d'une requête de plus pour
  // décider si le bouton a lieu d'être.
  // Les comptes portent sur le service choisi, pas sur la vue déjà filtrée :
  // un bouton qui compterait ses propres résultats ne dirait plus l'ampleur.
  const ruptures = parService.reduce(
    (n, g) => n + g.orders.reduce((m, o) => m + o.rejectedCount, 0), 0,
  )
  const ajustees = parService.reduce(
    (n, g) => n + g.orders.reduce((m, o) => m + o.adjustedCount, 0), 0,
  )

  // La vue des écarts reprend la journée et le service affichés ici.
  const lienEcart = (type: 'rupture' | 'ajuste' | 'tous') => {
    const p = new URLSearchParams({ jour: board.day, type })
    if (board.isRange) p.set('jusquau', board.dayTo)
    if (selected) p.set('dep', selected)
    return p.toString()
  }

  return (
    <>
      <PageHeader
        title="Commandes du jour"
        description="Les tickets reçus, regroupés par département."
        actions={
          <DayPicker
            days={data.activeDays}
            current={b.day}
            currentTo={b.isRange ? b.dayTo : null}
            basePath="/economat"
            keep={selected}
          />
        }
      >
        {/* Un div, pas un p : le bouton des ruptures ouvre une modale qui
            contient un tableau, et un <table> dans un <p> est du HTML
            invalide — React refusait l'hydratation. */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[0.9rem] font-semibold capitalize text-fg">
            {formatLongDate(b.day)}
          </span>
          {b.pendingCount > 0 ? (
            <Badge tone="warn">
              {b.pendingCount} en attente de traitement
            </Badge>
          ) : null}
          {/* Les ruptures sont visibles ticket par ticket ; rien ne les
              rassemblait. Pour savoir ce qui a manqué au magasin dans la
              journée, il fallait ouvrir chaque commande de chaque service. */}
          {/* Le compte mène aux fiches complètes des commandes touchées :
              savoir qu'il y a onze ruptures sans voir les tickets n'apprend
              rien à qui doit les traiter. */}
          {ruptures > 0 ? (
            <Link href={`/economat/ecarts?${lienEcart('rupture')}`}>
              <Button variant="danger" size="sm">
                <Ban className="size-3.5" />
                {ruptures} rupture{ruptures > 1 ? 's' : ''}
              </Button>
            </Link>
          ) : null}
          {ajustees > 0 ? (
            <Link href={`/economat/ecarts?${lienEcart('ajuste')}`}>
              <Button variant="warning" size="sm">
                <Pencil className="size-3.5" />
                {ajustees} ajustée{ajustees > 1 ? 's' : ''}
              </Button>
            </Link>
          ) : null}

          {/* Les deux d'un bloc : c'est la même tournée de correction, et
              passer d'un écran à l'autre pour la faire n'a pas de sens. */}
          {ruptures > 0 && ajustees > 0 ? (
            <Link href={`/economat/ecarts?${lienEcart('tous')}`}>
              <Button variant="secondary" size="sm">
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
        basePath="/economat"
        day={board.day}
        dayTo={board.isRange ? board.dayTo : null}
      />

      <DayBoard board={b} basePath="/economat/commandes" />
      {b.orderCount > 0 ? <DayTotals board={b} /> : null}
    </>
  )
}
