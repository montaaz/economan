'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { PackageCheck, UserCheck } from 'lucide-react'
import { GlassCard, Button, Badge, TableWrap, Th, Td } from '@/components/ui/glass'
import { FamilyBand, countByFamily } from '@/components/ui/family-band'
import { useToast } from '@/components/ui/toast'
import { gql, errorMessage } from '@/lib/graphql-client'
import { formatInstantDate, formatQty, formatTime } from '@/lib/utils'

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
    quantity: number
  }[]
}

const RECEIVE_REFILL = /* GraphQL */ `
  mutation ReceiveRefill($id: ID!, $rank: Int!) {
    receiveRefill(id: $id, rank: $rank) { id refillsToReceive }
  }
`

/**
 * Un service complémentaire, vu du département.
 *
 * La marchandise manquante arrive après coup, souvent quand la commande est
 * déjà close : ce bloc liste ce que l'économat a sorti à ce passage, et le
 * département signe pour ce qu'il reçoit — indépendamment de la réception de
 * la commande. Une fois signé, l'économat ne peut plus effacer le passage.
 */
export function RefillReception({ orderId, refill }: { orderId: string; refill: RefillView }) {
  const router = useRouter()
  const { push } = useToast()
  const [busy, setBusy] = React.useState(false)

  const parFamille = React.useMemo(() => countByFamily(refill.lines), [refill.lines])

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
    /* L'ancre reçoit le lien de la carte du service, dans la liste des
       commandes : on arrive directement sur le passage à réceptionner. */
    <div id={`service-${refill.rank}`} className="scroll-mt-4">
    <GlassCard>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-[0.95rem] font-bold leading-tight text-fg">
            {refill.rank}ᵉ servi
            <span className="ml-2 text-[0.82rem] font-semibold tabular-nums text-fg-muted">
              {refill.lines.length} article{refill.lines.length > 1 ? 's' : ''}
            </span>
          </p>
          {/* Quand et par qui la marchandise est sortie : c'est ce qu'on veut
              savoir en la voyant arriver. */}
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
          <div className="no-print flex flex-wrap items-center gap-2">
            <Badge tone="info" icon={<PackageCheck className="size-3.5" />}>
              À réceptionner
            </Badge>
            <Button variant="success" size="sm" loading={busy} onClick={confirmer}>
              {!busy ? <PackageCheck className="size-4" /> : null}
              Confirmer la réception
            </Button>
          </div>
        )}
      </div>

      <TableWrap minWidth="32rem">
        <thead>
          <tr>
            <Th className="w-10 text-right">#</Th>
            <Th className="w-full">Article</Th>
            {/* Seulement ce qui est sorti à ce passage : le cumul de la ligne
                se lit dans le tableau de la commande. */}
            <Th className="text-right">Servi</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
          {refill.lines.map((l, i) => {
            const ouvre = i === 0 || refill.lines[i - 1].categoryName !== l.categoryName
            return (
              <React.Fragment key={l.lineId}>
                {ouvre ? (
                  <FamilyBand
                    name={l.categoryName}
                    count={parFamille.get(l.categoryName) ?? 0}
                    colSpan={3}
                  />
                ) : null}
                <tr>
                  <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{i + 1}</Td>
                  <Td className="max-w-0">
                    <p className="truncate text-[0.85rem] font-medium text-fg">{l.productName}</p>
                    <p className="truncate font-mono text-[0.7rem] text-fg-subtle">{l.productRef}</p>
                  </Td>
                  <Td className="whitespace-nowrap text-right font-semibold tabular-nums text-fg">
                    {formatQty(l.quantity)} {l.unitSymbol}
                  </Td>
                </tr>
              </React.Fragment>
            )
          })}
        </tbody>
      </TableWrap>
    </GlassCard>
    </div>
  )
}
