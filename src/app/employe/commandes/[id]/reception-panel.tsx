'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { PackageCheck, Check, AlertTriangle } from 'lucide-react'
import { Button, Badge, TableWrap, Th, Td } from '@/components/ui/glass'
import { FamilyBand, countByFamily } from '@/components/ui/family-band'
import { useToast } from '@/components/ui/toast'
import { gql, errorMessage } from '@/lib/graphql-client'
import { cn, formatQty, toNumber } from '@/lib/utils'

export type ReceptionLine = {
  id: string
  productName: string
  productRef: string
  categoryName: string
  unitSymbol: string
  stockFixe: number
  quantityAsked: number
  quantityServed: number | null
  status: 'PENDING' | 'VALIDATED' | 'ADJUSTED' | 'REJECTED'
  rejectReason: string | null
}

const RECEIVE = /* GraphQL */ `
  mutation Receive($id: ID!, $lines: [ReceivedLineInput!]) {
    receiveOrder(id: $id, lines: $lines) { id status }
  }
`

/**
 * Vérification à la réception : l'employé compte ce qui arrive, ligne par
 * ligne. Les cases partent de ce que l'économat déclare avoir servi — sur une
 * commande de plus de cent lignes, il ne corrige que ce qui diffère.
 */
export function ReceptionPanel({
  orderId, lines,
}: {
  orderId: string
  lines: ReceptionLine[]
}) {
  const router = useRouter()
  const { push } = useToast()
  const [busy, setBusy] = React.useState(false)

  // Les lignes en rupture n'ont rien à compter : elles sortent de la vérification.
  const toCheck = React.useMemo(() => lines.filter((l) => l.status !== 'REJECTED'), [lines])

  // Toutes les lignes sont montrées, ruptures comprises : ce tableau est le
  // seul affiché à la réception, et l'employé doit voir ce qui n'a pas été
  // livré. Elles restent regroupées par famille, comme partout ailleurs.
  const affichees = React.useMemo(() => {
    const ordre: string[] = []
    for (const l of lines) if (!ordre.includes(l.categoryName)) ordre.push(l.categoryName)
    return ordre.flatMap((c) => lines.filter((l) => l.categoryName === c))
  }, [lines])

  // Le compte accompagne le nom sur le bandeau : il porte sur ce qui est
  // réellement affiché, donc il suit le filtre.
  const parFamille = React.useMemo(() => countByFamily(affichees), [affichees])

  const [counted, setCounted] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(toCheck.map((l) => [l.id, String(l.quantityServed ?? 0)])),
  )

  const setValue = (id: string, raw: string) => {
    const v = raw.replace(',', '.')
    if (v !== '' && !/^\d*\.?\d*$/.test(v)) return
    setCounted((s) => ({ ...s, [id]: v }))
  }

  const gaps = React.useMemo(
    () =>
      toCheck
        .map((l) => ({ line: l, gap: toNumber(counted[l.id]) - (l.quantityServed ?? 0) }))
        .filter((x) => x.gap !== 0),
    [toCheck, counted],
  )

  const confirm = async () => {
    setBusy(true)
    try {
      await gql(RECEIVE, {
        id: orderId,
        lines: toCheck.map((l) => ({
          lineId: l.id,
          quantityReceived: toNumber(counted[l.id]),
        })),
      })
      push(
        'success',
        gaps.length > 0
          ? `Réception confirmée — ${gaps.length} écart(s) signalé(s).`
          : 'Réception confirmée — la commande est clôturée.',
      )
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="no-print space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-info/30 bg-info/[0.07] px-4 py-3">
        <p className="text-[0.83rem] leading-snug text-fg-muted">
          Comptez ce que vous recevez. Les cases partent de ce que l’économat a servi —
          ne corrigez que les lignes qui diffèrent.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {gaps.length > 0 ? (
            <Badge tone="warn" icon={<AlertTriangle className="size-3.5" />}>
              {gaps.length} écart(s)
            </Badge>
          ) : (
            <Badge tone="ok" icon={<Check className="size-3.5" />}>Conforme</Badge>
          )}
          <Button variant="success" loading={busy} onClick={confirm}>
            {!busy ? <PackageCheck className="size-4" /> : null}
            Confirmer la réception
          </Button>
        </div>
      </div>

      <TableWrap minWidth="58rem">
        <thead>
          <tr>
            <Th className="w-10 text-right">#</Th>
            <Th className="w-full">Article</Th>
            {/* La chaîne complète : la cible, ce qui a été commandé, ce que
                l'économat a sorti. Un écart s'explique en lisant la ligne. */}
            <Th className="text-right">Stock fixe</Th>
            <Th className="text-right">Commande</Th>
            <Th className="text-right">Servi</Th>
            <Th className="w-32 text-right">Reçu</Th>
            <Th className="text-right">Écart</Th>
            {/* L'état de la ligne telle que l'économat l'a traitée : le fond
                le suggère, le badge le nomme. */}
            <Th>État</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
          {affichees.map((l, i) => {
            const rupture = l.status === 'REJECTED'
            const gap = rupture ? 0 : toNumber(counted[l.id]) - (l.quantityServed ?? 0)

            // Deux écarts différents sur la même ligne : ce que l'économat a
            // servi par rapport à la commande, et ce que l'employé compte par
            // rapport au servi. Le premier explique le second — sans lui, une
            // ligne servie 10 sur 24 se lit comme conforme.
            const ajuste = !rupture && (l.quantityServed ?? 0) !== l.quantityAsked
            const ouvre = i === 0 || affichees[i - 1].categoryName !== l.categoryName
            return (
              <React.Fragment key={l.id}>
                {ouvre ? (
                  <FamilyBand
                    name={l.categoryName}
                    count={parFamille.get(l.categoryName) ?? 0}
                    colSpan={8}
                  />
                ) : null}
              <tr
                className={cn(
                  ajuste && 'bg-warn/[0.09]',
                  // Un écart de comptage prime sur l'ajustement : c'est lui
                  // que l'employé doit trancher avant de confirmer.
                  gap !== 0 && 'bg-warn/[0.16]',
                  rupture && 'bg-danger/[0.08]',
                )}
              >
                <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{i + 1}</Td>
                <Td className="max-w-0">
                  <p className="truncate text-[0.85rem] font-medium text-fg">{l.productName}</p>
                  {/* La famille est portée par le bandeau. */}
                  <p className="truncate font-mono text-[0.7rem] text-fg-subtle">
                    {l.productRef}
                  </p>
                </Td>
                <Td className="whitespace-nowrap text-right tabular-nums text-fg-subtle">
                  {formatQty(l.stockFixe)} {l.unitSymbol}
                </Td>
                <Td className="whitespace-nowrap text-right tabular-nums text-fg-subtle">
                  {formatQty(l.quantityAsked)} {l.unitSymbol}
                </Td>
                <Td className="whitespace-nowrap text-right tabular-nums">
                  {rupture ? (
                    <span className="font-semibold text-danger">Rupture</span>
                  ) : (
                    <span className={cn('font-medium', ajuste ? 'font-semibold text-warn' : 'text-fg')}>
                      {formatQty(l.quantityServed ?? 0)} {l.unitSymbol}
                    </span>
                  )}
                </Td>
                <Td className="text-right">
                  {/* Rien n'a été livré : il n'y a rien à compter. Le champ
                      disparaît plutôt que d'inviter à saisir un zéro. */}
                  {rupture ? (
                    <span className="text-[0.8rem] text-fg-subtle">—</span>
                  ) : (
                    <input
                      inputMode="decimal"
                      value={counted[l.id] ?? ''}
                      onChange={(e) => setValue(l.id, e.target.value)}
                      aria-label={`Quantité reçue pour ${l.productName}`}
                      className="field h-9 w-24 px-2 py-0 text-right text-[0.85rem] tabular-nums"
                    />
                  )}
                </Td>
                <Td className="whitespace-nowrap text-right">
                  {rupture || gap === 0 ? (
                    <span className="text-[0.8rem] tabular-nums text-fg-subtle">—</span>
                  ) : (
                    <span
                      className={cn(
                        'text-[0.85rem] font-bold tabular-nums',
                        gap < 0 ? 'text-danger' : 'text-warn',
                      )}
                    >
                      {gap > 0 ? '+' : ''}{formatQty(gap)}
                    </span>
                  )}
                </Td>
                <Td>
                  <Badge tone={rupture ? 'danger' : ajuste ? 'warn' : 'ok'}>
                    {rupture ? 'Rupture' : ajuste ? 'Ajusté' : 'Servi'}
                  </Badge>
                </Td>
              </tr>
              </React.Fragment>
            )
          })}
        </tbody>
      </TableWrap>
    </div>
  )
}
