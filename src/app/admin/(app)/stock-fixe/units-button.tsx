'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Ruler, Plus, Pencil, Trash2, AlertCircle } from 'lucide-react'
import { Button, Field, Badge } from '@/components/ui/glass'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { listUnits, createUnit, updateUnit, deleteUnit, type ActionResult } from '@/server/services/admin'

type Unit = {
  id: number
  name: string
  symbol: string
  allowsDecimals: boolean
  _count: { products: number; orderLines: number }
}

export function UnitsButton() {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Ruler className="size-3.5" />
        Unités
      </Button>
      {open ? <UnitsPanel onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function UnitsPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const { push } = useToast()
  const [units, setUnits] = React.useState<Unit[] | null>(null)
  const [editing, setEditing] = React.useState<Unit | null | undefined>(undefined)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    setUnits((await listUnits()) as unknown as Unit[])
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const remove = async (u: Unit) => {
    if (!confirm(`Supprimer l’unité « ${u.name} » ?`)) return
    setBusy(true)
    try {
      const r = await deleteUnit(u.id)
      if (!r.ok) {
        push('error', r.error ?? 'Suppression impossible.')
      } else {
        push('success', 'Unité supprimée.')
        await load()
        router.refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Modal title="Unités de mesure" onClose={onClose}>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.8rem] text-fg-muted">
              {units === null ? 'Chargement…' : `${units.length} unité(s)`}
            </p>
            <Button size="sm" variant="primary" onClick={() => setEditing(null)}>
              <Plus className="size-3.5" />
              Nouvelle unité
            </Button>
          </div>

          <ul className="divide-y divide-[rgb(var(--glass-edge)/0.14)]">
            {(units ?? []).map((u) => {
              const used = u._count.products + u._count.orderLines
              return (
                <li key={u.id} className="flex items-center gap-2 py-2">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[rgb(var(--glass-edge)/0.16)] font-mono text-[0.78rem] font-bold text-fg-muted">
                    {u.symbol}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.85rem] font-medium text-fg">{u.name}</p>
                    <p className="truncate text-[0.7rem] text-fg-subtle">
                      {u.allowsDecimals ? 'décimales autorisées' : 'nombres entiers'}
                      {used > 0 ? (
                        <>
                          <span className="mx-1.5">·</span>
                          {u._count.products} article(s)
                        </>
                      ) : null}
                    </p>
                  </div>
                  {used === 0 ? <Badge tone="neutral">inutilisée</Badge> : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Modifier ${u.name}`}
                    disabled={busy}
                    onClick={() => setEditing(u)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Supprimer ${u.name}`}
                    disabled={busy}
                    className="text-danger hover:bg-danger/10"
                    onClick={() => remove(u)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              )
            })}
          </ul>

          <p className="rounded-xl border border-[rgb(var(--glass-edge)/0.26)] bg-white/40 px-3 py-2.5 text-[0.78rem] leading-snug text-fg-muted">
            Renommer une unité est sans danger : les articles et les commandes gardent leur
            référence. Une unité utilisée ne peut pas être supprimée.
          </p>
        </div>
      </Modal>

      {editing !== undefined ? (
        <UnitForm
          unit={editing}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined)
            push('success', 'Unité enregistrée.')
            await load()
            router.refresh()
          }}
        />
      ) : null}
    </>
  )
}

function UnitForm({
  unit, onClose, onSaved,
}: {
  unit: Unit | null
  onClose: () => void
  onSaved: () => void
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    unit ? updateUnit : createUnit,
    { ok: false },
  )

  React.useEffect(() => {
    if (state.ok) onSaved()
  }, [state.ok, onSaved])

  return (
    <Modal title={unit ? 'Modifier l’unité' : 'Nouvelle unité'} onClose={onClose}>
      <form action={formAction} className="space-y-4">
        {unit ? <input type="hidden" name="id" value={unit.id} /> : null}

        {state.error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[0.83rem] font-medium text-danger"
          >
            <AlertCircle className="mt-px size-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        <Field label="Nom" htmlFor="u-name" required>
          <input
            id="u-name"
            name="name"
            defaultValue={unit?.name}
            className="field"
            autoFocus
            required
            placeholder="Kilogramme"
          />
        </Field>

        <Field label="Symbole" htmlFor="u-symbol" required hint="Affiché dans les feuilles et les bons.">
          <input
            id="u-symbol"
            name="symbol"
            defaultValue={unit?.symbol}
            className="field"
            required
            placeholder="kg"
          />
        </Field>

        <Field label="Décimales">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-[rgb(var(--glass-edge)/0.12)]">
            <input
              type="checkbox"
              name="allowsDecimals"
              defaultChecked={unit?.allowsDecimals ?? true}
              className="size-4 accent-[var(--accent)]"
            />
            <span className="text-[0.82rem] text-fg">
              Autoriser les quantités décimales (2,5 kg)
            </span>
          </label>
        </Field>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <SubmitButton edit={!!unit} />
        </div>
      </form>
    </Modal>
  )
}

function SubmitButton({ edit }: { edit: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="primary" loading={pending}>
      {edit ? 'Enregistrer' : 'Créer l’unité'}
    </Button>
  )
}
