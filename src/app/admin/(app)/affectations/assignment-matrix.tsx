'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Save, Check, RotateCcw, Settings2, Plus, Pencil, Trash2, AlertCircle, PackageSearch } from 'lucide-react'
import { GlassCard, Button, Badge, Field, EmptyState } from '@/components/ui/glass'
import { Modal } from '@/components/ui/modal'
import { Icon } from '@/components/ui/icon'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  setDepartmentCategories, listCategoryProducts, createProduct, updateProduct, deleteProduct,
  type ActionResult,
} from '@/server/services/admin'

type Dept = { id: number; name: string; code: string; color: string; icon: string | null }
type Cat = { id: number; name: string; icon: string | null; _count: { products: number } }

type UnitRef = { id: string; name: string; symbol: string }

export function AssignmentMatrix({
  departments, categories, links, units,
}: {
  departments: Dept[]
  categories: Cat[]
  links: { departmentId: number; categoryId: number }[]
  units: UnitRef[]
}) {
  // Famille dont on gère les articles ; null quand le panneau est fermé.
  const [managing, setManaging] = React.useState<Cat | null>(null)
  const router = useRouter()
  const { push } = useToast()

  const initial = React.useMemo(() => {
    const map: Record<number, Set<number>> = {}
    for (const d of departments) map[d.id] = new Set()
    for (const l of links) map[l.departmentId]?.add(l.categoryId)
    return map
  }, [departments, links])

  const [state, setState] = React.useState<Record<number, Set<number>>>(() =>
    Object.fromEntries(Object.entries(initial).map(([k, v]) => [Number(k), new Set(v)])),
  )
  const [saving, setSaving] = React.useState<number | null>(null)

  const toggle = (deptId: number, catId: number) =>
    setState((s) => {
      const next = new Set(s[deptId])
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return { ...s, [deptId]: next }
    })

  const setAll = (deptId: number, on: boolean) =>
    setState((s) => ({ ...s, [deptId]: on ? new Set(categories.map((c) => c.id)) : new Set() }))

  const isDirty = (deptId: number) => {
    const a = initial[deptId]
    const b = state[deptId]
    if (a.size !== b.size) return true
    for (const id of a) if (!b.has(id)) return true
    return false
  }

  const save = async (deptId: number) => {
    setSaving(deptId)
    try {
      const r = await setDepartmentCategories(deptId, [...state[deptId]])
      if (r.ok) {
        push('success', 'Affectations enregistrées.')
        router.refresh()
      } else {
        push('error', r.error ?? 'Enregistrement impossible.')
      }
    } finally {
      setSaving(null)
    }
  }

  /** Nombre d'articles visibles par le département, d'après les cases cochées. */
  const productCount = (deptId: number) =>
    categories.reduce((s, c) => (state[deptId].has(c.id) ? s + c._count.products : s), 0)

  return (
    <div className="space-y-4">
      {departments.map((d) => {
        const dirty = isDirty(d.id)
        const checked = state[d.id]
        return (
          <GlassCard key={d.id}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-xl text-white shadow-sm"
                  style={{ background: `linear-gradient(140deg, ${d.color}, ${d.color}bb)` }}
                >
                  <Icon name={d.icon ?? 'Building2'} className="size-[1.05rem]" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[0.95rem] font-bold leading-tight text-fg">{d.name}</p>
                  <p className="text-[0.75rem] tabular-nums text-fg-subtle">
                    {checked.size} catégorie{checked.size > 1 ? 's' : ''} · {productCount(d.id)} articles
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {dirty ? <Badge tone="warn">Non enregistré</Badge> : null}
                <Button size="sm" variant="ghost" onClick={() => setAll(d.id, true)}>Tout</Button>
                <Button size="sm" variant="ghost" onClick={() => setAll(d.id, false)}>Aucun</Button>
                {dirty ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Annuler les modifications"
                    onClick={() => setState((s) => ({ ...s, [d.id]: new Set(initial[d.id]) }))}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant={dirty ? 'primary' : 'secondary'}
                  disabled={!dirty}
                  loading={saving === d.id}
                  onClick={() => save(d.id)}
                >
                  {saving !== d.id ? <Save className="size-3.5" /> : null}
                  Enregistrer
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 p-3 sm:grid-cols-3 sm:p-4 lg:grid-cols-4">
              {categories.map((c) => {
                const on = checked.has(c.id)
                return (
                  <div
                    key={c.id}
                    className={cn(
                      'flex items-center gap-1 rounded-xl border pr-1 transition-colors',
                      on
                        ? 'border-accent/40 bg-accent/10'
                        : 'border-[rgb(var(--glass-edge)/0.26)] bg-white/40 hover:bg-white/70',
                    )}
                  >
                  <button
                    type="button"
                    onClick={() => toggle(d.id, c.id)}
                    aria-pressed={on}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
                  >
                    <span
                      className={cn(
                        'grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
                        on ? 'border-accent bg-accent text-white' : 'border-[rgb(var(--glass-edge)/0.4)]',
                      )}
                    >
                      {on ? <Check className="size-3.5" /> : null}
                    </span>
                    {c.icon ? (
                      <Icon
                        name={c.icon}
                        className={cn('size-4 shrink-0', on ? 'text-accent' : 'text-fg-subtle')}
                      />
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-[0.8rem] font-medium', on ? 'text-fg' : 'text-fg-muted')}>
                        {c.name}
                      </span>
                      <span className="block text-[0.68rem] tabular-nums text-fg-subtle">
                        {c._count.products} article{c._count.products > 1 ? 's' : ''}
                      </span>
                    </span>
                  </button>
                  {/* Gérer les articles de la famille, sans toucher à la case. */}
                  <button
                    type="button"
                    onClick={() => setManaging(c)}
                    title={`Gérer les articles de « ${c.name} »`}
                    aria-label={`Gérer les articles de ${c.name}`}
                    className="grid size-7 shrink-0 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-[rgb(var(--glass-edge)/0.2)] hover:text-fg"
                  >
                    <Settings2 className="size-4" />
                  </button>
                  </div>
                )
              })}
            </div>
          </GlassCard>
        )
      })}
      {managing ? (
        <ManageProducts
          category={managing}
          units={units}
          onClose={() => setManaging(null)}
          onChanged={() => router.refresh()}
        />
      ) : null}
    </div>
  )
}

type Row = {
  id: number
  name: string
  reference: string
  baseUnit: { id: number; name: string; symbol: string }
  _count: { lines: number; departments: number }
}

/** Ajout, modification et retrait des articles d'une famille. */
function ManageProducts({
  category, units, onClose, onChanged,
}: {
  category: Cat
  units: UnitRef[]
  onClose: () => void
  onChanged: () => void
}) {
  const { push } = useToast()
  const [rows, setRows] = React.useState<Row[] | null>(null)
  const [editing, setEditing] = React.useState<Row | null | undefined>(undefined)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const list = (await listCategoryProducts(category.id)) as unknown as Row[]
    setRows(list)
  }, [category.id])

  React.useEffect(() => {
    void load()
  }, [load])

  const remove = async (row: Row) => {
    if (!confirm(`Retirer « ${row.name} » ?`)) return
    setBusy(true)
    try {
      const r = await deleteProduct(row.id)
      if (!r.ok) {
        push('error', r.error ?? 'Suppression impossible.')
      } else {
        // Un article déjà commandé est désactivé plutôt que supprimé : le
        // message explique ce qui s'est passé.
        push(r.error ? 'info' : 'success', r.error ?? 'Article retiré.')
        await load()
        onChanged()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Modal title={`Articles — ${category.name}`} onClose={onClose}>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.8rem] text-fg-muted">
              {rows === null ? 'Chargement…' : `${rows.length} article(s)`}
            </p>
            <Button size="sm" variant="primary" onClick={() => setEditing(null)}>
              <Plus className="size-3.5" />
              Nouvel article
            </Button>
          </div>

          {rows !== null && rows.length === 0 ? (
            <EmptyState
              icon={<PackageSearch className="size-6" />}
              title="Aucun article"
              description="Cette famille est vide."
            />
          ) : null}

          <ul className="divide-y divide-[rgb(var(--glass-edge)/0.14)]">
            {(rows ?? []).map((row) => (
              <li key={row.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.85rem] font-medium text-fg">{row.name}</p>
                  <p className="truncate text-[0.7rem] text-fg-subtle">
                    <span className="font-mono">{row.reference}</span>
                    <span className="mx-1.5">·</span>
                    {row.baseUnit.symbol}
                    {row._count.departments > 0 ? (
                      <>
                        <span className="mx-1.5">·</span>
                        {row._count.departments} feuille(s)
                      </>
                    ) : null}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Modifier ${row.name}`}
                  disabled={busy}
                  onClick={() => setEditing(row)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Retirer ${row.name}`}
                  disabled={busy}
                  className="text-danger hover:bg-danger/10"
                  onClick={() => remove(row)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      {editing !== undefined ? (
        <ProductForm
          product={editing}
          category={category}
          units={units}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined)
            push('success', 'Article enregistré.')
            await load()
            onChanged()
          }}
        />
      ) : null}
    </>
  )
}

function ProductForm({
  product, category, units, onClose, onSaved,
}: {
  product: Row | null
  category: Cat
  units: UnitRef[]
  onClose: () => void
  onSaved: () => void
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    product ? updateProduct : createProduct,
    { ok: false },
  )

  React.useEffect(() => {
    if (state.ok) onSaved()
  }, [state.ok, onSaved])

  return (
    <Modal title={product ? 'Modifier l’article' : 'Nouvel article'} onClose={onClose}>
      <form action={formAction} className="space-y-4">
        {product ? <input type="hidden" name="id" value={product.id} /> : null}
        <input type="hidden" name="categoryId" value={category.id} />

        {state.error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[0.83rem] font-medium text-danger"
          >
            <AlertCircle className="mt-px size-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        <Field label="Nom de l’article" htmlFor="a-name" required>
          <input
            id="a-name"
            name="name"
            defaultValue={product?.name}
            className="field"
            autoFocus
            required
            placeholder="SIROP MELON"
          />
        </Field>

        <Field label="Famille" hint={`L’article reste dans « ${category.name} ».`}>
          <input className="field" value={category.name} disabled readOnly />
        </Field>

        <Field label="Unité" htmlFor="a-unit" required>
          <select
            id="a-unit"
            name="unitId"
            defaultValue={product ? String(product.baseUnit.id) : undefined}
            className="field"
            required
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>
            ))}
          </select>
        </Field>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <SubmitButton edit={!!product} />
        </div>
      </form>
    </Modal>
  )
}

function SubmitButton({ edit }: { edit: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="primary" loading={pending}>
      {edit ? 'Enregistrer' : 'Créer l’article'}
    </Button>
  )
}
