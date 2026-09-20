'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Pencil, X } from 'lucide-react'
import { Badge, TableWrap, Th, Td } from '@/components/ui/glass'
import { useToast } from '@/components/ui/toast'
import { gql, errorMessage } from '@/lib/graphql-client'
import { cn, formatQty, toNumber } from '@/lib/utils'

export type OrderLine = {
  id: string
  productId: string
  productName: string
  productRef: string
  categoryName: string
  unitSymbol: string
  stockFixe: number
  quantityOnHand: number
  quantityAsked: number
  quantityServed: number | null
  // Optionnels : le ticket papier ne les demande pas toujours.
  quantityReceived?: number | null
  receiptGap?: number | null
  status: 'PENDING' | 'VALIDATED' | 'ADJUSTED' | 'REJECTED'
  rejectReason: string | null
}

const UPDATE = /* GraphQL */ `
  mutation UpdateOrder($id: ID!, $lines: [OrderLineInput!]!) {
    updateOrder(id: $id, lines: $lines) { id }
  }
`

const LINE_TONE = {
  PENDING: 'neutral',
  VALIDATED: 'ok',
  ADJUSTED: 'warn',
  REJECTED: 'danger',
} as const

const LINE_LABEL = {
  PENDING: 'En attente',
  VALIDATED: 'Servi',
  ADJUSTED: 'Ajusté',
  REJECTED: 'Rupture',
} as const

/**
 * Détail des lignes d'une commande.
 *
 * Tant que l'économat n'a rien pris en charge, son auteur corrige une ligne
 * sur place : le crayon ouvre le stock compté, et la quantité commandée se
 * recalcule côté serveur (stock fixe moins ce qui reste en rayon). Rouvrir
 * toute la feuille pour un seul chiffre obligeait à retrouver l'article parmi
 * plus de cent.
 */
