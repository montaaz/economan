'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { PackageCheck, UserCheck, MessageSquareWarning } from 'lucide-react'
import { GlassCard, Button, Badge, TableWrap, Th, Td } from '@/components/ui/glass'
import { FamilyBand, countByFamily } from '@/components/ui/family-band'
import { FilterBadge, FilterReset } from '@/components/ui/filter-badge'
import { useToast } from '@/components/ui/toast'
import { gql, errorMessage } from '@/lib/graphql-client'
import { cn, formatInstantDate, formatQty, formatTime } from '@/lib/utils'

export type RefillView = {
  id: string
  rank: number
  createdAt: string
  receivedAt: string | null
  createdBy: { fullName: string } | null
  receivedBy: { fullName: string } | null
  lines: {
    lineId: string
    productName: string
    productRef: string
    categoryName: string
    unitSymbol: string
    stockFixe: number
    quantityAsked: number
    firstServed: number
    quantity: number
    remaining: number
    rejectReason: string | null
  }[]
}

const RECEIVE_REFILL = /* GraphQL */ `
  mutation ReceiveRefill($id: ID!, $rank: Int!) {
    receiveRefill(id: $id, rank: $rank) { id refillsToReceive }
  }
`

/**
 * Un servi complémentaire, vu du département — sur le modèle de la
 * réception d'une commande : même bandeau, mêmes colonnes, sans la case
 * « Reçu ». Ici on ne compte pas ligne par ligne : la marchandise du
 * complément arrive d'un bloc, et le département signe pour elle.
 *
 * Une fois signé, l'économat ne peut plus effacer le passage.
 */
