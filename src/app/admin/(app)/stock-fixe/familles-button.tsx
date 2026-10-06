'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { FolderTree, Search, Trash2, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/glass'
import { Modal } from '@/components/ui/modal'
import { InlineEdit } from '@/components/ui/inline-edit'
import { useConfirm } from '@/components/ui/confirm'
import { useToast } from '@/components/ui/toast'
import { errorMessage } from '@/lib/graphql-client'
import { correspond, normaliser } from '@/lib/search'
import { cn } from '@/lib/utils'
import { deleteFamily, renameFamily, toggleDepartmentCategory, type ActionResult } from '@/server/services/admin'
import type { FamilleDep, FamilleRef } from './famille-select'

/**
 * Toutes les familles du catalogue, en un seul endroit : leur nom, leurs
 * articles, et les départements qui les utilisent. Une pastille de
 * département s'allume ou s'éteint d'un geste — la famille entre sur la
 * feuille de ce département avec ses articles, ou en sort.
 */
export function FamillesButton({ categories, departments }: { categories: FamilleRef[]; departments: FamilleDep[] }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <FolderTree className="size-3.5" />
        Familles
      </Button>
      {open ? <FamillesPanel categories={categories} departments={departments} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function FamillesPanel({ categories, departments, onClose }: {
  categories: FamilleRef[]
  departments: FamilleDep[]
  onClose: () => void
}) {
  const router = useRouter()
  const { push } = useToast()
  const confirmer = useConfirm()
  const [recherche, setRecherche] = React.useState('')
  const [filtre, setFiltre] = React.useState<number | null>(null)
  const [enCours, setEnCours] = React.useState<string | null>(null)

  const mot = normaliser(recherche.trim())
  const visibles = categories.filter((c) =>
    (filtre === null || c.departements?.some((d) => d.id === filtre))
    && correspond(mot, c.name, (c.departements ?? []).map((d) => d.name).join(' ')))

  const geste = async (cle: string, fn: () => Promise<ActionResult>, succes: string) => {
    setEnCours(cle)
    try {
      const r = await fn()
      if (!r.ok) { push('error', r.error ?? 'Action impossible.'); return }
      push('success', succes)
      router.refresh()
    } catch (e) { push('error', errorMessage(e)) } finally { setEnCours(null) }
  }

  const basculer = async (f: FamilleRef, d: FamilleDep, lie: boolean) => {
    const n = f.articles ?? 0
    const ok = await confirmer(lie ? {
      title: `Retirer « ${f.name} » de ${d.name} ?`,
      message: `Ses articles quittent la feuille de ${d.name}, avec leur stock fixe. Ils restent au catalogue et sur les autres départements.`,
      confirmLabel: 'Retirer', tone: 'danger',
    } : {
      title: `Ajouter « ${f.name} » à ${d.name} ?`,
      message: `${n} article(s) de cette famille entrent sur la feuille de ${d.name}, à la fin. Vous réglerez ensuite leur stock fixe.`,
      confirmLabel: 'Ajouter',
    })
    if (!ok) return
    await geste(`${f.id}:${d.id}`, () => toggleDepartmentCategory(d.id, Number(f.id), !lie),
      lie ? `« ${f.name} » retirée de ${d.name}.` : `« ${f.name} » ajoutée à ${d.name}.`)
  }

  const supprimer = async (f: FamilleRef) => {
    const n = f.articles ?? 0
    const deps = (f.departements ?? []).map((d) => d.name).join(', ')
    const ok = await confirmer({
      title: `Supprimer la famille « ${f.name} » ?`,
      message: n > 0
        ? `Ses ${n} article(s) sont supprimés avec elle et quittent toutes les feuilles${deps ? ` (${deps})` : ''}. Ceux qui ont déjà été commandés sont seulement désactivés : les anciens bons restent lisibles.`
        : 'Elle disparaît du catalogue et de tous les départements.',
      confirmLabel: n > 0 ? `Supprimer avec ${n} article(s)` : 'Supprimer', tone: 'danger',
    })
    if (!ok) return
    await geste(`${f.id}:x`, () => deleteFamily(Number(f.id), n > 0), `Famille « ${f.name} » supprimée.`)
  }

  return (
    <Modal title="Familles" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher une famille ou un département…"
            aria-label="Rechercher une famille"
            className="field h-11 w-full pl-9"
          />
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <button type="button" onClick={() => setFiltre(null)}
            className={cn('shrink-0 rounded-full border px-3 py-1.5 text-[0.78rem] font-medium transition-colors',
              filtre === null ? 'border-accent/40 bg-accent/12 text-accent' : 'border-[rgb(var(--glass-edge)/0.28)] text-fg-muted hover:bg-[rgb(var(--glass-edge)/0.14)]')}>
            Toutes ({categories.length})
          </button>
          {departments.map((d) => (
            <button key={d.id} type="button" onClick={() => setFiltre(filtre === d.id ? null : d.id)}
              className={cn('flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.78rem] font-medium transition-colors',
                filtre === d.id ? 'border-transparent text-white' : 'border-[rgb(var(--glass-edge)/0.28)] text-fg-muted hover:bg-[rgb(var(--glass-edge)/0.14)]')}
              style={filtre === d.id ? { backgroundColor: d.color } : undefined}>
              {filtre === d.id ? null : <span className="size-2 rounded-full" style={{ backgroundColor: d.color }} />}
              {d.name}
            </button>
          ))}
        </div>

        <ul className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
          {visibles.length === 0 ? (
            <li className="py-8 text-center text-[0.85rem] text-fg-muted">Aucune famille.</li>
          ) : visibles.map((f) => {
            const liees = new Set((f.departements ?? []).map((d) => d.id))
            return (
              <li key={f.id} className="rounded-2xl border border-[rgb(var(--glass-edge)/0.22)] bg-white/60 p-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.92rem] font-semibold text-fg">
                      <InlineEdit
                        value={f.name}
                        ariaLabel={`Renommer la famille ${f.name}`}
                        validate={(v) => (v.trim().length >= 2 ? null : 'Nom trop court')}
                        onSave={async (v) => {
                          const r = await renameFamily(Number(f.id), v)
                          if (!r.ok) return r.error ?? 'Renommage impossible.'
                          push('success', 'Famille renommée.')
                          router.refresh()
                        }}
                      />
                    </p>
                    <p className="text-[0.74rem] text-fg-subtle">
                      {f.articles ?? 0} article(s) · {liees.size} département(s)
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Supprimer la famille ${f.name}`}
                    title="Supprimer la famille"
                    disabled={enCours !== null}
                    onClick={() => void supprimer(f)}
                    className="grid size-9 shrink-0 place-items-center rounded-xl text-fg-subtle transition-colors hover:bg-danger/12 hover:text-danger disabled:opacity-40"
                  >
                    {enCours === `${f.id}:x` ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {departments.map((d) => {
                    const lie = liees.has(d.id)
                    const cle = `${f.id}:${d.id}`
                    return (
                      <button
                        key={d.id}
                        type="button"
                        aria-pressed={lie}
                        disabled={enCours !== null}
                        onClick={() => void basculer(f, d, lie)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.74rem] font-medium transition-all disabled:opacity-50',
                          lie ? 'border-transparent text-white shadow-sm' : 'border-dashed border-[rgb(var(--glass-edge)/0.4)] text-fg-subtle hover:border-solid hover:text-fg',
                        )}
                        style={lie ? { backgroundColor: d.color } : undefined}
                      >
                        {enCours === cle ? <Loader2 className="size-3 animate-spin" /> : lie ? <Check className="size-3" /> : <span className="size-1.5 rounded-full" style={{ backgroundColor: d.color }} />}
                        {d.name}
                      </button>
                    )
                  })}
                </div>
              </li>
            )
          })}
        </ul>
        <p className="text-[0.74rem] text-fg-subtle">
          Touchez un département pour y ajouter la famille avec ses articles, ou l’en retirer. Le nom d’une famille est le même pour tous les départements.
        </p>
      </div>
    </Modal>
  )
}