export function OrderLines({
  orderId, lines, editable, showReceived,
}: {
  orderId: string
  lines: OrderLine[]
  /** L'auteur d'une commande encore en attente, et lui seul. */
  editable: boolean
  showReceived: boolean
}) {
  const router = useRouter()
  const { push } = useToast()

  // Les lignes sont figées à l'envoi : celles passées avant que les feuilles
  // soient regroupées gardent leurs familles éparpillées. On les rassemble
  // pour l'affichage, sans toucher au ticket enregistré.
  const affichees = React.useMemo(() => {
    const ordre: string[] = []
    for (const l of lines) if (!ordre.includes(l.categoryName)) ordre.push(l.categoryName)
    return ordre.flatMap((c) => lines.filter((l) => l.categoryName === c))
  }, [lines])

  const [editing, setEditing] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  // La virgule des claviers français vaut point, et rien d'autre ne passe :
  // une lettre dans la case donnerait 0 sans rien signaler.
  const saisir = (raw: string) => {
    const v = raw.replace(',', '.')
    if (v !== '' && !/^\d*\.?\d*$/.test(v)) return
    setDraft(v)
  }

  const colonnes = 6 + (showReceived ? 1 : 0) + (editable ? 1 : 0)

  function ouvrir(l: OrderLine) {
    setEditing(l.id)
    setDraft(String(l.quantityOnHand))
  }

  async function enregistrer(ligne: OrderLine) {
    if (draft.trim() === '') {
      push('error', 'Indiquez le stock compté.')
      return
    }
    const stock = toNumber(draft)
    if (stock === ligne.quantityOnHand) {
      setEditing(null)
      return
    }
    // Un stock qui atteint la cible annule la ligne : le serveur ne garde que
    // les quantités positives, l'article disparaîtrait de la commande sans
    // prévenir. Le retirer reste possible en rouvrant toute la feuille.
    if (stock >= ligne.stockFixe) {
      push(
        'error',
        `Un stock de ${formatQty(stock)} ${ligne.unitSymbol} atteint le stock fixe : il n’y aurait `
          + 'plus rien à commander. Utilisez « Refaire la feuille » pour retirer l’article.',
      )
      return
    }

    setBusy(true)
    try {
      await gql(UPDATE, {
        id: orderId,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantityOnHand: l.id === ligne.id ? stock : l.quantityOnHand,
        })),
      })
      push(
        'success',
        `${ligne.productName} : ${formatQty(ligne.stockFixe - stock)} ${ligne.unitSymbol} commandé.`,
      )
      setEditing(null)
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <TableWrap minWidth={editable ? '52rem' : '46rem'}>
      <thead>
        <tr>
          <Th className="w-10 text-right">#</Th>
          <Th className="w-full">Article</Th>
          {/* Les deux valeurs d'où sort la quantité commandée : la cible du
              département moins ce qui restait en rayon. Sans elles, un chiffre
              inattendu reste inexplicable. */}
          <Th className="text-right">Stock fixe</Th>
          <Th className="text-right">Mon stock</Th>
          {/* Même intitulé que l'écran de l'économat et la feuille papier :
              une seule notion, un seul mot. */}
          <Th className="text-right">Commande</Th>
          <Th className="text-right">Servi</Th>
          {showReceived ? <Th className="text-right">Reçu</Th> : null}
          <Th>État</Th>
          {editable ? <Th className="text-right">Modifier</Th> : null}
        </tr>
      </thead>
      <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
        {affichees.map((l, i) => {
          const ouvert = editing === l.id
          return (
            <React.Fragment key={l.id}>
              {i === 0 || affichees[i - 1].categoryName !== l.categoryName ? (
                <tr>
                  <td
                    colSpan={colonnes}
                    className="bg-ok/12 px-2 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.06em] text-ok sm:px-3 sm:text-[0.76rem]"
                  >
                    {l.categoryName}
                  </td>
                </tr>
              ) : null}
              <tr
                className={cn(
                  l.status === 'REJECTED' && 'bg-danger/[0.06]',
                  ouvert && 'bg-accent/[0.08]',
                )}
              >
                <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{i + 1}</Td>
                <Td className="max-w-0">
                  <p className="truncate text-[0.85rem] font-medium text-fg">{l.productName}</p>
                  {/* La famille est portée par le bandeau : la répéter sous
                      chaque nom allongeait sans rien apprendre. */}
                  <p className="truncate font-mono text-[0.7rem] text-fg-subtle">{l.productRef}</p>
                </Td>
                <Td className="whitespace-nowrap text-right tabular-nums text-fg-subtle">
                  {formatQty(l.stockFixe)} {l.unitSymbol}
                </Td>
                <Td className="whitespace-nowrap text-right tabular-nums text-fg-subtle">
                  {ouvert ? (
                    <input
                      autoFocus
                      type="text"
                      inputMode="decimal"
                      value={draft}
                      disabled={busy}
                      onChange={(e) => saisir(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void enregistrer(l)
                        }
                        if (e.key === 'Escape') setEditing(null)
                      }}
                      aria-label={`Mon stock de ${l.productName}`}
                      className="w-20 rounded-lg border border-accent/50 bg-white px-2 py-1 text-right text-[0.9rem] font-semibold tabular-nums text-fg outline-none focus:ring-2 focus:ring-accent/30"
                    />
                  ) : (
                    <>
                      {formatQty(l.quantityOnHand)} {l.unitSymbol}
                    </>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-right font-semibold tabular-nums text-fg">
                  {/* Pendant la saisie, la quantité suit ce qui est tapé : on
                      voit ce qu'on commande avant de valider. */}
                  {ouvert && draft.trim() !== ''
                    ? `${formatQty(Math.max(l.stockFixe - toNumber(draft), 0))} ${l.unitSymbol}`
                    : ouvert
                      ? '—'
                      : `${formatQty(l.quantityAsked)} ${l.unitSymbol}`}
                </Td>
                <Td className="whitespace-nowrap text-right font-medium tabular-nums text-fg">
                  {l.quantityServed === null ? '—' : `${formatQty(l.quantityServed)} ${l.unitSymbol}`}
                </Td>
                {showReceived ? (
                  <Td className="whitespace-nowrap text-right tabular-nums">
                    {l.quantityReceived == null ? (
                      <span className="text-fg-subtle">—</span>
                    ) : (
                      <span className={cn((l.receiptGap ?? 0) !== 0 && 'font-bold text-warn')}>
                        {formatQty(l.quantityReceived)} {l.unitSymbol}
                        {(l.receiptGap ?? 0) !== 0 ? (
                          <span className="ml-1 text-[0.72rem]">
                            ({(l.receiptGap ?? 0) > 0 ? '+' : ''}{formatQty(l.receiptGap ?? 0)})
                          </span>
                        ) : null}
                      </span>
                    )}
                  </Td>
                ) : null}
                <Td>
                  <Badge tone={LINE_TONE[l.status]}>{LINE_LABEL[l.status]}</Badge>
                  {l.rejectReason ? (
                    <p className="mt-0.5 text-[0.7rem] text-danger">{l.rejectReason}</p>
                  ) : null}
                </Td>
                {editable ? (
                  <Td className="text-right">
                    {ouvert ? (
                      <span className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void enregistrer(l)}
                          aria-label={`Enregistrer ${l.productName}`}
                          title="Enregistrer"
                          className="grid size-8 place-items-center rounded-lg bg-ok text-white transition-colors hover:bg-ok/85 disabled:opacity-60"
                        >
                          {busy ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Check className="size-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setEditing(null)}
                          aria-label={`Annuler la modification de ${l.productName}`}
                          title="Annuler"
                          className="grid size-8 place-items-center rounded-lg border border-[rgb(var(--glass-edge)/0.3)] text-fg-muted transition-colors hover:bg-[rgb(var(--glass-edge)/0.14)] disabled:opacity-60"
                        >
                          <X className="size-4" />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => ouvrir(l)}
                        aria-label={`Modifier ${l.productName}`}
                        title="Modifier cette ligne"
                        className="grid size-8 place-items-center rounded-lg border border-[rgb(var(--glass-edge)/0.3)] text-accent transition-colors hover:border-accent/50 hover:bg-accent/10 disabled:opacity-40"
                      >
                        <Pencil className="size-4" />
                      </button>
                    )}
                  </Td>
                ) : null}
              </tr>
            </React.Fragment>
          )
        })}
      </tbody>
    </TableWrap>
  )
}
