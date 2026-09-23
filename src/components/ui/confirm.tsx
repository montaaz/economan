'use client'

import * as React from 'react'
import { AlertTriangle, Trash2, Check, CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/glass'
import { Modal } from '@/components/ui/modal'

type Demande = {
  title: string
  message: React.ReactNode
  /** Libellé du bouton de validation. */
  confirmLabel?: string
  tone?: 'danger' | 'warn' | 'info'
  /**
   * Un seul bouton, sans « Annuler ».
   *
   * Pour un avertissement qu'on lit avant d'agir — « ceci bloquera la
   * commande » — plutôt que pour une question. Le bouton vaut « j'ai lu,
   * on continue » ; la croix ferme sans continuer.
   */
  single?: boolean
  /** Icône de tête ; le triangle d'alerte par défaut. */
  icon?: React.ReactNode
  /**
   * Se ferme seul après ce délai (ms), comme validé : pour un avertissement
   * qu'on a le temps de lire, sans obliger à cliquer. La barre en pied dit
   * le temps qui reste.
   */
  autoClose?: number
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

  // Fermeture automatique : le délai court depuis l'ouverture, et s'annule
  // si la demande change ou se ferme avant.
  React.useEffect(() => {
    if (!demande?.autoClose) return
    // Se fermer seul n'est pas cliquer OK : la promesse dit « rien fait ».
    const t = window.setTimeout(() => { demande.resolve(false); setDemande(null) }, demande.autoClose)
    return () => window.clearTimeout(t)
  }, [demande])

  return (
    <Ctx.Provider value={ask}>
      {children}
      {demande ? (
        <Modal
          title={demande.title}
          // Fermer par la croix, l'arrière-plan ou Échap vaut « non », y
          // compris sur une boîte à un seul bouton : fermer n'est pas
          // valider. Seul le bouton fait l'action ; la croix laisse tout en
          // l'état.
          onClose={() => close(false)}
          footer={
            demande.single ? (
              // Un avertissement se lit, il ne se refuse pas : un seul bouton,
              // au centre, et la croix vaut la même chose que lui.
              <div className="flex w-full justify-center">
                <Button variant="primary" autoFocus onClick={() => close(true)}>
                  {demande.confirmLabel ?? 'OK'}
                </Button>
              </div>
            ) : (
              <>
                <Button variant="ghost" onClick={() => close(false)}>
                  Annuler
                </Button>
                {/* Une question sans rien de destructif — « accepter ? » — se
                    valide en bleu, avec une coche : la corbeille rouge
                    annoncerait une perte qui n'existe pas. */}
                <Button
                  variant={demande.tone === 'info' ? 'primary' : demande.tone === 'warn' ? 'warning' : 'danger'}
                  autoFocus
                  onClick={() => close(true)}
                >
                  {demande.tone === 'info' ? <Check className="size-4" /> : <Trash2 className="size-4" />}
                  {demande.confirmLabel ?? (demande.tone === 'info' ? 'OK' : 'Supprimer')}
                </Button>
              </>
            )
          }
        >
          {demande.single ? (
            // Message centré : on le lit d'un bloc, sans chercher où
            // commence la phrase.
            <div className="flex flex-col items-center gap-3 text-center">
              <span
                className={
                  'grid size-12 shrink-0 place-items-center rounded-2xl '
                  + (demande.tone === 'info' ? 'bg-accent/12 text-accent'
                    : demande.tone === 'warn' ? 'bg-warn/12 text-warn'
                    : 'bg-danger/12 text-danger')
                }
              >
                {demande.icon ?? <AlertTriangle className="size-6" />}
              </span>
              <div className="text-[0.9rem] leading-relaxed text-fg-muted">
                {demande.message}
              </div>
              {demande.autoClose ? (
                <span aria-hidden className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-[rgb(var(--glass-edge)/0.18)]">
                  <span
                    className={'animate-deplete block h-full origin-left rounded-full ' + (demande.tone === 'info' ? 'bg-accent' : demande.tone === 'warn' ? 'bg-warn' : 'bg-danger')}
                    style={{ animationDuration: `${demande.autoClose}ms` }}
                  />
                </span>
              ) : null}
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <span
                className={
                  'grid size-10 shrink-0 place-items-center rounded-xl '
                  + (demande.tone === 'info' ? 'bg-accent/12 text-accent' : demande.tone === 'warn' ? 'bg-warn/12 text-warn' : 'bg-danger/12 text-danger')
                }
              >
                {demande.icon ?? (demande.tone === 'info' ? <CircleHelp className="size-5" /> : <AlertTriangle className="size-5" />)}
              </span>
              <div className="min-w-0 text-[0.88rem] leading-relaxed text-fg-muted">
                {demande.message}
              </div>
            </div>
          )}
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
