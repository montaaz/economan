'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Search, PackageSearch, Target, Plus, AlertCircle, Pencil, Trash2, Check, Loader2, ChevronUp, ChevronDown, CircleCheck, Power } from 'lucide-react'
import { GlassCard, Button, EmptyState, TableWrap, Th, Td, usePending } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { useToast } from '@/components/ui/toast'
import { Modal } from '@/components/ui/modal'
import { Field } from '@/components/ui/glass'
import { gql, errorMessage } from '@/lib/graphql-client'
import {
  createProductForDepartment, renameProductInDepartment, moveProductInSheet, setProductUnit,
  toggleDepartmentProduct, moveFamilyInSheet, removeFamilyFromSheet, renameFamily, activateStockFixe, type ActionResult,
} from '@/server/services/admin'
import { InlineEdit } from '@/components/ui/inline-edit'
import { useConfirm } from '@/components/ui/confirm'
import { UnitPicker } from './unit-picker'
import { EditProductModal } from './edit-product-modal'
import { FamilleSelect, type FamilleRef } from './famille-select'
import { cn, toNumber } from '@/lib/utils'

type Dept = { id: number; name: string; code: string; color: string; icon: string | null }

export type ParLine = {
  id: string
  name: string
  /** Le nom du catalogue, quand ce département en a un propre. */
  catalogueName?: string | null
  reference: string
  unitSymbol: string
  unitId: string
  category: { id: string; name: string; icon: string | null }
  quantity: number
  /** Le stock fixe de l'article dans chacun des trois jeux. */
  sets?: Record<1 | 2 | 3, number>
}

const JEUX = [1, 2, 3] as const

/** Chaque jeu de stock fixe a sa couleur, des cartes du haut aux colonnes du tableau. */
const COULEURS_JEU: Record<number, { from: string; to: string; ink: string; soft: string }> = {
  1: { from: '#3b82f6', to: '#1d4ed8', ink: '#1d4ed8', soft: '#eff6ff' },
  2: { from: '#8b5cf6', to: '#6d28d9', ink: '#6d28d9', soft: '#f5f3ff' },
  3: { from: '#f59e0b', to: '#c2410c', ink: '#b45309', soft: '#fffbeb' },
}

/** La clé d'une valeur saisie : le jeu, puis l'article. */
const cleJeu = (jeu: number, id: string) => `${jeu}:${id}`

const SET_PAR = /* GraphQL */ `
  mutation SetPar($departmentId: ID!, $lines: [StockFixeInput!]!, $slot: Int) {
    setStockFixe(departmentId: $departmentId, lines: $lines, slot: $slot)
  }
`

type Ref = { id: string; name: string }

