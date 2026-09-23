'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Lock, LockOpen } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm'
import { useToast } from '@/components/ui/toast'
import { gql, errorMessage } from '@/lib/graphql-client'
import { cn } from '@/lib/utils'

const REOPEN = /* GraphQL */ `
  mutation ReopenOrder($id: ID!) { reopenOrder(id: $id) { id status } }
`
const CLOSE = /* GraphQL */ `
  mutation CloseOrder($id: ID!) { closeOrder(id: $id) { id status } }
`

/**
 * Rouvrir une commande livrée ou réceptionnée, ou la refermer — le geste de
 * l'administration, depuis la carte du ticket.
 *
 * Le bon émis fige le premier servi pour l'économat. Rouvrir rend la
 * commande à l'état accepté : le tableau redevient modifiable, et le bon se
 * réémet ensuite. Refermer la remet dans l'état exact où elle était —
 * réceptionnée si le département avait signé, livrée sinon — quand la
 * réouverture était une erreur. Le bouton vit hors du lien de la carte pour
 * ne pas ouvrir la fiche en même temps.
 */
export function ReopenOrder({
  id, reference, ouverte, recue,
}: {
  id: string
  reference: string
  /** Rouverte : le bouton propose alors de refermer. */
  ouverte: boolean
  /** Le département avait signé : refermer la rendra « réceptionnée ». */
  recue: boolean
}) {
  const router = useRouter()
  const confirmer = useConfirm()
  const { push } = useToast()
  const [busy, setBusy] = React.useState(false)

  const agir = async () => {
    const ok = await confirmer(ouverte
      ? {
          title: 'Refermer cette commande ?',
          message: `${reference} reviendra à l’état « ${recue ? 'réceptionnée' : 'livrée'} », comme avant `
            + 'sa réouverture : l’économat ne pourra plus la modifier.',
          confirmLabel: 'Refermer',
          tone: 'info',
        }
      : {
          title: 'Rouvrir cette commande ?',
          message: `Le bon de livraison de ${reference} est émis. En la rouvrant, l’économat pourra `
            + 'de nouveau corriger les quantités servies, puis devra réémettre le bon'
            + (recue ? ' — et le département la réceptionnera de nouveau.' : '.'),
          confirmLabel: 'Rouvrir',
          tone: 'warn',
        })
    if (!ok) return
    setBusy(true)
    try {
      await gql(ouverte ? CLOSE : REOPEN, { id })
      push('success', ouverte ? `${reference} refermée.` : `${reference} rouverte : l’économat peut la modifier.`)
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={agir}
      disabled={busy}
      title={ouverte ? 'Refermer cette commande (administration)' : 'Rouvrir cette commande (administration)'}
      aria-label={`${ouverte ? 'Refermer' : 'Rouvrir'} la commande ${reference}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border bg-white/80 px-2.5 py-1 text-[0.76rem] font-semibold shadow-sm transition-colors disabled:opacity-60',
        ouverte
          ? 'border-info/40 text-info hover:bg-info/10'
          : 'border-warn/40 text-warn hover:bg-warn/10',
      )}
    >
      {ouverte ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
      <span>{ouverte ? 'Refermer' : 'Rouvrir'}</span>
    </button>
  )
}
