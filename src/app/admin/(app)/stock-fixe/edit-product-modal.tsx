'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle } from 'lucide-react'
import { Button, Field } from '@/components/ui/glass'
import { Modal } from '@/components/ui/modal'
import { updateProduct, moveProductInSheet, type ActionResult } from '@/server/services/admin'

type Ref = { id: string; name: string }

/**
 * Édition d'un article depuis la feuille : nom, famille, unité et position.
 *
 * La position vit sur la feuille du département (`department_products`), les
 * trois autres champs sur l'article lui-même. Deux écritures donc, faites dans
 * cet ordre : renommer un article puis échouer à le déplacer laisse un état
 * compréhensible, l'inverse déplacerait une ligne dont le nom n'a pas changé.
 */
export function EditProductModal({
  product, departmentId, categories, units, total, onClose, onSaved,
}: {
  product: {
    id: string
    name: string
    reference: string
    categoryId: string
    unitId: string
    position: number
  }
  departmentId: number
  categories: Ref[]
  units: (Ref & { symbol: string })[]
  /** Nombre de lignes de la feuille, pour borner la position. */
  total: number
  onClose: () => void
  onSaved: () => void
}) {
  const [position, setPosition] = React.useState(String(product.position))
  const [moving, setMoving] = React.useState(false)

  const [state, formAction] = useActionState<ActionResult, FormData>(
    async (prev, form) => {
      const res = await updateProduct(prev, form)
      if (!res.ok) return res

      // La position ne passe pas par `updateProduct` : elle appartient à la
      // feuille du département, pas à l'article.
      const wanted = Number(position)
      if (Number.isInteger(wanted) && wanted !== product.position) {
        setMoving(true)
        const moved = await moveProductInSheet(departmentId, Number(product.id), wanted)
        setMoving(false)
        if (!moved.ok) {
          // L'article est bien renommé ; seul le déplacement a échoué. On le
          // dit tel quel plutôt que de laisser croire que rien n'a été fait.
          return {
            ok: false,
            error: `Article modifié, mais non déplacé : ${moved.error ?? 'échec du déplacement.'}`,
          }
        }
      }
      return res
    },
    { ok: false },
  )

  React.useEffect(() => {
    if (state.ok) onSaved()
  }, [state.ok, onSaved])

  return (
    <Modal title="Modifier l’article" onClose={onClose}>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={product.id} />

        <p className="rounded-xl border border-[rgb(var(--glass-edge)/0.28)] bg-white/50 px-3 py-2 font-mono text-[0.78rem] text-fg-muted">
          Référence {product.reference}
          <span className="ml-2 font-sans text-fg-subtle">(non modifiable)</span>
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

        <Field label="Nom de l’article" htmlFor="e-name" required>
          <input
            id="e-name"
            name="name"
            className="field"
            defaultValue={product.name}
            autoFocus
            required
          />
        </Field>

        <Field label="Famille" htmlFor="e-cat" required>
          <select id="e-cat" name="categoryId" defaultValue={product.categoryId} className="field" required>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Unité" htmlFor="e-unit" required>
          <select id="e-unit" name="unitId" defaultValue={product.unitId} className="field" required>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>
            ))}
          </select>
        </Field>

        <Field
          label="Position sur la feuille"
          htmlFor="e-pos"
          hint={`Entre 1 et ${total}. L’article prend cette place, les suivants se décalent.`}
        >
          <input
            id="e-pos"
            inputMode="numeric"
            value={position}
            onChange={(e) => {
              const v = e.target.value
              if (v === '' || /^\d+$/.test(v)) setPosition(v)
            }}
            className="field"
          />
        </Field>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <SubmitButton moving={moving} />
        </div>
      </form>
    </Modal>
  )
}

function SubmitButton({ moving }: { moving: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="primary" loading={pending || moving}>
      Enregistrer
    </Button>
  )
}
