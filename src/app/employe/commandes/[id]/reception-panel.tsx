'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { PackageCheck } from 'lucide-react'
import { Button } from '@/components/ui/glass'
import { useToast } from '@/components/ui/toast'
import { gql, errorMessage } from '@/lib/graphql-client'

const RECEIVE = /* GraphQL */ `
  mutation Receive($id: ID!, $note: String) {
    receiveOrder(id: $id, note: $note) { id status }
  }
`

/**
 * Confirmation de la réception.
 *
 * Un seul geste : le département signe pour la livraison, et laisse au
 * besoin une remarque à l'économat — « il manque un carton », « bouteilles
 * cassées ». Compter cent lignes case par case décourageait de vérifier ;
 * une phrase se lit et se traite.
 */
export function ReceptionPanel({ orderId }: { orderId: string }) {
  const router = useRouter()
  const { push } = useToast()
  const [busy, setBusy] = React.useState(false)
  const [note, setNote] = React.useState('')

  const confirm = async () => {
    setBusy(true)
    try {
      await gql(RECEIVE, { id: orderId, note: note.trim() || null })
      push('success', 'Réception confirmée — la commande est clôturée.')
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="no-print space-y-3 rounded-xl border border-info/30 bg-info/[0.07] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.83rem] leading-snug text-fg-muted">
          Vérifiez la livraison, puis confirmez la réception. Si quelque chose ne va pas,
          laissez une remarque à l’économat.
        </p>
        <Button variant="success" loading={busy} onClick={confirm}>
          {!busy ? <PackageCheck className="size-4" /> : null}
          Confirmer la réception
        </Button>
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Remarque (facultatif) : ce qui manque, ce qui est abîmé…"
        aria-label="Remarque à la réception"
        className="field w-full resize-y px-3 py-2 text-[0.85rem]"
      />
    </div>
  )
}
