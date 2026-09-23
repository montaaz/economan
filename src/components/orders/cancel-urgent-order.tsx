'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Ban, Trash2, Pencil, X } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/glass'
import { useToast } from '@/components/ui/toast'
import { gql, errorMessage } from '@/lib/graphql-client'

const DELETE = /* GraphQL */ `
  mutation DeleteOrder($id: ID!) { deleteOrder(id: $id) }
`

/**
 * « Annuler la commande », sur une urgente encore en attente.
 *
 * Annuler peut vouloir dire deux choses : elle n'aurait pas dû partir, ou
 * elle est partie avec une erreur. La boîte pose la question — supprimer, ou
 * retourner la modifier — plutôt que de deviner. Passé l'acceptation par
 * l'économat, ni l'un ni l'autre : la commande se traite.
 */
export function CancelUrgentOrder({
  id, reference, editHref,
}: {
  id: string
  reference: string
  editHref: string
}) {
  const router = useRouter()
  const { push } = useToast()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const supprimer = async () => {
    if (busy) return
    setBusy(true)
    try {
      const d = await gql<{ deleteOrder: string }>(DELETE, { id })
      push('success', `Commande ${d.deleteOrder} supprimée.`)
      setOpen(false)
      router.push('/admin')
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        <Ban className="size-3.5" />
        Annuler la commande
      </Button>
      {open ? (
        <Modal title={`Annuler la commande ${reference} ?`} onClose={() => setOpen(false)}>
          <p className="text-[0.88rem] text-fg-muted">
            Elle n’a pas encore été prise en charge par l’économat. Que voulez-vous faire ?
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void supprimer()}
              disabled={busy}
              className="flex items-start gap-3 rounded-2xl border border-danger/40 bg-danger/[0.07] p-4 text-left transition-colors hover:bg-danger/[0.12] disabled:opacity-60"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger text-white">
                <Trash2 className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[0.95rem] font-bold text-fg">Supprimer la commande</span>
                <span className="mt-0.5 block text-[0.8rem] text-fg-muted">
                  Elle disparaît du tableau. Le numéro de ticket reste consommé.
                </span>
              </span>
            </button>
            <Link
              href={editHref}
              onClick={() => setOpen(false)}
              className="flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent/[0.07] p-4 text-left transition-colors hover:bg-accent/[0.12]"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-white">
                <Pencil className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[0.95rem] font-bold text-fg">Retourner la modifier</span>
                <span className="mt-0.5 block text-[0.8rem] text-fg-muted">
                  La feuille se rouvre avec vos quantités ; le ticket garde son numéro.
                </span>
              </span>
            </Link>
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              <X className="size-3.5" />
              Fermer
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  )
}
