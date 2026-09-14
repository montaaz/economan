'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Plus, AlertCircle } from 'lucide-react'
import { Button, Field } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { createCategory, type ActionResult } from '@/server/services/admin'

/** Quelques icônes lucide courantes pour une famille d'articles. */
const ICONS = [
  'box', 'archive', 'coffee', 'cookie', 'milk', 'beef', 'fish', 'salad',
  'apple', 'wheat', 'flame', 'snowflake', 'wine', 'cup-soda', 'cake-slice', 'spray-can',
]

export function NewCategoryButton() {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button variant="success" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Nouvelle famille
      </Button>
      {open ? <NewCategoryForm onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function NewCategoryForm({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const { push } = useToast()
  const [state, formAction] = useActionState<ActionResult, FormData>(createCategory, { ok: false })
  const [icon, setIcon] = React.useState(ICONS[0])

  React.useEffect(() => {
    if (state.ok) {
      push('success', 'Famille créée. Cochez-la pour les départements concernés.')
      router.refresh()
      onClose()
    }
  }, [state.ok, push, router, onClose])

  return (
    <Modal title="Nouvelle famille" onClose={onClose}>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="icon" value={icon} />

        <p className="rounded-xl border border-ok/30 bg-ok/[0.07] px-3 py-2.5 text-[0.8rem] leading-snug text-fg-muted">
          La famille est créée vide et n’est affectée à aucun département. Cochez-la ensuite
          pour les départements qui la commandent, puis ajoutez-y des articles.
        </p>

        {state.error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[0.83rem] font-medium text-danger"
          >
            <AlertCircle className="mt-px size-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        <Field label="Nom de la famille" htmlFor="f-name" required>
          <input
            id="f-name"
            name="name"
            className="field uppercase"
            autoFocus
            required
            placeholder="FRUITS CONGELES"
          />
        </Field>

        <Field label="Icône">
          <div className="grid grid-cols-8 gap-1.5">
            {ICONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setIcon(n)}
                aria-label={n}
                aria-pressed={icon === n}
                className={cn(
                  'grid aspect-square place-items-center rounded-lg border transition-colors',
                  icon === n
                    ? 'border-ok/45 bg-ok/12 text-ok'
                    : 'border-[rgb(var(--glass-edge)/0.28)] text-fg-muted hover:bg-[rgb(var(--glass-edge)/0.14)]',
                )}
              >
                <Icon name={n} className="size-[1.05rem]" />
              </button>
            ))}
          </div>
        </Field>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <SubmitButton />
        </div>
      </form>
    </Modal>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="success" loading={pending}>
      Créer la famille
    </Button>
  )
}
