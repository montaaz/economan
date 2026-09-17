'use client'

import * as React from 'react'
import { ChevronRight, Loader2, PackageSearch } from 'lucide-react'
import { Badge, EmptyState, TableWrap, Th, Td } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { Modal } from '@/components/ui/modal'
import { gql, errorMessage } from '@/lib/graphql-client'
import { cn, formatLongDate, formatQty } from '@/lib/utils'
import type { Board } from './day-board'

const BY_DEPARTMENT = /* GraphQL */ `
  query DayArticlesByDepartment($day: Date) {
    dayArticlesByDepartment(day: $day) {
      department { id name color icon }
      articleCount
      orderCount
      totalAsked
      totalServed
      lines {
        productId
        productName
        productRef
        categoryName
        unitSymbol
        quantityAsked
        quantityServed
        ticketCount
      }
    }
  }
`

type Line = {
  productId: string
  productName: string
  productRef: string
  categoryName: string
  unitSymbol: string
  quantityAsked: number
  quantityServed: number
  ticketCount: number
}

type Group = {
  department: { id: string; name: string; color: string; icon: string | null }
  articleCount: number
  orderCount: number
  totalAsked: number
  totalServed: number
  lines: Line[]
}

/** Total de la journée, toutes commandes confondues. Cliquable. */
export function DayTotals({ board }: { board: Board }) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      {/* Le total ferme la page avec le même poids que le bandeau de tête :
          la journée s'ouvre et se referme sur le même fond sombre. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative mt-6 block w-full overflow-hidden rounded-[calc(var(--radius)+6px)] border border-white/12 p-4 text-left text-white shadow-[0_24px_60px_-22px_rgb(var(--shadow-ambient)/0.5)] transition-transform duration-200 hover:-translate-y-0.5 sm:p-5"
        style={{ background: 'linear-gradient(150deg, #16305c 0%, #0f2247 60%, #0b1830 100%)' }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(30rem 16rem at 95% 0%, rgb(106 168 242 / 0.28), transparent 62%)',
          }}
        />
        <div className="relative z-[1] flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-white/50 sm:text-[0.74rem]">
              Total de la journée
            </p>
            <p className="mt-1 text-[0.92rem] tabular-nums text-white/65 sm:text-[0.85rem]">
              {board.departments.length} département{board.departments.length > 1 ? 's' : ''} ·{' '}
              {board.orderCount} ticket{board.orderCount > 1 ? 's' : ''} · {board.lineCount} ligne
              {board.lineCount > 1 ? 's' : ''}
            </p>
            <p className="mt-2 inline-flex items-center gap-1 text-[0.92rem] font-semibold text-[#8fc0f7] sm:text-[0.85rem]">
              Voir tous les articles
              <ChevronRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </p>
          </div>
          <div className="flex items-baseline gap-6">
            <div className="text-right">
              <p className="text-[0.76rem] font-medium uppercase tracking-wide text-white/50 sm:text-[0.72rem]">Demandé</p>
              <p className="text-[2rem] font-bold leading-none tabular-nums text-white sm:text-[1.85rem]">
                {formatQty(board.totalAsked)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[0.76rem] font-medium uppercase tracking-wide text-white/50 sm:text-[0.72rem]">Servi</p>
              <p className="text-[2rem] font-bold leading-none tabular-nums text-[#6ee7b7] sm:text-[1.85rem]">
                {formatQty(board.totalServed)}
              </p>
            </div>
          </div>
        </div>
      </button>

      {open ? <AllDepartments board={board} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function AllDepartments({ board, onClose }: { board: Board; onClose: () => void }) {
  const [groups, setGroups] = React.useState<Group[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let vivant = true
    gql<{ dayArticlesByDepartment: Group[] }>(BY_DEPARTMENT, { day: board.day })
      .then((d) => {
        if (vivant) setGroups(d.dayArticlesByDepartment)
      })
      .catch((e) => {
        if (vivant) setError(errorMessage(e))
      })
    return () => {
      vivant = false
    }
  }, [board.day])

  return (
    <Modal title={`Journée du ${formatLongDate(board.day)}`} onClose={onClose} wide>
      {error ? (
        <p role="alert" className="text-[0.85rem] font-medium text-danger">{error}</p>
      ) : groups === null ? (
        <p className="flex items-center gap-2 py-6 text-[0.85rem] text-fg-muted">
          <Loader2 className="size-4 animate-spin" />
          Chargement…
        </p>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<PackageSearch className="size-6" />}
          title="Aucune commande"
          description="Aucun département n’a commandé ce jour-là."
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">
              {groups.length} département{groups.length > 1 ? 's' : ''}
            </Badge>
            <Badge tone="neutral">
              {board.orderCount} ticket{board.orderCount > 1 ? 's' : ''}
            </Badge>
            <Badge tone="accent">{formatQty(board.totalAsked)} demandé</Badge>
            {board.totalServed > 0 ? (
              <Badge tone="ok">{formatQty(board.totalServed)} servi</Badge>
            ) : null}
          </div>

          <div className="max-h-[26rem] space-y-5 overflow-y-auto pr-1">
            {groups.map((g) => (
              <section key={g.department.id}>
                {/* Le département ouvre son bloc, puis viennent ses articles. */}
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-2">
                    <span
                      className="grid size-7 shrink-0 place-items-center rounded-lg text-white"
                      style={{ background: g.department.color }}
                    >
                      <Icon name={g.department.icon ?? 'Building2'} className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[0.92rem] font-bold leading-tight text-fg">
                        {g.department.name}
                      </span>
                      <span className="block text-[0.72rem] tabular-nums text-fg-subtle">
                        {g.articleCount} article{g.articleCount > 1 ? 's' : ''} ·{' '}
                        {g.orderCount} ticket{g.orderCount > 1 ? 's' : ''}
                      </span>
                    </span>
                  </p>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Badge tone="accent">{formatQty(g.totalAsked)} demandé</Badge>
                    {g.totalServed > 0 ? (
                      <Badge tone="ok">{formatQty(g.totalServed)} servi</Badge>
                    ) : null}
                  </span>
                </div>

                <TableWrap minWidth="32rem">
                  <thead>
                    <tr>
                      <Th className="w-10 text-right">#</Th>
                      <Th className="w-full">Article</Th>
                      <Th className="text-right">Tickets</Th>
                      <Th className="text-right">Demandé</Th>
                      <Th className="text-right">Servi</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
                    {g.lines.map((l, i) => {
                      const previous = i > 0 ? g.lines[i - 1] : null
                      const ouvre = previous?.categoryName !== l.categoryName
                      return (
                        <React.Fragment key={l.productId}>
                          {ouvre ? (
                            <tr>
                              <td
                                colSpan={5}
                                className="bg-ok/12 px-2 py-1 text-[0.7rem] font-bold uppercase tracking-[0.06em] text-ok sm:px-3"
                              >
                                {l.categoryName}
                              </td>
                            </tr>
                          ) : null}
                          <tr>
                            <Td className="text-right text-[0.74rem] tabular-nums text-fg-subtle">
                              {i + 1}
                            </Td>
                            <Td className="max-w-0">
                              <p className="truncate text-[0.82rem] font-medium text-fg">
                                {l.productName}
                              </p>
                              <p className="truncate font-mono text-[0.66rem] text-fg-subtle">
                                {l.productRef}
                              </p>
                            </Td>
                            <Td className="text-right tabular-nums text-fg-muted">
                              <span className={cn(l.ticketCount > 1 && 'font-bold text-warn')}>
                                {l.ticketCount}
                              </span>
                            </Td>
                            <Td className="whitespace-nowrap text-right font-medium tabular-nums text-fg">
                              {formatQty(l.quantityAsked)} {l.unitSymbol}
                            </Td>
                            <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">
                              {l.quantityServed > 0 ? (
                                <>
                                  {formatQty(l.quantityServed)} {l.unitSymbol}
                                </>
                              ) : (
                                '—'
                              )}
                            </Td>
                          </tr>
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </TableWrap>
              </section>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