export function RefillReception({ orderId, refill }: { orderId: string; refill: RefillView }) {
  const router = useRouter()
  const { push } = useToast()
  const [busy, setBusy] = React.useState(false)

  // Après ce passage, une ligne est soit soldée, soit encore due.
  const [etat, setEtat] = React.useState<'SOLDE' | 'DU' | null>(null)
  const counts = React.useMemo(() => ({
    soldes: refill.lines.filter((l) => l.remaining === 0).length,
    dus: refill.lines.filter((l) => l.remaining > 0).length,
  }), [refill.lines])

  // Le rang est celui de la feuille, figé avant tout filtrage.
  const numerotees = React.useMemo(
    () => refill.lines.map((l, i) => ({ ...l, rang: i + 1 })),
    [refill.lines],
  )
  const affichees = React.useMemo(
    () => etat === null
      ? numerotees
      : numerotees.filter((l) => (etat === 'SOLDE' ? l.remaining === 0 : l.remaining > 0)),
    [numerotees, etat],
  )
  const parFamille = React.useMemo(() => countByFamily(affichees), [affichees])

  const confirmer = async () => {
    setBusy(true)
    try {
      await gql(RECEIVE_REFILL, { id: orderId, rank: refill.rank })
      push('success', `Réception du ${refill.rank}ᵉ servi confirmée.`)
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div id={`service-${refill.rank}`} className="scroll-mt-4 space-y-4">
      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[0.95rem] font-bold leading-tight text-fg">
              {refill.rank}ᵉ servi
              <span className="ml-2 text-[0.82rem] font-semibold tabular-nums text-fg-muted">
                {refill.lines.length} article{refill.lines.length > 1 ? 's' : ''}
              </span>
            </p>
            {/* Quand et par qui la marchandise est sortie : c'est ce qu'on
                veut savoir en la voyant arriver. */}
            <p className="mt-0.5 text-[0.8rem] tabular-nums text-fg-muted">
              Servi le {formatInstantDate(refill.createdAt)} à {formatTime(refill.createdAt)}
              {refill.createdBy ? ` par ${refill.createdBy.fullName}` : ''}
            </p>
          </div>
          {refill.receivedAt ? (
            /* Tout le service peut réceptionner : savoir qui l'a fait évite
               d'avoir à demander à la ronde. */
            <Badge tone="info" icon={<UserCheck className="size-3.5" />}>
              Reçu par {refill.receivedBy?.fullName ?? 'le département'} à {formatTime(refill.receivedAt)}
            </Badge>
          ) : (
            <Badge tone="info" icon={<PackageCheck className="size-3.5" />}>
              À réceptionner
            </Badge>
          )}
        </div>
      </GlassCard>

      <div className="no-print space-y-3">
        {/* Le même bandeau qu'à la réception d'une commande : la consigne,
            les compteurs qui filtrent, et le bouton qui conclut. */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-info/30 bg-info/[0.07] px-4 py-3">
          <p className="text-[0.83rem] leading-snug text-fg-muted">
            {refill.receivedAt
              ? 'Ce servi a été réceptionné. Voici ce qui est arrivé avec lui.'
              : 'Vérifiez ce qui arrive avec ce servi, puis confirmez la réception.'}
          </p>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {counts.dus > 0 ? (
              <FilterBadge
                tone="warn"
                actif={etat === 'DU'}
                onClick={() => setEtat(etat === 'DU' ? null : 'DU')}
                label={etat === 'DU'
                  ? 'Afficher de nouveau tous les articles'
                  : `N’afficher que les ${counts.dus} article(s) encore dus après ce servi`}
              >
                {counts.dus} encore du{counts.dus > 1 ? 's' : ''}
              </FilterBadge>
            ) : null}
            {counts.soldes > 0 ? (
              <FilterBadge
                tone="ok"
                actif={etat === 'SOLDE'}
                onClick={() => setEtat(etat === 'SOLDE' ? null : 'SOLDE')}
                label={etat === 'SOLDE'
                  ? 'Afficher de nouveau tous les articles'
                  : `N’afficher que les ${counts.soldes} article(s) soldé(s) par ce servi`}
              >
                {counts.soldes} soldé{counts.soldes > 1 ? 's' : ''}
              </FilterBadge>
            ) : null}
            {etat !== null ? (
              <FilterReset total={refill.lines.length} onClick={() => setEtat(null)} />
            ) : null}
            {!refill.receivedAt ? (
              <Button variant="success" loading={busy} onClick={confirmer}>
                {!busy ? <PackageCheck className="size-4" /> : null}
                Confirmer la réception
              </Button>
            ) : null}
          </div>
        </div>

        <TableWrap minWidth="52rem">
          <thead>
            <tr>
              <Th className="w-10 text-right">#</Th>
              <Th className="w-full">Article</Th>
              {/* La même chaîne qu'à la réception : la cible, la commande, ce
                  qui était déjà sorti, ce qui arrive maintenant, et ce qui
                  restera dû. Pas de case à compter : le complément se signe
                  d'un bloc. */}
              <Th className="text-right">Stock fixe</Th>
              <Th className="text-right">Commande</Th>
              <Th className="text-right">1ᵉʳ servi</Th>
              {/* Le rang du passage, comme sur le bon : « 2ᵉ servi » se
                  relit en face du papier, « ce servi » non. */}
              <Th className="text-right">{refill.rank}ᵉ servi</Th>
              <Th className="text-right">Reste</Th>
              <Th>État</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
            {affichees.map((l, i) => {
              const solde = l.remaining === 0
              const ouvre = i === 0 || affichees[i - 1].categoryName !== l.categoryName
              return (
                <React.Fragment key={l.lineId}>
                  {ouvre ? (
                    <FamilyBand
                      name={l.categoryName}
                      count={parFamille.get(l.categoryName) ?? 0}
                      colSpan={8}
                    />
                  ) : null}
                  <tr className={cn(solde ? 'bg-ok/[0.08]' : 'bg-warn/[0.09]')}>
                    <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{l.rang}</Td>
                    <Td className="max-w-0">
                      <p className="truncate text-[0.85rem] font-medium text-fg">{l.productName}</p>
                      <p className="truncate font-mono text-[0.7rem] text-fg-subtle">{l.productRef}</p>
                      {/* Le motif du premier servi, s'il y en avait un : il
                          explique pourquoi ce complément existe. */}
                      {l.rejectReason && l.firstServed === 0 ? (
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
                      {l.firstServed === 0 ? (
                        <span className="font-semibold text-danger">Rupture</span>
                      ) : (
                        <span className="text-fg-muted">{formatQty(l.firstServed)} {l.unitSymbol}</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-right font-bold tabular-nums text-fg">
                      {formatQty(l.quantity)} {l.unitSymbol}
                    </Td>
                    <Td className="whitespace-nowrap text-right font-bold tabular-nums">
                      {solde ? (
                        <span className="text-ok">—</span>
                      ) : (
                        <span className="text-warn">{formatQty(l.remaining)} {l.unitSymbol}</span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={solde ? 'ok' : 'warn'}>{solde ? 'Soldé' : 'Encore dû'}</Badge>
                    </Td>
                  </tr>
                </React.Fragment>
              )
            })}
          </tbody>
        </TableWrap>
      </div>
    </div>
  )
}
