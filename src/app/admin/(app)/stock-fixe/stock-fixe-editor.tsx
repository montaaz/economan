'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Search, PackageSearch, Target, Plus, AlertCircle, Pencil, Trash2, Check, Loader2 } from 'lucide-react'
import { GlassCard, Button, Badge, EmptyState, TableWrap, Th, Td, usePending } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { useToast } from '@/components/ui/toast'
import { Modal } from '@/components/ui/modal'
import { Field } from '@/components/ui/glass'
import { gql, errorMessage } from '@/lib/graphql-client'
import {
  createProductForDepartment, renameProduct, moveProductInSheet, setProductUnit,
  toggleDepartmentProduct, type ActionResult,
} from '@/server/services/admin'
import { InlineEdit } from '@/components/ui/inline-edit'
import { useConfirm } from '@/components/ui/confirm'
import { UnitPicker } from './unit-picker'
import { EditProductModal } from './edit-product-modal'
import { cn, formatQty, toNumber } from '@/lib/utils'

type Dept = { id: number; name: string; code: string; color: string; icon: string | null }

export type ParLine = {
  id: string
  name: string
  reference: string
  unitSymbol: string
  unitId: string
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
  const [gesteEnCours, runGeste] = usePending()
  // Article en cours de modification ; null quand la modale est fermée.
  const [editing, setEditing] = React.useState<ParLine | null>(null)
  // Article dont on choisit l'unité.
  const [pickingUnit, setPickingUnit] = React.useState<ParLine | null>(null)
  // Article en cours de retrait, pour désactiver son bouton pendant l'appel.
  const [removing, setRemoving] = React.useState<string | null>(null)
  const router = useRouter()
  const { push } = useToast()
  const confirmer = useConfirm()

  const [search, setSearch] = React.useState('')
  const [activeCategory, setActiveCategory] = React.useState<string | null>(null)
  // État de l'enregistrement automatique, affiché en en-tête.
  const [sync, setSync] = React.useState<'repos' | 'attente' | 'envoi' | 'ok' | 'erreur'>('repos')

  // Valeurs éditées, indexées par article. On part des valeurs en base.
  const initial = React.useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, String(p.quantity)])),
    [products],
  )
  const [values, setValues] = React.useState<Record<string, string>>(initial)

  // Ce que la base contient, de notre point de vue. Mis à jour après chaque
  // envoi réussi pour ne pas réexpédier indéfiniment la même valeur.
  const enregistre = React.useRef<Record<string, string>>(initial)

  // Changer de département recharge la page : on repart des nouvelles valeurs.
  // `router.refresh()` rejoue aussi cet effet ; reprendre `initial` écraserait
  // alors la ligne en cours de frappe, d'où la comparaison avant remplacement.
  React.useEffect(() => {
    enregistre.current = initial
    setValues((courant) => {
      const memes = Object.keys(initial).length === Object.keys(courant).length
        && Object.keys(initial).every((k) => courant[k] !== undefined)
      return memes ? courant : initial
    })
  }, [initial])

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


  // Le numéro de ligne visible suit le filtre ; la position d'un article sur la
  // feuille, elle, est son rang dans la liste complète. Confondre les deux
  // déplacerait l'article au mauvais endroit dès qu'une famille est filtrée.
  const positionOf = React.useMemo(() => {
    const m = new Map<string, number>()
    products.forEach((p, i) => m.set(p.id, i + 1))
    return m
  }, [products])

  const dirty = React.useMemo(
    () => products.filter((p) => toNumber(values[p.id]) !== p.quantity),
    [products, values],
  )

  const configured = React.useMemo(
    () => products.filter((p) => toNumber(values[p.id]) > 0).length,
    [products, values],
  )

  const current = departments.find((d) => d.id === selectedId)

  /**
   * Retire un article de la feuille de CE département.
   *
   * L'article reste au catalogue et sur les feuilles des autres services : on
   * retire le sucre glace du Bar sans le faire disparaître de la Pâtisserie.
   * Son stock fixe pour ce département part avec lui, sans quoi il
   * réapparaîtrait avec une cible fantôme si on le remettait plus tard.
   */
  const retirer = async (p: ParLine) => {
    const cible = current?.name ?? 'ce département'
    const ok = await confirmer({
      title: 'Retirer l’article',
      confirmLabel: 'Retirer',
      message: (
        <>
          <p>
            Vous êtes sûr de supprimer l’article{' '}
            <strong className="text-fg">{p.name}</strong> de ce département —{' '}
            <strong className="text-fg">{cible}</strong> ?
          </p>
          <p className="mt-2 text-[0.82rem] text-fg-subtle">
            L’article reste au catalogue et sur les feuilles des autres départements.
            Son stock fixe pour {cible} sera effacé.
          </p>
        </>
      ),
    })
    if (!ok) return

    setRemoving(p.id)
    try {
      const r = await toggleDepartmentProduct(selectedId, Number(p.id), false)
      if (!r.ok) {
        push('error', r.error ?? 'Retrait impossible.')
        return
      }
      push('success', `« ${p.name} » retiré de ${cible}.`)
      router.refresh()
    } finally {
      setRemoving(null)
    }
  }

  const setValue = (id: string, raw: string) => {
    const v = raw.replace(',', '.')
    if (v !== '' && !/^\d*\.?\d*$/.test(v)) return
    setValues((s) => ({ ...s, [id]: v }))
    planifier()
  }

  /**
   * Enregistrement automatique, différé d'une seconde après la dernière frappe.
   *
   * Envoyer à chaque caractère produirait une écriture par chiffre tapé ; on
   * attend donc une pause. Seules les valeurs qui diffèrent de ce qui est en
   * base partent, et le rafraîchissement n'a lieu qu'après succès.
   */
  const enAttente = React.useRef<number | null>(null)

  // Les valeurs lues dans le minuteur doivent être les plus récentes, pas
  // celles capturées au moment où il a été armé.
  const valuesRef = React.useRef(values)
  React.useEffect(() => { valuesRef.current = values }, [values])

  const planifier = React.useCallback(() => {
    if (enAttente.current) window.clearTimeout(enAttente.current)
    setSync('attente')
    enAttente.current = window.setTimeout(async () => {
      const aEnvoyer = Object.entries(valuesRef.current)
        .filter(([id, v]) => v !== '' && v !== enregistre.current[id])
        .map(([id, v]) => ({ productId: id, quantity: toNumber(v) }))

      if (aEnvoyer.length === 0) return setSync('repos')

      setSync('envoi')
      try {
        await gql(SET_PAR, { departmentId: String(selectedId), lines: aEnvoyer })
        for (const l of aEnvoyer) enregistre.current[l.productId] = valuesRef.current[l.productId]
        setSync('ok')
        router.refresh()
      } catch (e) {
        setSync('erreur')
        push('error', errorMessage(e))
      }
    }, 1000)
  }, [selectedId, router, push])

  // Une saisie laissée en attente au moment de quitter serait perdue.
  React.useEffect(() => () => {
    if (enAttente.current) window.clearTimeout(enAttente.current)
  }, [])

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

      <GlassCard overflowVisible>
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
            {/* Plus de bouton : les valeurs partent seules. L'indicateur dit
                où en est l'envoi, sinon rien ne distinguerait « enregistré »
                de « pas encore parti ». */}
            <SyncStatus etat={sync} />
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
          <TableWrap minWidth="0">
            <thead>
              <tr>
                <Th className="w-8 px-1 text-right sm:w-10 sm:px-3">#</Th>
                <Th className="w-full px-1 sm:px-3">Article</Th>
                {/* L'unité suit la valeur qu'elle qualifie : « 24 u » se lit
                    d'un bloc, alors qu'une colonne séparée à gauche obligeait
                    à faire l'aller-retour. */}
                <Th className="w-[7rem] px-1 text-right sm:w-40 sm:px-3">Stock fixe</Th>
                <Th className="px-1 text-left sm:px-3">Unité</Th>
                <Th className="w-10 px-1 sm:px-3"><span className="sr-only">Modifier</span></Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
              {visible.map((p, i) => {
                const v = toNumber(values[p.id])
                const changed = v !== p.quantity
                const previous = i > 0 ? visible[i - 1] : null
                const next = visible[i + 1] ?? null
                const opensFamily = previous?.category.id !== p.category.id
                const closesFamily = next?.category.id !== p.category.id
                return (
                  <React.Fragment key={p.id}>
                    {opensFamily ? (
                      <tr>
                        <td
                          colSpan={5}
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
                      {/* Le rang affiché suit le filtre ; on édite la position
                          réelle sur la feuille, sinon filtrer une famille
                          déplacerait l'article au mauvais endroit. */}
                      <InlineEdit
                        value={String(positionOf.get(p.id) ?? i + 1)}
                        ariaLabel={`Position de ${p.name}`}
                        align="right"
                        className="tabular-nums"
                        inputClassName="w-12 text-[0.78rem]"
                        validate={(v) =>
                          /^\d+$/.test(v) && Number(v) >= 1 ? null : 'Nombre ≥ 1'
                        }
                        onSave={async (v) => {
                          const r = await moveProductInSheet(selectedId, Number(p.id), Number(v))
                          if (!r.ok) return r.error ?? 'Déplacement impossible.'
                          push('success', `« ${p.name} » déplacé en position ${v}.`)
                          router.refresh()
                        }}
                      />
                    </Td>
                    <Td className="max-w-0 px-1 sm:px-3">
                      <p className="text-[0.78rem] font-medium leading-snug text-fg sm:text-[0.85rem]">
                        <InlineEdit
                          value={p.name}
                          ariaLabel={`Nom de ${p.name}`}
                          inputClassName="text-[0.85rem]"
                          validate={(v) => (v.length >= 2 ? null : 'Nom trop court')}
                          onSave={async (v) => {
                            const r = await renameProduct(Number(p.id), v)
                            if (!r.ok) return r.error ?? 'Renommage impossible.'
                            push('success', 'Article renommé.')
                            router.refresh()
                          }}
                        />
                      </p>
                      <p className="truncate font-mono text-[0.68rem] text-fg-subtle sm:text-[0.7rem]">
                        {p.reference}
                      </p>
                    </Td>
                    <Td className="px-1 sm:px-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <input
                          inputMode="decimal"
                          value={values[p.id] ?? ''}
                          onChange={(e) => setValue(p.id, e.target.value)}
                          onFocus={(e) => {
                            // Un 0 qu'il faut effacer avant de taper est une
                            // gêne sur 109 lignes : le champ se vide au clic
                            // et retrouve son 0 si on le quitte sans saisir.
                            if (toNumber(values[p.id]) === 0) {
                              setValues((st) => ({ ...st, [p.id]: '' }))
                            }
                            e.currentTarget.select()
                          }}
                          onBlur={() => {
                            if ((values[p.id] ?? '') === '') {
                              setValues((st) => ({ ...st, [p.id]: String(p.quantity) }))
                            }
                          }}
                          placeholder="0"
                          aria-label={`Stock fixe pour ${p.name}`}
                          className="field h-9 w-16 px-1.5 py-0 text-right text-[0.8rem] tabular-nums sm:w-24 sm:px-3 sm:text-[0.85rem]"
                        />
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap px-1 text-left sm:px-3">
                      {/* L'unité se choisit dans une liste : un champ libre
                          laisserait écrire « kgs » et créerait des doublons
                          que les commandes traîneraient ensuite. */}
                      <button
                        type="button"
                        onClick={() => setPickingUnit(p)}
                        title={`Changer l’unité de ${p.name}`}
                        aria-label={`Unité de ${p.name} : ${p.unitSymbol} — cliquez pour changer`}
                        className="rounded-lg px-1.5 py-1 text-[0.75rem] font-medium text-fg-muted transition-colors hover:bg-accent/12 hover:text-accent sm:text-[0.86rem]"
                      >
                        {p.unitSymbol}
                      </button>
                    </Td>
                    <Td className="px-1 sm:px-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => setEditing(p)}
                          aria-label={`Modifier ${p.name}`}
                          className="grid size-8 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-accent/12 hover:text-accent"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={removing === p.id || gesteEnCours}
                          onClick={() => void runGeste(() => retirer(p))}
                          aria-label={`Retirer ${p.name} de la feuille`}
                          className="grid size-8 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-danger/12 hover:text-danger disabled:opacity-40"
                        >
                          {removing === p.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </button>
                      </div>
                    </Td>
                  </tr>
                  {/* Sous la dernière ligne de la famille : l'ajout d'article. */}
                  {closesFamily ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-1.5 sm:px-3">
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
        )}

   
      </GlassCard>
      {pickingUnit ? (
        <UnitPicker
          article={pickingUnit.name}
          currentUnitId={pickingUnit.unitId}
          units={units}
          onClose={() => setPickingUnit(null)}
          onPick={async (unitId) => {
            const r = await setProductUnit(Number(pickingUnit.id), Number(unitId))
            if (!r.ok) return r.error ?? 'Changement impossible.'
            push('success', 'Unité modifiée.')
            router.refresh()
          }}
        />
      ) : null}
      {editing ? (
        <EditProductModal
          product={{
            id: editing.id,
            name: editing.name,
            reference: editing.reference,
            categoryId: editing.category.id,
            unitId: editing.unitId,
            position: positionOf.get(editing.id) ?? 1,
          }}
          departmentId={selectedId}
          categories={allCategories}
          units={units}
          total={products.length}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            push('success', 'Article modifié.')
            router.refresh()
          }}
        />
      ) : null}
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

/** Où en est l'enregistrement automatique. */
function SyncStatus({ etat }: { etat: 'repos' | 'attente' | 'envoi' | 'ok' | 'erreur' }) {
  if (etat === 'repos') {
    return (
      <span className="flex items-center gap-1.5 text-[0.78rem] text-fg-subtle">
        <Check className="size-3.5" />
        À jour
      </span>
    )
  }
  if (etat === 'erreur') {
    return (
      <span role="alert" className="flex items-center gap-1.5 text-[0.78rem] font-semibold text-danger">
        <AlertCircle className="size-3.5" />
        Non enregistré
      </span>
    )
  }
  if (etat === 'ok') {
    return (
      <span className="flex items-center gap-1.5 text-[0.78rem] font-semibold text-ok">
        <Check className="size-3.5" />
        Enregistré
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-[0.78rem] font-medium text-accent">
      <Loader2 className="size-3.5 animate-spin" />
      {etat === 'envoi' ? 'Enregistrement…' : 'Modification…'}
    </span>
  )
}
