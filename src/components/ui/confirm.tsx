'use client'

import * as React from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/glass'
import { Modal } from '@/components/ui/modal'

type Demande = {
  title: string
  message: React.ReactNode
  /** Libellé du bouton de validation. */
  confirmLabel?: string
  tone?: 'danger' | 'warn'
  resolve: (ok: boolean) => void
}

const Ctx = React.createContext<((d: Omit<Demande, 'resolve'>) => Promise<boolean>) | null>(null)

/**
 * Confirmation aux couleurs de l'application.
 *
 * `window.confirm` bloque le fil d'exécution, affiche « localhost:3000 says »
 * et ignore le thème. Ce fournisseur rend la même promesse booléenne, donc les
 * appels existants gardent leur forme :
 *
 *     if (!(await confirm({ title, message }))) return
 *
 * Une seule demande à la fois : deux confirmations superposées n'ont pas de
 * sens, et la seconde écrase la première.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [demande, setDemande] = React.useState<Demande | null>(null)

  const ask = React.useCallback(
    (d: Omit<Demande, 'resolve'>) =>
      new Promise<boolean>((resolve) => setDemande({ ...d, resolve })),
    [],
  )

  const close = (ok: boolean) => {
    demande?.resolve(ok)
    setDemande(null)
  }

  return (
    <Ctx.Provider value={ask}>
      {children}
      {demande ? (
        <Modal
          title={demande.title}
          // Fermer par la croix, l'arrière-plan ou Échap vaut « non » : une
          // fermeture accidentelle ne doit jamais supprimer quoi que ce soit.
          onClose={() => close(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => close(false)}>
                Annuler
              </Button>
              <Button
                variant={demande.tone === 'warn' ? 'warning' : 'danger'}
                autoFocus
                onClick={() => close(true)}
              >
                <Trash2 className="size-4" />
                {demande.confirmLabel ?? 'Supprimer'}
              </Button>
            </>
          }
        >
          <div className="flex items-start gap-3">
            <span
              className={
                'grid size-10 shrink-0 place-items-center rounded-xl '
                + (demande.tone === 'warn' ? 'bg-warn/12 text-warn' : 'bg-danger/12 text-danger')
              }
            >
              <AlertTriangle className="size-5" />
            </span>
            <div className="min-w-0 text-[0.88rem] leading-relaxed text-fg-muted">
              {demande.message}
            </div>
          </div>
        </Modal>
      ) : null}
    </Ctx.Provider>
  )
}

/** Ouvre une confirmation et attend la réponse. */
export function useConfirm() {
  const ask = React.useContext(Ctx)
  if (!ask) throw new Error('useConfirm doit être utilisé dans un ConfirmProvider.')
  return ask
}