export function StockFixeEditor({
  departments, selectedId, products, categories: allCategories, units, jeuActif = 1, jeuVu = 1,
}: {
  departments: Dept[]
  selectedId: number
  /** Le jeu de stock fixe en service pour ce département (1, 2, 3). */
  jeuActif?: number
  /** Le jeu affiché et modifié ici. */
  jeuVu?: number
  products: ParLine[]
  categories: FamilleRef[]
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

  // Valeurs éditées, indexées par jeu et par article (« 2:1234 ») : les trois
  // jeux se règlent côte à côte. On part des valeurs en base.
  const initial = React.useMemo(
    () => Object.fromEntries(products.flatMap((p) => JEUX.map((j) => [
      cleJeu(j, p.id), String(p.sets?.[j] ?? (j === jeuVu ? p.quantity : 0)),
    ]))),
    [products, jeuVu],
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

  const configured = React.useMemo(
    () => products.filter((p) => toNumber(values[cleJeu(jeuVu, p.id)]) > 0).length,
    [products, values, jeuVu],
  )

  const current = departments.find((d) => d.id === selectedId)

  // Les familles de la feuille, dans leur ordre : ▲ ▼ les déplacent.
  const ordreFamilles = React.useMemo(() => {
    const vues: string[] = []
    for (const p of products) if (!vues.includes(p.category.id)) vues.push(p.category.id)
    return vues
  }, [products])
  const [familleEnCours, setFamilleEnCours] = React.useState<string | null>(null)
  const geste = async (famille: { id: string; name: string }, fn: () => Promise<ActionResult>, succes: string) => {
    setFamilleEnCours(famille.id)
    try {
      const r = await fn()
      if (!r.ok) { push('error', r.error ?? 'Action impossible.'); return }
      push('success', succes)
      router.refresh()
    } catch (e) { push('error', errorMessage(e)) } finally { setFamilleEnCours(null) }
  }
  const retirerFamille = async (famille: { id: string; name: string }, nombre: number) => {
    const ok = await confirmer({
      title: `Retirer « ${famille.name} » de ${current?.name ?? 'ce département'} ?`,
      message: `Ses ${nombre} article(s) quittent la feuille de ${current?.name ?? 'ce département'}, avec leur stock fixe. Ils restent au catalogue et sur les feuilles des autres départements.`,
      confirmLabel: 'Retirer la famille', tone: 'danger',
    })
    if (!ok) return
    await geste(famille, () => removeFamilyFromSheet(selectedId, Number(famille.id)), `Famille « ${famille.name} » retirée de ${current?.name ?? 'ce département'}.`)
  }

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

  const setValue = (cle: string, raw: string) => {
    const v = raw.replace(',', '.')
    if (v !== '' && !/^\d*\.?\d*$/.test(v)) return
    setValues((s) => ({ ...s, [cle]: v }))
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
      // Ce qui a changé, jeu par jeu : un envoi par jeu touché.
      const changes = Object.entries(valuesRef.current)
        .filter(([cle, v]) => v !== '' && v !== enregistre.current[cle])
      if (changes.length === 0) return setSync('repos')
      const parJeu = new Map<number, { productId: string; quantity: number }[]>()
      for (const [cle, v] of changes) {
        const [jeu, id] = cle.split(':')
        const l = parJeu.get(Number(jeu)) ?? []
        l.push({ productId: id, quantity: toNumber(v) })
        parJeu.set(Number(jeu), l)
      }

      setSync('envoi')
      try {
        for (const [jeu, lines] of parJeu) {
          await gql(SET_PAR, { departmentId: String(selectedId), lines, slot: jeu })
        }
        for (const [cle] of changes) enregistre.current[cle] = valuesRef.current[cle]
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

      <JeuxStockFixe departmentId={selectedId} departmentName={current?.name ?? ''} actif={jeuActif} vu={jeuVu} />

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
                {/* Les trois jeux côte à côte. Le titre est un bouton : il
                    choisit le jeu, comme les cartes du haut. */}
                {JEUX.map((j) => {
                  const c = COULEURS_JEU[j]
                  return (
                    <Th key={j} className="px-0.5 text-center sm:px-1.5">
                      <button
                        type="button"
                        onClick={() => router.push(`?dep=${selectedId}&jeu=${j}`)}
                        aria-pressed={j === jeuVu}
                        title={j === jeuActif ? `Stock fixe ${j} — en service` : `Stock fixe ${j} — en réserve`}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-1.5 py-1 text-[0.68rem] font-bold uppercase tracking-wide transition-colors sm:px-2.5 sm:text-[0.72rem]"
                        style={j === jeuVu
                          ? { background: `linear-gradient(135deg, ${c.from}, ${c.to})`, color: '#fff' }
                          : { background: c.soft, color: c.ink }}
                      >
                        {j === jeuActif ? <span className="size-1.5 rounded-full bg-ok ring-2 ring-white/70" /> : null}
                        <span className="hidden sm:inline">Stock fixe</span>
                        <span className="sm:hidden">SF</span> {j}
                      </button>
                    </Th>
                  )
                })}
                <Th className="px-1 text-left sm:px-3">Unité</Th>
                <Th className="w-10 px-1 sm:px-3"><span className="sr-only">Modifier</span></Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
              {visible.map((p, i) => {
                const v = toNumber(values[cleJeu(jeuVu, p.id)])
                const changed = v !== p.quantity
                const previous = i > 0 ? visible[i - 1] : null
                const next = visible[i + 1] ?? null
                const opensFamily = previous?.category.id !== p.category.id
                const closesFamily = next?.category.id !== p.category.id
                return (
                  <React.Fragment key={p.id}>
                    {opensFamily ? (() => {
                      const rang = ordreFamilles.indexOf(p.category.id)
                      const nombre = products.filter((x) => x.category.id === p.category.id).length
                      // Sous un filtre, l'ordre affiché n'est plus celui de la feuille : on ne déplace pas.
                      const filtre = search.trim() !== '' || activeCategory !== null
                      const occupe = familleEnCours === p.category.id
                      const btn = 'grid size-7 place-items-center rounded-md text-ok transition-colors hover:bg-ok/15 disabled:pointer-events-none disabled:opacity-30'
                      return (
                        <tr>
                          <td
                            colSpan={7}
                            className="bg-ok/12 px-2 py-1 text-[0.72rem] font-bold uppercase tracking-[0.06em] text-ok sm:px-3 sm:text-[0.76rem]"
                          >
                            <span className="flex items-center gap-1.5">
                              {p.category.icon ? (
                                <Icon name={p.category.icon} className="size-3.5 shrink-0" />
                              ) : null}
                              <span className="min-w-0 flex-1">
                                <InlineEdit
                                  value={p.category.name}
                                  ariaLabel={`Renommer la famille ${p.category.name}`}
                                  inputClassName="text-[0.78rem] uppercase"
                                  validate={(v) => (v.trim().length >= 2 ? null : 'Nom trop court')}
                                  onSave={async (v) => {
                                    const r = await renameFamily(Number(p.category.id), v)
                                    if (!r.ok) return r.error ?? 'Renommage impossible.'
                                    push('success', `Famille renommée : ${v.trim().toUpperCase()} (pour tous les départements).`)
                                    router.refresh()
                                  }}
                                />
                                <span className="ml-1.5 font-semibold normal-case tracking-normal opacity-70">({nombre})</span>
                              </span>
                              {occupe ? <Loader2 className="size-4 animate-spin" /> : null}
                              <button type="button" className={btn} disabled={filtre || rang <= 0 || occupe}
                                title={filtre ? 'Effacez la recherche et le filtre pour déplacer' : 'Monter la famille'} aria-label={`Monter la famille ${p.category.name}`}
                                onClick={() => void geste(p.category, () => moveFamilyInSheet(selectedId, Number(p.category.id), 'haut'), `« ${p.category.name} » montée.`)}>
                                <ChevronUp className="size-4" />
                              </button>
                              <button type="button" className={btn} disabled={filtre || rang === ordreFamilles.length - 1 || occupe}
                                title={filtre ? 'Effacez la recherche et le filtre pour déplacer' : 'Descendre la famille'} aria-label={`Descendre la famille ${p.category.name}`}
                                onClick={() => void geste(p.category, () => moveFamilyInSheet(selectedId, Number(p.category.id), 'bas'), `« ${p.category.name} » descendue.`)}>
                                <ChevronDown className="size-4" />
                              </button>
                              <button type="button" className={cn(btn, 'text-danger hover:bg-danger/12')} disabled={occupe}
                                title={`Retirer la famille de ${current?.name ?? 'ce département'}`} aria-label={`Retirer la famille ${p.category.name}`}
                                onClick={() => void retirerFamille(p.category, nombre)}>
                                <Trash2 className="size-3.5" />
                              </button>
                            </span>
                          </td>
                        </tr>
                      )
                    })() : null}
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
                            const r = await renameProductInDepartment(selectedId, Number(p.id), v)
                            if (!r.ok) return r.error ?? 'Renommage impossible.'
                            push('success', `Article renommé pour ${current?.name ?? 'ce département'}.`)
                            router.refresh()
                          }}
                        />
                      </p>
                      <p className="truncate font-mono text-[0.68rem] text-fg-subtle sm:text-[0.7rem]">
                        {p.reference}
                        {p.catalogueName ? (
                          <span className="ml-1.5 font-sans" title="Nom du catalogue et des autres départements">
                            · catalogue : {p.catalogueName}
                          </span>
                        ) : null}
                      </p>
                    </Td>
                    {JEUX.map((j) => {
                      const cle = cleJeu(j, p.id)
                      const c = COULEURS_JEU[j]
                      const enBase = String(p.sets?.[j] ?? (j === jeuVu ? p.quantity : 0))
                      return (
                        <Td key={j} className="px-0.5 sm:px-1.5" style={j === jeuVu ? { background: `${c.from}0d` } : undefined}>
                          <div className="flex items-center justify-center">
                            <input
                              inputMode="decimal"
                              value={values[cle] ?? ''}
                              onChange={(e) => setValue(cle, e.target.value)}
                              onFocus={(e) => {
                                // Un 0 qu'il faut effacer avant de taper est une
                                // gêne sur 109 lignes : le champ se vide au clic
                                // et retrouve son 0 si on le quitte sans saisir.
                                if (toNumber(values[cle]) === 0) {
                                  setValues((st) => ({ ...st, [cle]: '' }))
                                }
                                e.currentTarget.select()
                              }}
                              onBlur={() => {
                                if ((values[cle] ?? '') === '') {
                                  setValues((st) => ({ ...st, [cle]: enBase }))
                                }
                              }}
                              placeholder="0"
                              aria-label={`Stock fixe ${j} pour ${p.name}`}
                              className="field h-9 w-14 px-1 py-0 text-right text-[0.8rem] tabular-nums sm:w-20 sm:px-2.5 sm:text-[0.85rem]"
                              style={j === jeuVu ? { borderColor: `${c.from}80`, fontWeight: 700, color: c.ink } : undefined}
                            />
                          </div>
                        </Td>
                      )
                    })}
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
                      <td colSpan={7} className="px-2 py-1.5 sm:px-3">
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
          departmentName={current?.name ?? ''}
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
  categories: FamilleRef[]
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
          <FamilleSelect id="p-cat" name="categoryId" defaultValue={family.id} categories={categories}
            departmentId={departmentId} departmentName={departmentName} />
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

/**
 * Les trois jeux de stock fixe d'un département.
 *
 * On regarde et on règle n'importe lequel ; un seul est en service. Mettre
 * un autre jeu en service change tout de suite ce que le département
 * commande — les commandes déjà passées gardent leur stock fixe.
 */
function JeuxStockFixe({ departmentId, departmentName, actif, vu }: {
  departmentId: number
  departmentName: string
  actif: number
  vu: number
}) {
  const router = useRouter()
  const { push } = useToast()
  const confirmer = useConfirm()
  const [enCours, setEnCours] = React.useState(false)
  const lien = (jeu: number) => `?dep=${departmentId}&jeu=${jeu}`

  const activer = async () => {
    const ok = await confirmer({
      title: `Mettre en service le stock fixe ${vu} ?`,
      message: `${departmentName} commandera dès maintenant avec le stock fixe ${vu} (au lieu du ${actif}). Les commandes déjà passées ne changent pas, et le stock fixe ${actif} reste enregistré : vous pourrez y revenir à tout moment.`,
      confirmLabel: `Mettre en service le stock fixe ${vu}`,
    })
    if (!ok) return
    setEnCours(true)
    try {
      const r = await activateStockFixe(departmentId, vu)
      if (!r.ok) { push('error', r.error ?? 'Bascule impossible.'); return }
      push('success', `${departmentName} commande maintenant avec le stock fixe ${vu}.`)
      router.refresh()
    } catch (e) { push('error', errorMessage(e)) } finally { setEnCours(false) }
  }

  const COULEURS = COULEURS_JEU
  const cv = COULEURS[vu]

  return (
    <div className="mb-4 space-y-2.5">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[1, 2, 3].map((j) => {
          const c = COULEURS[j]
          const enService = j === actif
          const choisi = j === vu
          return (
            <button
              key={j}
              type="button"
              onClick={() => router.push(lien(j))}
              aria-pressed={choisi}
              className={cn(
                'relative flex flex-col items-start gap-1 overflow-hidden rounded-2xl border-2 px-3 py-2.5 text-left transition-[transform,box-shadow] hover:-translate-y-0.5 sm:px-4 sm:py-3',
                enService ? 'border-transparent text-white' : 'bg-white/80',
                choisi ? 'shadow-[0_14px_30px_-14px_rgb(15_23_42/0.55)]' : 'shadow-sm',
              )}
              style={enService
                ? { background: `linear-gradient(135deg, ${c.from}, ${c.to})`, boxShadow: choisi ? `0 0 0 3px ${c.from}55, 0 14px 30px -14px ${c.to}` : undefined }
                : { borderColor: choisi ? c.from : `${c.from}40`, background: choisi ? c.soft : undefined }}
            >
              {enService ? <CircleCheck className="absolute right-2.5 top-2.5 size-4 text-white" /> : null}
              <span className={cn('whitespace-nowrap text-[0.62rem] font-bold uppercase tracking-[0.08em] sm:text-[0.7rem] sm:tracking-[0.1em]', enService ? 'text-white/80' : '')} style={enService ? undefined : { color: c.ink }}>
                Stock fixe
              </span>
              <span className={cn('text-[1.6rem] font-extrabold leading-none sm:text-[1.9rem]', enService ? 'text-white' : '')} style={enService ? undefined : { color: c.ink }}>
                {j}
              </span>
              <span
                className={cn('mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide sm:text-[0.66rem]',
                  enService ? 'bg-white/25 text-white' : 'bg-[rgb(var(--glass-edge)/0.14)] text-fg-subtle')}
              >
                {enService ? 'En service' : 'En réserve'}
              </span>
            </button>
          )
        })}
      </div>
      {vu === actif ? (
        <p className="flex items-center gap-2 rounded-xl px-3 py-2 text-[0.82rem] font-medium" style={{ background: cv.soft, color: cv.ink }}>
          <CircleCheck className="size-4 shrink-0" />
          {departmentName} commande avec le stock fixe {vu}. Les modifications s’appliquent aux prochaines commandes.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5 rounded-xl border border-warn/35 bg-warn/[0.08] px-3 py-2.5 sm:flex-row sm:items-center">
          <p className="min-w-0 text-[0.82rem] font-medium text-warn sm:flex-1">
            Stock fixe {vu} en réserve : vos réglages ici ne changent rien tant qu’il n’est pas en service. {departmentName} commande avec le stock fixe {actif}.
          </p>
          <button
            type="button"
            disabled={enCours}
            onClick={() => void activer()}
            className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-[0.86rem] font-bold text-white shadow-md transition-[filter] hover:brightness-110 disabled:opacity-60 sm:w-auto"
            style={{ background: `linear-gradient(135deg, ${cv.from}, ${cv.to})` }}
          >
            {enCours ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" />}
            Mettre en service le stock fixe {vu}
          </button>
        </div>
      )}
    </div>
  )
}

