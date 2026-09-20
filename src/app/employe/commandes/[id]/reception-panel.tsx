'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { PackageCheck, AlertTriangle, MessageSquareWarning } from 'lucide-react'
import { Button, Badge, TableWrap, Th, Td } from '@/components/ui/glass'
import { FamilyBand, countByFamily } from '@/components/ui/family-band'
import { FilterBadge, FilterReset } from '@/components/ui/filter-badge'
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

  // Filtre par état : à la réception, voir d'abord ce qui manque ou ce qui
  // diffère évite de parcourir cent lignes conformes pour les trouver.
  const [etat, setEtat] = React.useState<'REJECTED' | 'ADJUSTED' | 'VALIDATED' | null>(null)

  const counts = React.useMemo(() => ({
    rejected: lines.filter((l) => l.status === 'REJECTED').length,
    adjusted: lines.filter((l) => l.status === 'ADJUSTED').length,
    // Servi exactement ce qui était commandé : le reste de la feuille.
    validated: lines.filter((l) => l.status === 'VALIDATED').length,
  }), [lines])

  // Le rang est celui de la feuille, figé avant tout filtrage : renuméroter
  // une liste filtrée ferait que « l'article 16 » changerait de sens.
  const numerotees = React.useMemo(
    () => lines.map((l, i) => ({ ...l, rang: i + 1 })),
    [lines],
  )

  // Toutes les lignes sont montrées, ruptures comprises : ce tableau est le
  // seul affiché à la réception, et l'employé doit voir ce qui n'a pas été
  // livré.
  const affichees = React.useMemo(
    () => (etat === null ? numerotees : numerotees.filter((l) => l.status === etat)),
    [numerotees, etat],
  )

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
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* Ce qui cloche se compte ici, et se montre au clic. */}
          {counts.rejected > 0 ? (
            <FilterBadge
              tone="danger"
              actif={etat === 'REJECTED'}
              onClick={() => setEtat(etat === 'REJECTED' ? null : 'REJECTED')}
              label={etat === 'REJECTED'
                ? 'Afficher de nouveau tous les articles'
                : `N’afficher que les ${counts.rejected} article(s) en rupture`}
            >
              {counts.rejected} rupture{counts.rejected > 1 ? 's' : ''}
            </FilterBadge>
          ) : null}
          {counts.adjusted > 0 ? (
            <FilterBadge
              tone="warn"
              actif={etat === 'ADJUSTED'}
              onClick={() => setEtat(etat === 'ADJUSTED' ? null : 'ADJUSTED')}
              label={etat === 'ADJUSTED'
                ? 'Afficher de nouveau tous les articles'
                : `N’afficher que les ${counts.adjusted} article(s) servi(s) en quantité différente`}
            >
              {counts.adjusted} ajustée{counts.adjusted > 1 ? 's' : ''}
            </FilterBadge>
          ) : null}
          {/* « Conforme » filtre comme les deux autres : voir d'un bloc ce
              qui est arrivé tel que demandé, sans le rouge ni l'orange. */}
          {counts.validated > 0 ? (
            <FilterBadge
              tone="ok"
              actif={etat === 'VALIDATED'}
              onClick={() => setEtat(etat === 'VALIDATED' ? null : 'VALIDATED')}
              label={etat === 'VALIDATED'
                ? 'Afficher de nouveau tous les articles'
                : `N’afficher que les ${counts.validated} article(s) servi(s) comme demandé`}
            >
              {counts.validated} conforme{counts.validated > 1 ? 's' : ''}
            </FilterBadge>
          ) : null}
          {etat !== null ? (
            <FilterReset total={lines.length} onClick={() => setEtat(null)} />
          ) : null}
          {/* L'écart porte sur ce que l'employé vient de compter, pas sur
              l'état des lignes : il reste un constat, pas un filtre. */}
          {gaps.length > 0 ? (
            <Badge tone="warn" icon={<AlertTriangle className="size-3.5" />}>
              {gaps.length} écart(s)
            </Badge>
          ) : null}
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
                <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{l.rang}</Td>
                <Td className="max-w-0">
                  <p className="truncate text-[0.85rem] font-medium text-fg">{l.productName}</p>
                  {/* La famille est portée par le bandeau. */}
                  <p className="truncate font-mono text-[0.7rem] text-fg-subtle">
                    {l.productRef}
                  </p>
                  {/* Le motif saisi par l'économat : « sera disponible dans
                      2 jours » est précisément ce que l'employé doit savoir,
                      et il ne le lisait nulle part. Sur toute la largeur de
                      la cellule, pas tronqué comme les lignes au-dessus. */}
                  {l.rejectReason ? (
                    <p className="mt-0.5 flex items-start gap-1 text-[0.75rem] font-medium leading-snug text-danger">
                      <MessageSquareWarning className="mt-px size-3.5 shrink-0" />
                      {l.rejectReason}
                    </p>
                  ) : null}
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
