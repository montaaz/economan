'use client'

import * as React from 'react'
import { Check, Loader2, AlertCircle } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'

type Unit = { id: string; name: string; symbol: string }

/**
 * Choix de l'unité d'un article, ouvert en cliquant sur la cellule.
 *
 * Une liste de choix plutôt qu'un champ libre : l'unité est une référence du
 * catalogue, et laisser saisir « kgs » ou « Kg » créerait des doublons
 * silencieux que les commandes traîneraient ensuite.
 *
 * Le panneau reste ouvert le temps de l'écriture et se ferme au succès, pour
 * qu'un refus laisse le choix visible plutôt que de renvoyer l'utilisateur
 * devant une cellule inchangée sans explication.
 */
export function UnitPicker({
  article, currentUnitId, units, onPick, onClose,
}: {
  article: string
  currentUnitId: string
  units: Unit[]
  /** Renvoie un message d'erreur, ou rien si l'écriture a réussi. */
  onPick: (unitId: string) => Promise<string | void>
  onClose: () => void
}) {
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const choose = async (u: Unit) => {
    if (u.id === currentUnitId) return onClose()
    setBusy(u.id)
    setError(null)
    const message = await onPick(u.id)
    setBusy(null)
    if (typeof message === 'string' && message) {
      setError(message)
      return
    }
    onClose()
  }

  return (
    <Modal title="Unité de l’article" onClose={onClose}>
      <div className="space-y-3">
        <p className="rounded-xl border border-[rgb(var(--glass-edge)/0.28)] bg-white/50 px-3 py-2 text-[0.85rem] text-fg-muted">
          <strong className="text-fg">{article}</strong>
        </p>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[0.83rem] font-medium text-danger"
          >
            <AlertCircle className="mt-px size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <ul className="grid gap-1.5 sm:grid-cols-2">
          {units.map((u) => {
            const on = u.id === currentUnitId
            return (
              <li key={u.id}>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void choose(u)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors',
                    on
                      ? 'border-accent/45 bg-accent/12 text-accent'
                      : 'border-[rgb(var(--glass-edge)/0.28)] bg-white/50 text-fg hover:bg-white/85',
                    busy !== null && !on && 'opacity-60',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[0.9rem] font-semibold">{u.name}</span>
                    <span className="block font-mono text-[0.78rem] text-fg-subtle">{u.symbol}</span>
                  </span>
                  {busy === u.id ? (
                    <Loader2 className="size-4 shrink-0 animate-spin" />
                  ) : on ? (
                    <Check className="size-4 shrink-0" />
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>

        <p className="text-[0.78rem] leading-snug text-fg-muted">
          Les commandes déjà passées gardent l’unité qu’elles avaient : ce changement
          ne touche pas l’historique.
        </p>
      </div>
    </Modal>
  )
}
