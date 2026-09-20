'use client'

import * as React from 'react'
import { Ban, Loader2, PackageCheck } from 'lucide-react'
import { Badge, Button, EmptyState, TableWrap, Th, Td } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { Modal } from '@/components/ui/modal'
import { gql, errorMessage } from '@/lib/graphql-client'
import { formatPeriod, formatQty, formatShortDay } from '@/lib/utils'

const RUPTURES = /* GraphQL */ `
  query DayRuptures($day: Date, $dayTo: Date) {
    dayRuptures(day: $day, dayTo: $dayTo) {
      lineId
      orderId
      orderReference
      businessDay
      department { id name color icon }
      productName
      productRef
      categoryName
      unitSymbol
      quantityAsked
      rejectReason
    }
  }
`

type Rupture = {
  lineId: string
  orderId: string
  orderReference: string
  businessDay: string
  department: { id: string; name: string; color: string; icon: string | null }
  productName: string
  productRef: string
  categoryName: string
  unitSymbol: string
  quantityAsked: number
  rejectReason: string | null
}

/**
 * Toutes les ruptures de la journée, d'un seul coup d'œil.
 *
 * Elles sont visibles ticket par ticket, mais rien ne les rassemblait : pour
 * savoir ce qui a manqué au magasin dans la journée, il fallait ouvrir chaque
 * commande de chaque département.
 */
export function RupturesPanel({
  day, dayTo, count,
}: {
  day: string
  /** Borne de fin si l'écran affiche une période. */
  dayTo?: string | null
  /** Nombre de ruptures, connu de la page : le bouton l'annonce sans requête. */
  count: number
}) {
  const [open, setOpen] = React.useState(false)
  if (count === 0) return null

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Ban className="size-3.5" />
        {count} rupture{count > 1 ? 's' : ''}
      </Button>
      {open ? (
        <Liste day={day} dayTo={dayTo} onClose={() => setOpen(false)} />
      ) : null}
    </>
  )
}

function Liste({
  day, dayTo, onClose,
}: {
  day: string
  dayTo?: string | null
  onClose: () => void
}) {
  const [lines, setLines] = React.useState<Rupture[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let vivant = true
    gql<{ dayRuptures: Rupture[] }>(RUPTURES, { day, dayTo: dayTo ?? null })
      .then((d) => { if (vivant) setLines(d.dayRuptures) })
      .catch((e) => { if (vivant) setError(errorMessage(e)) })
    return () => { vivant = false }
  }, [day, dayTo])

  // Un même article peut manquer à plusieurs services : le compter une fois
  // dit l'ampleur du manque, pas le nombre de lignes.
  const articles = new Set((lines ?? []).map((l) => l.productName)).size
  const services = new Set((lines ?? []).map((l) => l.department.id)).size
  const sansMotif = (lines ?? []).filter((l) => !l.rejectReason).length

  return (
    <Modal title={`Ruptures — ${formatPeriod(day, dayTo)}`} onClose={onClose} wide>
      {error ? (
        <p role="alert" className="text-[0.85rem] font-medium text-danger">{error}</p>
      ) : lines === null ? (
        <p className="flex items-center gap-2 py-6 text-[0.85rem] text-fg-muted">
          <Loader2 className="size-4 animate-spin" />
          Chargement…
        </p>
      ) : lines.length === 0 ? (
        <EmptyState
          icon={<PackageCheck className="size-6" />}
          title="Aucune rupture"
          description="Tout ce qui a été commandé a pu être servi."
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="danger">
              {lines.length} ligne{lines.length > 1 ? 's' : ''} non livrée
              {lines.length > 1 ? 's' : ''}
            </Badge>
            <Badge tone="neutral">
              {articles} article{articles > 1 ? 's' : ''} distinct{articles > 1 ? 's' : ''}
            </Badge>
            <Badge tone="neutral">
              {services} service{services > 1 ? 's' : ''} touché{services > 1 ? 's' : ''}
            </Badge>
            {/* Une rupture sans motif ne dit rien au département : on le
                signale plutôt que de laisser la colonne vide en silence. */}
            {sansMotif > 0 ? (
              <Badge tone="warn">{sansMotif} sans motif</Badge>
            ) : null}
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            <TableWrap minWidth="50rem">
              <thead>
                <tr>
                  <Th className="w-10 text-right">#</Th>
                  <Th>Ticket</Th>
                  <Th>Article</Th>
                  <Th className="text-right">Commandé</Th>
                  {/* Le motif est ce qu'on vient chercher ici : il prend la
                      place restante plutôt que de se casser mot à mot. */}
                  <Th className="w-full">Motif</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
                {lines.map((l, i) => {
                  const previous = i > 0 ? lines[i - 1] : null
                  const ouvre = previous?.department.id !== l.department.id
                  return (
                    <React.Fragment key={l.lineId}>
                      {/* Un bandeau par service : les manques se règlent
                          département par département. */}
                      {ouvre ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-2 py-1.5 text-[0.74rem] font-bold uppercase tracking-[0.06em] sm:px-3"
                            style={{
                              background: `${l.department.color}1f`,
                              color: l.department.color,
                            }}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <Icon name={l.department.icon ?? 'Building2'} className="size-3.5" />
                              {l.department.name}
                            </span>
                          </td>
                        </tr>
                      ) : null}
                      <tr className="bg-danger/[0.04]">
                        <Td className="text-right text-[0.75rem] tabular-nums text-fg-subtle">
                          {i + 1}
                        </Td>
                        <Td className="whitespace-nowrap text-[0.78rem] text-fg-muted">
                          {/* Sur une période, savoir quel jour a manqué compte
                              autant que de savoir quoi. */}
                          {dayTo ? (
                            <span className="capitalize">{formatShortDay(l.businessDay)}</span>
                          ) : null}
                          <span className="ml-1 font-mono text-[0.7rem] text-fg-subtle">
                            {l.orderReference}
                          </span>
                        </Td>
                        <Td>
                          <p className="whitespace-nowrap text-[0.83rem] font-medium text-fg">
                            {l.productName}
                          </p>
                          <p className="whitespace-nowrap text-[0.7rem] text-fg-subtle">
                            {l.categoryName}
                          </p>
                        </Td>
                        <Td className="whitespace-nowrap text-right font-semibold tabular-nums text-fg">
                          {formatQty(l.quantityAsked)} {l.unitSymbol}
                        </Td>
                        <Td>
                          {l.rejectReason ? (
                            <p className="text-[0.78rem] font-medium leading-snug text-danger">
                              {l.rejectReason}
                            </p>
                          ) : (
                            <p className="text-[0.78rem] italic text-fg-subtle">
                              aucun motif saisi
                            </p>
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
