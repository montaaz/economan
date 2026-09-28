'use client'

import * as React from 'react'
import { CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { Button } from '@/components/ui/glass'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'

type ToastTone = 'success' | 'error' | 'info'
type Toast = { id: number; tone: ToastTone; message: string }

const ToastContext = React.createContext<{
  push: (tone: ToastTone, message: string) => void
} | null>(null)

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast doit être utilisé dans <ToastProvider>')
  return ctx
}

const ICONS: Record<ToastTone, React.ElementType> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
}

const TITRES: Record<ToastTone, string> = {
  success: 'Enregistré',
  error: 'Échec',
  info: 'Information',
}

/** Le temps de lecture avant que l'avis se ferme seul. */
const DELAIS: Record<ToastTone, number> = { success: 2500, info: 2500, error: 4000 }

/**
 * Les avis de l'application — « enregistré », « refusé » — au centre de
 * l'écran.
 *
 * Ils passaient en bandeau dans un coin, où personne ne les voyait : on
 * cherchait la confirmation, elle s'était déjà effacée. Ils prennent
 * désormais la forme des autres boîtes de l'application : au centre, une
 * icône, la phrase, et une barre qui dit le temps qui reste. OK, la croix,
 * Échap ou le fond les ferment ; sinon ils se ferment seuls.
 *
 * Un seul avis à la fois : le dernier remplace le précédent, comme les
 * confirmations. Les appels existants gardent leur forme, `push(tone, msg)`.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [avis, setAvis] = React.useState<Toast | null>(null)
  const nextId = React.useRef(0)

  const push = React.useCallback((tone: ToastTone, message: string) => {
    setAvis({ id: nextId.current++, tone, message })
  }, [])

  // La fermeture automatique court depuis l'ouverture, et s'annule si un
  // autre avis prend la place ou si l'on ferme avant.
  React.useEffect(() => {
    if (!avis) return
    const t = window.setTimeout(() => setAvis((a) => (a?.id === avis.id ? null : a)), DELAIS[avis.tone])
    return () => window.clearTimeout(t)
  }, [avis])

  const value = React.useMemo(() => ({ push }), [push])
  const fermer = () => setAvis(null)
  const Icon = avis ? ICONS[avis.tone] : Info

  return (
    <ToastContext.Provider value={value}>
      {children}
      {avis ? (
        <Modal
          title={TITRES[avis.tone]}
          onClose={fermer}
          footer={
            <div className="flex w-full justify-center">
              <Button variant="primary" autoFocus onClick={fermer}>OK</Button>
            </div>
          }
        >
          <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 text-center">
            <span
              className={cn(
                'grid size-12 shrink-0 place-items-center rounded-2xl',
                avis.tone === 'success' ? 'bg-ok/12 text-ok' : avis.tone === 'error' ? 'bg-danger/12 text-danger' : 'bg-accent/12 text-accent',
              )}
            >
              <Icon className="size-6" />
            </span>
            <p className="text-[0.9rem] font-medium leading-relaxed text-fg">{avis.message}</p>
            <span aria-hidden className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-[rgb(var(--glass-edge)/0.2)]">
              <span
                key={avis.id}
                className={cn('animate-deplete block h-full origin-left', avis.tone === 'error' ? 'bg-danger' : avis.tone === 'success' ? 'bg-ok' : 'bg-accent')}
                style={{ animationDuration: `${DELAIS[avis.tone]}ms` }}
              />
            </span>
          </div>
        </Modal>
      ) : null}
    </ToastContext.Provider>
  )
}
