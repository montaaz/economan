'use client'

import * as React from 'react'
import { ChevronRight, Layers, Loader2, PackageSearch } from 'lucide-react'
import { Badge, EmptyState, TableWrap, Th, Td } from '@/components/ui/glass'
import { Modal } from '@/components/ui/modal'
import { gql, errorMessage } from '@/lib/graphql-client'
import { cn, formatLongDate, formatQty } from '@/lib/utils'

const DAY_ARTICLES = /* GraphQL */ `
  query DayArticles($departmentId: ID!, $day: Date) {
    dayArticles(departmentId: $departmentId, day: $day) {
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

export type DeptTotal = {
  department: { id: string; name: string; color: string; icon: string | null }
  orderCount: number
  lineCount: number
  totalAsked: number
  totalServed: number
}

/**
 * Sous-total d'un département, sous ses tickets du jour.
 *
 * Cliquable : les cartes montrent les tickets un par un, ce bloc montre ce que
 * le département a commandé en tout — un même article revenant sur plusieurs
 * tickets y est cumulé.
 */
export function DepartmentTotal({ group, day }: { group: DeptTotal; day: string }) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      {/* Pied du bloc département : il en fait partie, d'où l'absence de carte
          propre — une carte de plus aurait rompu l'unité du panneau. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full flex-wrap items-center justify-between gap-3 border-t px-3.5 py-3 text-left transition-colors sm:px-4"
        style={{
          borderColor: `${group.department.color}26`,
          background: `linear-gradient(120deg, ${group.department.color}14, transparent 70%)`,
        }}
        aria-label={`Détail des articles de ${group.department.name}`}
      >
        <div className="min-w-0">
          <p className="text-[0.8rem] font-semibold uppercase tracking-wide text-fg-muted sm:text-[0.74rem]">
            Total {group.department.name}
          </p>
          <p className="mt-1 flex items-center gap-1 text-[0.9rem] font-semibold text-accent sm:text-[0.82rem]">
            Voir les articles cumulés
            <ChevronRight className="size-3.5" />
          </p>
        </div>

        <div className="flex items-baseline gap-5">
          <div className="text-right">
            <p className="text-[0.74rem] font-medium uppercase tracking-wide text-fg-subtle sm:text-[0.7rem]">
              Demandé
            </p>
            <p className="text-[1.4rem] font-bold leading-none tabular-nums text-accent sm:text-[1.3rem]">
              {formatQty(group.totalAsked)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[0.74rem] font-medium uppercase tracking-wide text-fg-subtle sm:text-[0.7rem]">
              Servi
            </p>
            <p className="text-[1.4rem] font-bold leading-none tabular-nums text-ok sm:text-[1.3rem]">
              {formatQty(group.totalServed)}
            </p>
          </div>
        </div>
      </button>

      {open ? (
        <ArticlesDetail group={group} day={day} onClose={() => setOpen(false)} />
      ) : null}
    </>
  )
}

function ArticlesDetail({
  group, day, onClose,
}: {
  group: DeptTotal
  day: string
  onClose: () => void
}) {
  const [lines, setLines] = React.useState<Line[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let vivant = true
    gql<{ dayArticles: Line[] }>(DAY_ARTICLES, { departmentId: group.department.id, day })
      .then((d) => {
        if (vivant) setLines(d.dayArticles)
      })
      .catch((e) => {
        if (vivant) setError(errorMessage(e))
      })
    return () => {
      vivant = false
    }
  }, [group.department.id, day])

  const totalAsked = (lines ?? []).reduce((s, l) => s + l.quantityAsked, 0)
  const totalServed = (lines ?? []).reduce((s, l) => s + l.quantityServed, 0)

  return (
    <Modal title={`${group.department.name} — ${formatLongDate(day)}`} onClose={onClose} wide>
      {error ? (
        <p role="alert" className="text-[0.85rem] font-medium text-danger">{error}</p>
      ) : lines === null ? (
        <p className="flex items-center gap-2 py-6 text-[0.85rem] text-fg-muted">
          <Loader2 className="size-4 animate-spin" />
          Chargement…
        </p>
      ) : lines.length === 0 ? (
        <EmptyState
          icon={<PackageSearch className="size-6" />}
          title="Aucun article"
          description="Ce département n’a rien commandé ce jour-là."
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral" icon={<Layers className="size-3.5" />}>
              {lines.length} article{lines.length > 1 ? 's' : ''}
            </Badge>
            <Badge tone="neutral">
              {group.orderCount} ticket{group.orderCount > 1 ? 's' : ''} cumulé
              {group.orderCount > 1 ? 's' : ''}
            </Badge>
            <Badge tone="accent">{formatQty(totalAsked)} demandé</Badge>
            {totalServed > 0 ? <Badge tone="ok">{formatQty(totalServed)} servi</Badge> : null}
          </div>

          <div className="max-h-[24rem] overflow-y-auto">
            <TableWrap minWidth="34rem">
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
                {lines.map((l, i) => {
                  const previous = i > 0 ? lines[i - 1] : null
                  const ouvre = previous?.categoryName !== l.categoryName
                  return (
                    <React.Fragment key={l.productId}>
                      {ouvre ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="bg-ok/12 px-2 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.06em] text-ok sm:px-3"
                          >
                            {l.categoryName}
                          </td>
                        </tr>
                      ) : null}
                      <tr>
                        <Td className="text-right text-[0.75rem] tabular-nums text-fg-subtle">
                          {i + 1}
                        </Td>
                        <Td className="max-w-0">
                          <p className="truncate text-[0.83rem] font-medium text-fg">
                            {l.productName}
                          </p>
                          <p className="truncate font-mono text-[0.68rem] text-fg-subtle">
                            {l.productRef}
                          </p>
                        </Td>
                        <Td className="text-right tabular-nums text-fg-muted">
                          {/* Un article revenu sur plusieurs tickets mérite d'être repéré. */}
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
          </div>
        </div>
      )}
    </Modal>
  )
}
