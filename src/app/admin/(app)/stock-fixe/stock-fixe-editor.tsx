'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Save, Search, PackageSearch, Target, RotateCcw, Plus, AlertCircle } from 'lucide-react'
import { GlassCard, Button, Badge, EmptyState, TableWrap, Th, Td } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { useToast } from '@/components/ui/toast'
import { usePagedRows, ShowMore } from '@/components/ui/paged-list'
import { Modal } from '@/components/ui/modal'
import { Field } from '@/components/ui/glass'
import { gql, errorMessage } from '@/lib/graphql-client'
import { createProductForDepartment, type ActionResult } from '@/server/services/admin'
import { cn, formatQty, toNumber } from '@/lib/utils'

type Dept = { id: number; name: string; code: string; color: string; icon: string | null }

export type ParLine = {
  id: string
  name: string
  reference: string
  unitSymbol: string
  category: { id: string; name: string; icon: string | null }
  quantity: number
}

const SET_PAR = /* GraphQL */ `
  mutation SetPar($departmentId: ID!, $lines: [StockFixeInput!]!) {
    setStockFixe(departmentId: $departmentId, lines: $lines)
  }
`

type Ref = { id: string; name: string }

export function StockFixeEditor({
  departments, selectedId, products, categories: allCategories, units,
}: {
  departments: Dept[]
  selectedId: number
  products: ParLine[]
  categories: Ref[]
  units: (Ref & { symbol: string })[]
}) {
  // Famille visée par le formulaire d'ajout ; null quand il est fermé.
  const [addingTo, setAddingTo] = React.useState<
    { id: string; name: string; preset?: boolean } | null
  >(null)
  const router = useRouter()
  const { push } = useToast()

  const [search, setSearch] = React.useState('')
  const [activeCategory, setActiveCategory] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  // Valeurs éditées, indexées par article. On part des valeurs en base.
  const initial = React.useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, String(p.quantity)])),
    [products],
  )
  const [values, setValues] = React.useState<Record<string, string>>(initial)

  // Changer de département recharge la page : on repart des nouvelles valeurs.
  React.useEffect(() => setValues(initial), [initial])

  const categories = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string; icon: string | null }>()
    for (const p of products) map.set(p.category.id, p.category)
    return [...map.values()]
  }, [products])

  const visible = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) => {
      if (activeCategory && p.category.id !== activeCategory) return false
      if (!q) return true
      return p.name.toLowerCase().includes(q) || p.reference.toLowerCase().includes(q)
    })
  }, [products, search, activeCategory])

  const paged = usePagedRows(visible)

  const dirty = React.useMemo(
    () => products.filter((p) => toNumber(values[p.id]) !== p.quantity),
    [products, values],
  )

  const configured = React.useMemo(
    () => products.filter((p) => toNumber(values[p.id]) > 0).length,
    [products, values],
  )

  const setValue = (id: string, raw: string) => {
    const v = raw.replace(',', '.')
    if (v !== '' && !/^\d*\.?\d*$/.test(v)) return
    setValues((s) => ({ ...s, [id]: v }))
  }

  const save = async () => {
    if (dirty.length === 0) return
    setSaving(true)
    try {
      // On n'envoie que ce qui a bougé : régler 550 articles d'un coup pour
      // trois modifications serait du gaspillage.
      await gql(SET_PAR, {
        departmentId: String(selectedId),
        lines: dirty.map((p) => ({ productId: p.id, quantity: toNumber(values[p.id]) })),
      })
      push('success', `Stock fixe enregistré — ${dirty.length} article(s) mis à jour.`)
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const current = departments.find((d) => d.id === selectedId)

  return (
    <div className="space-y-4">
      {/* Choix du département */}
      <div className="scroll-x -mx-1 flex gap-2 px-1 pb-1">
        {departments.map((d) => {
          const on = d.id === selectedId
          return (
            <button
              key={d.id}
              onClick={() => router.push(`/admin/stock-fixe?dep=${d.id}`)}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-[0.83rem] font-medium transition-colors',
                on
                  ? 'border-accent/45 bg-accent/12 text-accent'
                  : 'border-[rgb(var(--glass-edge)/0.28)] bg-white/50 text-fg-muted hover:bg-white/80',
              )}
            >
              <span
                className="grid size-6 shrink-0 place-items-center rounded-lg text-white"
                style={{ background: d.color }}
              >
                <Icon name={d.icon ?? 'Building2'} className="size-3.5" />
              </span>
              {d.name}
            </button>
          )
        })}
      </div>

      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
              <Target className="size-[1.05rem]" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[0.95rem] font-bold leading-tight text-fg">
                {current?.name ?? '—'}
              </p>
              <p className="text-[0.75rem] tabular-nums text-fg-subtle">
                {configured} article(s) réglé(s) sur {products.length}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {/* Ajout depuis l'en-tête : la famille se choisit dans le formulaire. */}
            {allCategories.length > 0 ? (
              <Button
                size="sm"
                variant="success"
                onClick={() => setAddingTo({ ...allCategories[0], preset: false })}
              >
                <Plus className="size-3.5" />
                Nouvel article
              </Button>
            ) : null}
            {dirty.length > 0 ? <Badge tone="warn">{dirty.length} modifié(s)</Badge> : null}
            {dirty.length > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                aria-label="Annuler les modifications"
                onClick={() => setValues(initial)}
              >
                <RotateCcw className="size-3.5" />
              </Button>
            ) : null}
            <Button
              variant={dirty.length > 0 ? 'primary' : 'secondary'}
              disabled={dirty.length === 0}
              loading={saving}
              onClick={save}
            >
              {!saving ? <Save className="size-4" /> : null}
              Enregistrer
            </Button>
          </div>
        </div>

        {/* Filtres */}
        <div className="space-y-3 border-b border-[rgb(var(--glass-edge)/0.16)] p-3.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un article…"
              className="field pl-9"
              aria-label="Rechercher un article"
            />
          </div>
          <div className="scroll-x -mx-1 flex gap-1.5 px-1 pb-1">
            <button
              onClick={() => setActiveCategory(null)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-[0.78rem] font-medium transition-colors',
                activeCategory === null
                  ? 'border-accent/40 bg-accent/12 text-accent'
                  : 'border-[rgb(var(--glass-edge)/0.28)] text-fg-muted hover:bg-[rgb(var(--glass-edge)/0.14)]',
              )}
            >
              Tout ({products.length})
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.78rem] font-medium transition-colors',
                  activeCategory === c.id
                    ? 'border-accent/40 bg-accent/12 text-accent'
                    : 'border-[rgb(var(--glass-edge)/0.28)] text-fg-muted hover:bg-[rgb(var(--glass-edge)/0.14)]',
                )}
              >
                {c.icon ? <Icon name={c.icon} className="size-3.5" /> : null}
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={<PackageSearch className="size-6" />}
            title="Aucun article"
            description="Ce département n’a aucune catégorie affectée, ou la recherche ne donne rien."
          />
        ) : (
          <>
            <TableWrap minWidth="0">
              <thead>
                <tr>
                  <Th className="w-8 px-1 text-right sm:w-10 sm:px-3">#</Th>
                  <Th className="w-full px-1 sm:px-3">Article</Th>
                  <Th className="px-1 text-right sm:px-3">Unité</Th>
                  <Th className="w-[7rem] px-1 text-right sm:w-40 sm:px-3">Stock fixe</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
                {paged.shown.map((p, i) => {
                  const v = toNumber(values[p.id])
                  const changed = v !== p.quantity
                  const previous = i > 0 ? paged.shown[i - 1] : null
                  const next = paged.shown[i + 1] ?? null
                  const opensFamily = previous?.category.id !== p.category.id
                  const closesFamily = next?.category.id !== p.category.id
                  return (
                    <React.Fragment key={p.id}>
                      {opensFamily ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="bg-ok/12 px-2 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.06em] text-ok sm:px-3 sm:text-[0.76rem]"
                          >
                            <span className="flex items-center gap-1.5">
                              {p.category.icon ? (
                                <Icon name={p.category.icon} className="size-3.5 shrink-0" />
                              ) : null}
                              {p.category.name}
                            </span>
                          </td>
                        </tr>
                      ) : null}
                    <tr className={cn(changed && 'bg-warn/[0.07]')}>
                      <Td className="px-1 text-right text-[0.72rem] tabular-nums text-fg-subtle sm:px-3 sm:text-[0.78rem]">
                        {i + 1}
                      </Td>
                      <Td className="max-w-0 px-1 sm:px-3">
                        <p className="truncate text-[0.78rem] font-medium leading-snug text-fg sm:text-[0.85rem]">
                          {p.name}
                        </p>
                        <p className="truncate font-mono text-[0.68rem] text-fg-subtle sm:text-[0.7rem]">
                          {p.reference}
                        </p>
                      </Td>
                      <Td className="whitespace-nowrap px-1 text-right text-[0.75rem] text-fg-muted sm:px-3 sm:text-[0.86rem]">
                        {p.unitSymbol}
                      </Td>
                      <Td className="px-1 sm:px-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <input
                            inputMode="decimal"
                            value={values[p.id] ?? ''}
                            onChange={(e) => setValue(p.id, e.target.value)}
                            placeholder="0"
                            aria-label={`Stock fixe pour ${p.name}`}
                            className="field h-9 w-16 px-1.5 py-0 text-right text-[0.8rem] tabular-nums sm:w-24 sm:px-3 sm:text-[0.85rem]"
                          />
                        </div>
                      </Td>
                    </tr>
                    {/* Sous la dernière ligne de la famille : l'ajout d'article. */}
                    {closesFamily ? (
                      <tr>
                        <td colSpan={4} className="px-2 py-1.5 sm:px-3">
                          <button
                            type="button"
                            onClick={() => setAddingTo(p.category)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-ok/40 px-2.5 py-1.5 text-[0.75rem] font-medium text-ok transition-colors hover:bg-ok/10"
                          >
                            <Plus className="size-3.5" />
                            Ajouter un article dans « {p.category.name} »
                          </button>
                        </td>
                      </tr>
                    ) : null}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </TableWrap>

            <ShowMore
              remaining={paged.remaining}
              onMore={paged.showMore}
              onAll={paged.showAll}
              shown={paged.shown.length}
              total={paged.total}
            />
          </>
        )}

        <p className="border-t border-[rgb(var(--glass-edge)/0.14)] px-4 py-2.5 text-[0.78rem] text-fg-muted sm:px-5">
          Un article laissé à <strong className="text-fg">0</strong> ne sera jamais commandé :
          l’employé le verra, mais l’écart restera nul tant que vous n’aurez pas fixé de cible.
        </p>
      </GlassCard>
      {addingTo ? (
        <AddProductForm
          departmentId={selectedId}
          departmentName={current?.name ?? ''}
          family={addingTo}
          categories={allCategories}
          units={units}
          preset={addingTo.preset !== false}
          onClose={() => setAddingTo(null)}
          onSaved={() => {
            setAddingTo(null)
            push('success', 'Article créé et ajouté à la feuille.')
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function AddProductForm({
  departmentId, departmentName, family, categories, units, preset = true, onClose, onSaved,
}: {
  departmentId: number
  departmentName: string
  family: { id: string; name: string }
  categories: Ref[]
  units: (Ref & { symbol: string })[]
  /** Faux quand le formulaire s'ouvre depuis l'en-tête : la famille est à choisir. */
  preset?: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    createProductForDepartment,
    { ok: false },
  )

  React.useEffect(() => {
    if (state.ok) onSaved()
  }, [state.ok, onSaved])

  return (
    <Modal title="Nouvel article" onClose={onClose}>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="departmentId" value={departmentId} />

        <p className="rounded-xl border border-ok/30 bg-ok/[0.07] px-3 py-2.5 text-[0.8rem] leading-snug text-fg-muted">
          L’article sera créé au catalogue et ajouté à la feuille de{' '}
          <strong className="text-fg">{departmentName}</strong>, en fin de la famille
          {preset ? (
            <> <strong className="text-ok">{family.name}</strong>.</>
          ) : (
            <> choisie ci-dessous.</>
          )}
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

        <Field label="Nom de l’article" htmlFor="p-name" required>
          <input id="p-name" name="name" className="field" autoFocus required placeholder="SIROP MELON" />
        </Field>

        <Field label="Famille" htmlFor="p-cat" required>
          <select id="p-cat" name="categoryId" defaultValue={family.id} className="field" required>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Unité" htmlFor="p-unit" required>
          <select id="p-unit" name="unitId" className="field" required>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>
            ))}
          </select>
        </Field>

        <Field
          label="Stock fixe"
          htmlFor="p-qty"
          hint="La quantité cible pour ce département. 0 : l’article s’affiche mais ne sera pas commandé."
        >
          <input id="p-qty" name="quantity" inputMode="decimal" defaultValue="0" className="field" />
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
    <Button type="submit" variant="primary" loading={pending}>
      Créer l’article
    </Button>
  )
}
