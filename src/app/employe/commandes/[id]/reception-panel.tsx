'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { PackageCheck, Check, AlertTriangle } from 'lucide-react'
import { Button, Badge, TableWrap, Th, Td } from '@/components/ui/glass'
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

      <TableWrap minWidth="50rem">
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
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
          {toCheck.map((l, i) => {
            const gap = toNumber(counted[l.id]) - (l.quantityServed ?? 0)
            return (
              <tr key={l.id} className={cn(gap !== 0 && 'bg-warn/[0.07]')}>
                <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{i + 1}</Td>
                <Td className="max-w-0">
                  <p className="truncate text-[0.85rem] font-medium text-fg">{l.productName}</p>
                  <p className="truncate text-[0.7rem] text-fg-subtle">
                    <span className="font-mono">{l.productRef}</span>
                    <span className="mx-1.5">·</span>
                    {l.categoryName}
                  </p>
                </Td>
                <Td className="whitespace-nowrap text-right tabular-nums text-fg-subtle">
                  {formatQty(l.stockFixe)} {l.unitSymbol}
                </Td>
                <Td className="whitespace-nowrap text-right tabular-nums text-fg-subtle">
                  {formatQty(l.quantityAsked)} {l.unitSymbol}
                </Td>
                <Td className="whitespace-nowrap text-right font-medium tabular-nums text-fg">
                  {formatQty(l.quantityServed ?? 0)} {l.unitSymbol}
                </Td>
                <Td className="text-right">
                  <input
                    inputMode="decimal"
                    value={counted[l.id] ?? ''}
                    onChange={(e) => setValue(l.id, e.target.value)}
                    aria-label={`Quantité reçue pour ${l.productName}`}
                    className="field h-9 w-24 px-2 py-0 text-right text-[0.85rem] tabular-nums"
                  />
                </Td>
                <Td className="whitespace-nowrap text-right">
                  {gap === 0 ? (
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
              </tr>
            )
          })}
        </tbody>
      </TableWrap>
    </div>
  )
}
