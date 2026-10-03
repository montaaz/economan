'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { Loader2, ChevronDown, ChevronRight, Link2, Check, AlertTriangle, Scissors, Plus, Trash2, Search, RotateCcw, X } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { ComboSelect } from '@/components/ui/combo-select'
import { useConfirm } from '@/components/ui/confirm'
import { GlassCard, Button, Badge, EmptyState, TableWrap, Th, Td } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { SearchField } from '@/components/ui/search-field'
import { useToast } from '@/components/ui/toast'
import { gql, errorMessage } from '@/lib/graphql-client'
import { correspond, normaliser } from '@/lib/search'
import { cn, formatQty, toNumber } from '@/lib/utils'

const QUERY = /* GraphQL */ `
  query Fiches {
    recipes {
      id name kind source unmatchedCount
      department { id name color icon }
      salesItem { id name family { name } }
      lines { id label quantity unit cost product { id name baseUnit { symbol } } subRecipe { id name } }
    }
    stockProducts { id name reference baseUnit { symbol } }
    salesCard(includeInactive: true) { id name items { id name } }
    departments { id name color icon }
  }
`
const CREATE = /* GraphQL */ `
  mutation CreateRecipe($name: String!, $departmentId: ID!, $kind: RecipeKind!, $salesItemId: ID, $createItemInFamilyId: ID) {
    createRecipe(name: $name, departmentId: $departmentId, kind: $kind, salesItemId: $salesItemId, createItemInFamilyId: $createItemInFamilyId) { id }
  }
`
const DELETE_RECIPE = /* GraphQL */ `mutation DeleteRecipe($id: ID!) { deleteRecipe(id: $id) }`
const ADD_LINE = /* GraphQL */ `
  mutation AddRecipeLine($recipeId: ID!, $label: String!, $quantity: Float!, $unit: String!, $productId: ID, $subRecipeId: ID) {
    addRecipeLine(recipeId: $recipeId, label: $label, quantity: $quantity, unit: $unit, productId: $productId, subRecipeId: $subRecipeId)
  }
`
const DELETE_LINE = /* GraphQL */ `mutation DeleteRecipeLine($id: ID!) { deleteRecipeLine(id: $id) }`
const UPDATE_LINE = /* GraphQL */ `
  mutation UpdateRecipeLine($id: ID!, $productId: ID, $subRecipeId: ID, $quantity: Float!, $unit: String!) {
    updateRecipeLine(id: $id, productId: $productId, subRecipeId: $subRecipeId, quantity: $quantity, unit: $unit)
  }
`
const LINK_ITEM = /* GraphQL */ `
  mutation LinkRecipeItem($recipeId: ID!, $salesItemId: ID) { linkRecipeItem(recipeId: $recipeId, salesItemId: $salesItemId) }
`

type Ligne = { id: string; label: string; quantity: number; unit: string; cost: number | null; product: { id: string; name: string; baseUnit: { symbol: string } } | null; subRecipe: { id: string; name: string } | null }
type Fiche = { id: string; name: string; kind: 'PLAT' | 'PREPARATION'; source: string | null; unmatchedCount: number; department: { id: string; name: string; color: string; icon: string | null }; salesItem: { id: string; name: string; family: { name: string } } | null; lines: Ligne[] }
type Produit = { id: string; name: string; reference: string; baseUnit: { symbol: string } }
type Dept = { id: string; name: string; color: string; icon: string | null }
type Data = { recipes: Fiche[]; stockProducts: Produit[]; salesCard: { id: string; name: string; items: { id: string; name: string }[] }[]; departments: Dept[] }

/**
 * Les fiches techniques, à relire et corriger.
 *
 * L'import rapproche ce qu'il peut ; le reste se règle ici : quel article du
 * stock se cache derrière « parmison », quelle préparation derrière « pate »,
 * combien par portion, et quel plat de la carte la fiche sert. Tant qu'une
 * ligne n'est pas rapprochée, le contrôle des stocks ne la compte pas — la
 * fiche le dit en orange.
 */
export function Fiches() {
  const [data, setData] = React.useState<Data | null>(null)
  const [erreur, setErreur] = React.useState<string | null>(null)
  // Arrivé depuis le contrôle des stocks avec un plat en tête (« ?q=… ») :
  // la recherche s'ouvre dessus, pour écrire sa fiche sans le chercher.
  const [recherche, setRecherche] = React.useState('')
  // Un plat de la carte sans fiche (« &plat=…&dep=… ») : sa fiche s'ouvre à
  // écrire, déjà nommée, au bon service et reliée au plat.
  const [aEcrire, setAEcrire] = React.useState<{ nom: string; dep: string; item: string } | null>(null)
  React.useEffect(() => {
    const u = new URLSearchParams(window.location.search)
    const q = u.get('q')
    if (q) setRecherche(q)
    const plat = u.get('plat'), dep = u.get('dep')
    if (q && plat && dep) setAEcrire({ nom: q, dep, item: plat })
  }, [])
  const [dep, setDep] = React.useState<string | null>(null)
  const [vue, setVue] = React.useState<'tous' | 'incompletes' | 'sans-carte'>('tous')
  const [ouvertes, setOuvertes] = React.useState<Set<string>>(new Set())
  const [version, setVersion] = React.useState(0)
  const [nouvelle, setNouvelle] = React.useState(false)

  React.useEffect(() => {
    let vivant = true
    gql<Data>(QUERY).then((d) => { if (vivant) setData(d) }).catch((e) => { if (vivant) setErreur(errorMessage(e)) })
    return () => { vivant = false }
  }, [version])

  const mot = normaliser(recherche)
  const fiches = (data?.recipes ?? []).filter((f) =>
    (dep === null || f.department.id === dep)
    && (vue !== 'incompletes' || f.unmatchedCount > 0)
    && (vue !== 'sans-carte' || (f.kind === 'PLAT' && !f.salesItem))
    && correspond(mot, f.name, f.salesItem?.name, ...f.lines.map((l) => l.label)))
  const departements = [...new Map((data?.recipes ?? []).map((f) => [f.department.id, f.department])).values()]
  const incompletes = (data?.recipes ?? []).filter((f) => f.unmatchedCount > 0).length
  const sansCarte = (data?.recipes ?? []).filter((f) => f.kind === 'PLAT' && !f.salesItem).length
  const basculer = (id: string) => setOuvertes((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <GlassCard className="p-4"><p className="text-[0.74rem] font-semibold uppercase tracking-wide text-fg-muted">Fiches</p><p className="mt-1 text-[1.5rem] font-bold tabular-nums text-fg">{data?.recipes.length ?? '…'}</p><p className="text-[0.78rem] text-fg-muted">plats et préparations importés</p></GlassCard>
        <button type="button" onClick={() => setVue(vue === 'incompletes' ? 'tous' : 'incompletes')} className="text-left"><GlassCard className={cn('h-full p-4', incompletes > 0 && 'border-warn/40', vue === 'incompletes' && 'ring-2 ring-warn/40')}><p className="text-[0.74rem] font-semibold uppercase tracking-wide text-fg-muted">À rapprocher</p><p className={cn('mt-1 text-[1.5rem] font-bold tabular-nums', incompletes > 0 ? 'text-warn' : 'text-fg')}>{data ? incompletes : '…'}</p><p className="text-[0.78rem] text-fg-muted">fiches avec un ingrédient sans article</p></GlassCard></button>
        <button type="button" onClick={() => setVue(vue === 'sans-carte' ? 'tous' : 'sans-carte')} className="text-left"><GlassCard className={cn('h-full p-4', vue === 'sans-carte' && 'ring-2 ring-accent/40')}><p className="text-[0.74rem] font-semibold uppercase tracking-wide text-fg-muted">Sans plat de carte</p><p className="mt-1 text-[1.5rem] font-bold tabular-nums text-fg">{data ? sansCarte : '…'}</p><p className="text-[0.78rem] text-fg-muted">le Z ne peut pas les consommer</p></GlassCard></button>
      </div>

      <GlassCard overflowVisible>
        <div className="flex flex-wrap items-center gap-2 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
          <SearchField value={recherche} onChange={setRecherche} placeholder="Rechercher une fiche ou un ingrédient…" className="min-w-0 flex-1 basis-56 sm:max-w-md" />
          <Button variant="primary" size="sm" onClick={() => setNouvelle(true)} disabled={!data}>
            <Plus className="size-3.5" />
            Nouvelle fiche
          </Button>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setDep(null)} className={cn('h-9 rounded-full border px-3 text-[0.8rem] font-semibold', dep === null ? 'border-accent/40 bg-accent/12 text-accent' : 'border-[rgb(var(--glass-edge)/0.34)] bg-white/65 text-fg-muted')}>Tous</button>
            {departements.map((d) => (
              <button key={d.id} type="button" onClick={() => setDep(dep === d.id ? null : d.id)} className={cn('inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[0.8rem] font-semibold', dep === d.id ? 'text-white' : 'border-[rgb(var(--glass-edge)/0.34)] bg-white/65 text-fg-muted')} style={dep === d.id ? { background: d.color, borderColor: d.color } : undefined}>
                <Icon name={d.icon ?? 'Building2'} className="size-3.5" />{d.name}
              </button>
            ))}
          </div>
        </div>
        {erreur ? <p role="alert" className="px-4 py-4 text-[0.85rem] font-medium text-danger">{erreur}</p>
          : data === null ? <p className="flex items-center gap-2 px-4 py-6 text-[0.85rem] text-fg-muted"><Loader2 className="size-4 animate-spin" /> Chargement…</p>
          : fiches.length === 0 ? <EmptyState icon={<Scissors className="size-6" />} title="Aucune fiche" description="Aucune fiche ne correspond à ce filtre." />
          : (
            <ul className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
              {fiches.map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => basculer(f.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[rgb(var(--glass-edge)/0.08)] sm:px-5">
                    {ouvertes.has(f.id) ? <ChevronDown className="size-4 shrink-0 text-fg-subtle" /> : <ChevronRight className="size-4 shrink-0 text-fg-subtle" />}
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg text-white" style={{ background: f.department.color }}><Icon name={f.department.icon ?? 'Building2'} className="size-3.5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9rem] font-semibold text-fg">{f.name}</span>
                      <span className="block truncate text-[0.72rem] text-fg-muted">{f.lines.length} ingrédient{f.lines.length > 1 ? 's' : ''}{f.salesItem ? ` · carte : ${f.salesItem.name} (${f.salesItem.family.name})` : f.kind === 'PLAT' ? ' · pas de plat de carte relié' : ''}</span>
                    </span>
                    <Badge tone={f.kind === 'PLAT' ? 'accent' : 'neutral'}>{f.kind === 'PLAT' ? 'Plat' : 'Préparation'}</Badge>
                    {f.unmatchedCount > 0 ? <Badge tone="warn"><AlertTriangle className="size-3" /> {f.unmatchedCount} à rapprocher</Badge> : <Badge tone="ok"><Check className="size-3" /> complète</Badge>}
                  </button>
                  {ouvertes.has(f.id) ? <FicheDetail fiche={f} produits={data.stockProducts} preparations={data.recipes.filter((r) => r.kind === 'PREPARATION' && r.department.id === f.department.id && r.id !== f.id)} carte={data.salesCard} onChange={() => setVersion((v) => v + 1)} /> : null}
                </li>
              ))}
            </ul>
          )}
      </GlassCard>
      {(nouvelle || aEcrire) && data ? (
        <NouvelleFiche departements={data.departments} carte={data.salesCard} initial={nouvelle ? null : aEcrire}
          onClose={() => { setNouvelle(false); setAEcrire(null) }}
          onDone={(id) => { setNouvelle(false); setAEcrire(null); setRecherche(''); setOuvertes((s) => new Set(s).add(id)); setVersion((v) => v + 1) }} />
      ) : null}
    </div>
  )
}

/** Une fiche de plus : son nom, son service, plat ou préparation, et le plat de carte qui va avec. */
function NouvelleFiche({ departements, carte, initial, onClose, onDone }: {
  departements: Dept[]; carte: Data['salesCard']
  /** Un plat de la carte dont on écrit la fiche : déjà nommé, servi et relié. */
  initial?: { nom: string; dep: string; item: string } | null
  onClose: () => void; onDone: (id: string) => void
}) {
  const { push } = useToast()
  const connu = !!initial && carte.some((f) => f.items.some((i) => i.id === initial.item))
  const [nom, setNom] = React.useState(initial?.nom ?? '')
  const [dep, setDep] = React.useState(initial && departements.some((d) => d.id === initial.dep) ? initial.dep : departements[0]?.id ?? '')
  const [kind, setKind] = React.useState<'PLAT' | 'PREPARATION'>('PLAT')
  const [carteMode, setCarteMode] = React.useState<'creer' | 'relier' | 'aucun'>(connu ? 'relier' : 'creer')
  const [famille, setFamille] = React.useState(carte[0]?.id ?? '')
  const [item, setItem] = React.useState(connu ? initial!.item : '')
  const [busy, setBusy] = React.useState(false)
  const valide = nom.trim() !== '' && dep !== '' && (kind === 'PREPARATION' || carteMode === 'aucun' || (carteMode === 'creer' ? famille !== '' : item !== ''))
  const creer = async () => {
    if (!valide) return
    setBusy(true)
    try {
      const r = await gql<{ createRecipe: { id: string } }>(CREATE, {
        name: nom.trim(), departmentId: dep, kind,
        salesItemId: kind === 'PLAT' && carteMode === 'relier' ? item : null,
        createItemInFamilyId: kind === 'PLAT' && carteMode === 'creer' ? famille : null,
      })
      push('success', `Fiche « ${nom.trim()} » créée : ajoutez ses ingrédients.`)
      onDone(r.createRecipe.id)
    } catch (e) { push('error', errorMessage(e)) } finally { setBusy(false) }
  }
  const service = departements.find((d) => d.id === dep) ?? null
  const familleChoisie = carte.find((f) => f.id === famille) ?? null
  const platChoisi = carte.flatMap((f) => f.items).find((i) => i.id === item) ?? null
  // Ce que la fiche deviendra, dit en une ligne au pied de la boîte.
  const resume = [
    kind === 'PLAT' ? 'Plat' : 'Préparation',
    service?.name,
    kind === 'PLAT'
      ? carteMode === 'creer' ? (familleChoisie ? `nouveau plat dans « ${familleChoisie.name} »` : null)
        : carteMode === 'relier' ? (platChoisi ? `relié à « ${platChoisi.name} »` : 'plat à choisir')
        : 'sans plat de carte pour l’instant'
      : null,
  ].filter(Boolean).join(' · ')

  return (
    <Modal title="Nouvelle fiche technique" onClose={onClose} wide
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[0.82rem] text-fg-muted">{nom.trim() ? <><strong className="text-fg">{nom.trim()}</strong> · </> : null}{resume}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Annuler</Button>
            <Button variant="primary" loading={busy} disabled={!valide} onClick={creer}>
              {!busy ? <Check className="size-4" /> : null}Créer la fiche
            </Button>
          </div>
        </div>
      }>
      <div className="space-y-5">
        {/* 1 — le nom, bien lisible. */}
        <section>
          <Etape n={1} titre="Nom de la fiche" requis />
          <input value={nom} onChange={(e) => setNom(e.target.value)} autoFocus maxLength={80}
            placeholder="Pizza margherita, sauce tomate…" aria-label="Nom de la fiche"
            className="field h-12 w-full px-4 text-[1rem] font-semibold" />
        </section>

        {/* 2 — le service : des tuiles égales, à la couleur du département. */}
        <section>
          <Etape n={2} titre="Service" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Service">
            {departements.map((d) => {
              const actif = dep === d.id
              return (
                <button key={d.id} type="button" role="radio" aria-checked={actif} onClick={() => setDep(d.id)}
                  className={cn('relative flex h-12 items-center gap-2 rounded-xl border px-3 text-left text-[0.84rem] font-semibold transition-[background-color,box-shadow,transform] active:scale-[0.98]',
                    actif ? 'text-white shadow-md' : 'border-[rgb(var(--glass-edge)/0.34)] bg-white/70 text-fg hover:bg-white')}
                  style={actif ? { background: d.color, borderColor: d.color } : undefined}>
                  <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg', actif ? 'bg-white/25' : 'text-white')}
                    style={actif ? undefined : { background: d.color }}>
                    <Icon name={d.icon ?? 'Building2'} className="size-3.5" />
                  </span>
                  <span className="min-w-0 truncate">{d.name}</span>
                  {actif ? <Check className="absolute right-2 top-1/2 size-4 -translate-y-1/2" /> : null}
                </button>
              )
            })}
          </div>
        </section>

        {/* 3 — plat ou préparation : deux cartes, la choisie ne laisse pas de doute. */}
        <section>
          <Etape n={3} titre="Type de fiche" />
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Type de fiche">
            {(['PLAT', 'PREPARATION'] as const).map((k) => {
              const actif = kind === k
              return (
                <button key={k} type="button" role="radio" aria-checked={actif} onClick={() => setKind(k)}
                  className={cn('flex items-start gap-3 rounded-xl border-2 p-3.5 text-left transition-[background-color,border-color]',
                    actif ? '!border-accent bg-accent/[0.07]' : '!border-[rgb(var(--glass-edge)/0.3)] bg-white/70 hover:bg-white')}>
                  <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', actif ? 'bg-accent text-white' : 'bg-[rgb(var(--glass-edge)/0.18)] text-fg-muted')}>
                    <Icon name={k === 'PLAT' ? 'UtensilsCrossed' : 'FlaskConical'} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.95rem] font-bold text-fg">{k === 'PLAT' ? 'Plat' : 'Préparation'}</span>
                    <span className="block text-[0.78rem] leading-snug text-fg-muted">{k === 'PLAT' ? 'Vendu à la carte : le Z le compte.' : 'Entre dans d’autres fiches (pâte, sauce…).'}</span>
                  </span>
                  <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2', actif ? '!border-accent bg-accent text-white' : '!border-[rgb(var(--glass-edge)/0.5)]')}>
                    {actif ? <Check className="size-3" /> : null}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* 4 — le plat de la carte, seulement pour un plat. */}
        {kind === 'PLAT' ? (
          <section>
            <Etape n={4} titre="Plat de la carte" />
            <div className="rounded-xl border border-[rgb(var(--glass-edge)/0.3)] bg-white/60 p-3">
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-[rgb(var(--glass-edge)/0.14)] p-1" role="radiogroup" aria-label="Plat de la carte">
                {([['creer', 'Créer sur la carte'], ['relier', 'Relier à un plat'], ['aucun', 'Plus tard']] as const).map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={carteMode === v} onClick={() => setCarteMode(v)}
                    className={cn('h-10 rounded-md px-2 text-[0.8rem] font-semibold transition-colors',
                      carteMode === v ? 'bg-white text-accent shadow-sm' : 'text-fg-muted hover:text-fg')}>
                    {l}
                  </button>
                ))}
              </div>
              {carteMode === 'creer' ? (
                <div className="mt-3">
                  <p className="mb-1.5 text-[0.8rem] font-medium text-fg-muted">Famille de la carte où créer le plat</p>
                  <ComboSelect value={famille} onChange={setFamille} label="Famille de la carte"
                    searchPlaceholder="Rechercher une famille…"
                    options={carte.map((f) => ({ value: f.id, label: f.name }))} />
                </div>
              ) : carteMode === 'relier' ? (
                <div className="mt-3">
                  <p className="mb-1.5 text-[0.8rem] font-medium text-fg-muted">Plat existant de la carte</p>
                  <ComboSelect value={item} onChange={setItem} label="Plat de la carte" placeholder="Choisir un plat…"
                    searchPlaceholder="Rechercher un plat ou une famille…"
                    options={carte.flatMap((f) => f.items.map((i) => ({ value: i.id, label: i.name, group: f.name })))} />
                </div>
              ) : (
                <p className="mt-3 text-[0.8rem] text-fg-muted">La fiche se crée sans plat de carte : vous la relierez plus tard, depuis la fiche. Tant qu’elle n’est pas reliée, le Z ne la consomme pas.</p>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </Modal>
  )
}

/** Le titre numéroté d'une étape du formulaire. */
function Etape({ n, titre, requis }: { n: number; titre: string; requis?: boolean }) {
  return (
    <p className="mb-2 flex items-center gap-2 text-[0.8rem] font-bold uppercase tracking-[0.06em] text-fg-muted">
      <span className="grid size-5 place-items-center rounded-full bg-accent text-[0.7rem] font-bold text-white">{n}</span>
      {titre}
      {requis ? <span className="text-danger">*</span> : null}
    </p>
  )
}

function FicheDetail({ fiche, produits, preparations, carte, onChange }: { fiche: Fiche; produits: Produit[]; preparations: Fiche[]; carte: Data['salesCard']; onChange: () => void }) {
  const { push } = useToast()
  const confirmer = useConfirm()
  const [item, setItem] = React.useState(fiche.salesItem?.id ?? '')
  const supprimerFiche = async () => {
    const ok = await confirmer({ title: `Supprimer la fiche « ${fiche.name} » ?`, message: `Ses ${fiche.lines.length} ingrédient(s) partent avec elle. Le plat de la carte, lui, reste.`, confirmLabel: 'Supprimer', tone: 'danger' })
    if (!ok) return
    try { await gql(DELETE_RECIPE, { id: fiche.id }); push('success', 'Fiche supprimée.'); onChange() } catch (e) { push('error', errorMessage(e)) }
  }
  const relier = async () => {
    try { await gql(LINK_ITEM, { recipeId: fiche.id, salesItemId: item || null }); push('success', item ? 'Fiche reliée à la carte.' : 'Fiche détachée de la carte.'); onChange() }
    catch (e) { push('error', errorMessage(e)) }
  }
  return (
    <div className="border-t border-[rgb(var(--glass-edge)/0.12)] bg-white/40 px-4 py-3 sm:px-5">
      {fiche.kind === 'PLAT' ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[0.83rem]">
          <Link2 className="size-4 text-accent" />
          <span className="font-medium text-fg">Plat de la carte :</span>
          <select value={item} onChange={(e) => setItem(e.target.value)} className="field h-9 min-w-0 flex-1 basis-56 px-2 text-[0.83rem]">
            <option value="">— aucun —</option>
            {carte.map((fam) => <optgroup key={fam.id} label={fam.name}>{fam.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</optgroup>)}
          </select>
          <Button size="sm" variant="secondary" onClick={relier} disabled={item === (fiche.salesItem?.id ?? '')}>Relier</Button>
        </div>
      ) : null}
      <TableWrap minWidth="44rem">
        <thead><tr><Th>Ingrédient (fiche)</Th><Th className="w-40 text-right">Par portion</Th><Th className="w-full">Article du stock ou préparation</Th><Th className="w-28" /></tr></thead>
        <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
          {fiche.lines.map((l) => <LigneRow key={l.id} ligne={l} produits={produits} preparations={preparations} onChange={onChange} />)}
          <NouvelleLigne recipeId={fiche.id} produits={produits} preparations={preparations} onChange={onChange} />
        </tbody>
      </TableWrap>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {fiche.source ? <p className="text-[0.7rem] text-fg-subtle">Source : {fiche.source}</p> : <span />}
        <Button size="sm" variant="ghost" onClick={supprimerFiche} className="text-danger hover:bg-danger/10">
          <Trash2 className="size-3.5" />
          Supprimer la fiche
        </Button>
      </div>
    </div>
  )
}

/**
 * La ligne d'ajout, au bas de la fiche : le nom de l'ingrédient, sa dose, et
 * une barre de recherche dans la colonne « article » — on y tape « moz »,
 * les articles du stock et les préparations du service défilent, on en prend
 * un. Un libellé absent du stock reste possible, on le rapprochera plus tard.
 */
function NouvelleLigne({ recipeId, produits, preparations, onChange }: { recipeId: string; produits: Produit[]; preparations: Fiche[]; onChange: () => void }) {
  const { push } = useToast()
  const [label, setLabel] = React.useState('')
  const [quantite, setQuantite] = React.useState('')
  const [unite, setUnite] = React.useState('g')
  const [cible, setCible] = React.useState('')
  const nomCible = cible.startsWith('p:') ? produits.find((p) => p.id === cible.slice(2))?.name : cible.startsWith('r:') ? preparations.find((r) => r.id === cible.slice(2))?.name : null
  const valide = label.trim() !== '' && toNumber(quantite) > 0
  const ajouter = async () => {
    if (!valide) return
    try {
      await gql(ADD_LINE, { recipeId, label: label.trim(), quantity: toNumber(quantite), unit: unite, productId: cible.startsWith('p:') ? cible.slice(2) : null, subRecipeId: cible.startsWith('r:') ? cible.slice(2) : null })
      push('success', `${label.trim()} ajouté.`); setLabel(''); setQuantite(''); setCible(''); onChange()
    } catch (e) { push('error', errorMessage(e)) }
  }
  return (
    <tr className="bg-accent/[0.04]">
      <Td>
        <input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && valide) void ajouter() }} placeholder="Nouvel ingrédient…" aria-label="Nouvel ingrédient" className="field h-9 w-full min-w-[9rem] px-3 text-[0.85rem]" />
      </Td>
      <Td className="whitespace-nowrap text-right">
        <span className="inline-flex items-center gap-1">
          <input inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value.replace(',', '.'))} onKeyDown={(e) => { if (e.key === 'Enter' && valide) void ajouter() }} placeholder="0" className="field h-9 w-20 px-2 py-0 text-right tabular-nums" aria-label="Quantité du nouvel ingrédient" />
          <input value={unite} onChange={(e) => setUnite(e.target.value)} className="field h-9 w-12 px-1 py-0 text-center" aria-label="Unité du nouvel ingrédient" />
        </span>
      </Td>
      <Td>
        <RechercheArticle
          produits={produits}
          preparations={preparations}
          cible={cible}
          nomCible={nomCible ?? null}
          onChoix={(c, nom, unit) => {
            setCible(c)
            if (!label.trim()) setLabel(nom)
            if (unit) setUnite(unit === 'kg' ? 'g' : unit === 'L' ? 'cl' : unit)
          }}
        />
      </Td>
      <Td><Button size="sm" variant="primary" disabled={!valide} onClick={ajouter}><Plus className="size-3.5" />Ajouter</Button></Td>
    </tr>
  )
}

/**
 * La barre de recherche d'article : une saisie, une liste qui suit la frappe
 * (articles du stock, puis préparations du service), le clavier pour choisir.
 * Une fois choisi, l'article s'affiche en pastille, « changer » rouvre la barre.
 */
function RechercheArticle({ produits, preparations, cible, nomCible, onChoix, autoFocus }: {
  produits: Produit[]; preparations: Fiche[]; cible: string; nomCible: string | null
  onChoix: (cible: string, nom: string, unit: string | null) => void; autoFocus?: boolean
}) {
  const [recherche, setRecherche] = React.useState('')
  const [ouvert, setOuvert] = React.useState(false)
  const [actif, setActif] = React.useState(0)
  // « changer » ouvre la barre sans lâcher l'article : tant qu'on n'a rien
  // choisi, il reste — et « garder » referme la barre telle quelle.
  const [edition, setEdition] = React.useState(false)
  const mot = normaliser(recherche)
  const candidats = mot
    ? [
      ...produits.filter((p) => correspond(mot, p.name, p.reference)).slice(0, 8).map((p) => ({ cle: `p:${p.id}`, nom: p.name, detail: p.baseUnit.symbol, prep: false, unit: p.baseUnit.symbol as string | null })),
      ...preparations.filter((r) => correspond(mot, r.name)).slice(0, 4).map((r) => ({ cle: `r:${r.id}`, nom: r.name, detail: 'préparation', prep: true, unit: null as string | null })),
    ]
    : []
  const choisir = (c: (typeof candidats)[number]) => { onChoix(c.cle, c.nom, c.unit); setRecherche(''); setOuvert(false); setEdition(false) }
  const annuler = () => { setEdition(false); setOuvert(false); setRecherche('') }
  // La liste flotte hors du tableau (portal) : sinon le conteneur défilant
  // du tableau la coupe après deux lignes. Elle passe au-dessus du champ
  // quand il n'y a plus de place en bas de l'écran.
  const boite = React.useRef<HTMLDivElement>(null)
  const [pos, setPos] = React.useState<{ left: number; width: number; top?: number; bottom?: number; hauteur: number } | null>(null)
  React.useLayoutEffect(() => {
    if (!ouvert) { setPos(null); return }
    const maj = () => {
      const r = boite.current?.getBoundingClientRect(); if (!r) return
      const placeEnBas = window.innerHeight - r.bottom - 12
      if (placeEnBas < 140 && r.top > placeEnBas) setPos({ left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4, hauteur: Math.min(240, r.top - 16) })
      else setPos({ left: r.left, width: r.width, top: r.bottom + 4, hauteur: Math.min(240, placeEnBas) })
    }
    maj()
    window.addEventListener('scroll', maj, true); window.addEventListener('resize', maj)
    return () => { window.removeEventListener('scroll', maj, true); window.removeEventListener('resize', maj) }
  }, [ouvert])
  if (cible && nomCible && !edition) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <Badge tone={cible.startsWith('r:') ? 'neutral' : 'ok'}>{cible.startsWith('r:') ? 'préparation · ' : ''}{nomCible}</Badge>
        <button type="button" onClick={() => { setEdition(true); setOuvert(true) }} className="text-[0.75rem] text-fg-muted hover:underline">changer</button>
      </span>
    )
  }
  const flottant = (contenu: React.ReactNode) => pos ? createPortal(<div style={{ position: 'fixed', left: pos.left, width: Math.max(pos.width, 288), top: pos.top, bottom: pos.bottom }} className="z-[60]">{contenu}</div>, document.body) : null
  return (
    <div className="flex items-center gap-2">
      {edition && nomCible ? <Badge tone={cible.startsWith('r:') ? 'neutral' : 'ok'}>{nomCible}</Badge> : null}
    <div ref={boite} className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
      <input
        value={recherche}
        onChange={(e) => { setRecherche(e.target.value); setOuvert(true); setActif(0) }}
        onFocus={() => setOuvert(true)}
        onBlur={() => window.setTimeout(() => setOuvert(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { if (edition) annuler(); else setOuvert(false); return }
          if (!ouvert || candidats.length === 0) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setActif((a) => Math.min(a + 1, candidats.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActif((a) => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); choisir(candidats[actif]) }
        }}
        placeholder={edition ? 'Remplacer par…' : 'Rechercher un article ou une préparation…'}
        role="combobox"
        aria-controls="liste-articles-fiche"
        aria-autocomplete="list"
        aria-expanded={ouvert && candidats.length > 0}
        aria-label="Rechercher un article du stock"
        autoFocus={autoFocus || edition}
        className={cn('field h-9 w-full min-w-[12rem] pl-8 text-[0.83rem]', edition ? 'pr-9' : 'pr-3')}
      />
      {edition ? (
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={annuler} title="Garder l'article actuel" aria-label="Annuler le changement"
          className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-[rgb(var(--glass-edge)/0.18)] hover:text-fg"><X className="size-3.5" /></button>
      ) : null}
      {ouvert && candidats.length > 0 ? flottant(
        <div role="listbox" style={{ maxHeight: pos?.hauteur }} className="overflow-y-auto rounded-xl border border-[rgb(var(--glass-edge)/0.3)] bg-white shadow-lg">
          {candidats.map((c, idx) => (
            <button key={c.cle} type="button" role="option" aria-selected={idx === actif} onMouseDown={(e) => e.preventDefault()} onClick={() => choisir(c)}
              className={cn('flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[0.83rem]', idx === actif ? 'bg-accent/[0.12]' : 'hover:bg-accent/[0.08]')}>
              <span className="truncate font-medium text-fg">{c.nom}</span>
              {c.prep ? <Badge tone="neutral">préparation</Badge> : <span className="shrink-0 text-fg-subtle">{c.detail}</span>}
            </button>
          ))}
        </div>
      ) : ouvert && mot ? flottant(
        <p className="rounded-xl border border-[rgb(var(--glass-edge)/0.3)] bg-white px-3 py-2 text-[0.8rem] text-fg-muted shadow-lg">Aucun article ne correspond.</p>
      ) : null}
    </div>
    </div>
  )
}

function LigneRow({ ligne, produits, preparations, onChange }: { ligne: Ligne; produits: Produit[]; preparations: Fiche[]; onChange: () => void }) {
  const { push } = useToast()
  const confirmer = useConfirm()
  const supprimer = async () => {
    const ok = await confirmer({ title: `Retirer « ${ligne.label} » ?`, message: 'Cet ingrédient ne sera plus consommé par les ventes de cette fiche.', confirmLabel: 'Retirer', tone: 'danger' })
    if (!ok) return
    try { await gql(DELETE_LINE, { id: ligne.id }); push('success', `${ligne.label} retiré.`); onChange() } catch (e) { push('error', errorMessage(e)) }
  }
  const [quantite, setQuantite] = React.useState(String(ligne.quantity))
  const [unite, setUnite] = React.useState(ligne.unit)
  const cibleEnregistree = ligne.product ? `p:${ligne.product.id}` : ligne.subRecipe ? `r:${ligne.subRecipe.id}` : ''
  const [cible, setCible] = React.useState(cibleEnregistree)
  const modifie = quantite !== String(ligne.quantity) || unite !== ligne.unit || cible !== (ligne.product ? `p:${ligne.product.id}` : ligne.subRecipe ? `r:${ligne.subRecipe.id}` : '')
  const sansCible = cible === ''
  const enregistrer = async () => {
    try {
      await gql(UPDATE_LINE, { id: ligne.id, productId: cible.startsWith('p:') ? cible.slice(2) : null, subRecipeId: cible.startsWith('r:') ? cible.slice(2) : null, quantity: toNumber(quantite), unit: unite })
      push('success', `${ligne.label} enregistré.`); onChange()
    } catch (e) { push('error', errorMessage(e)) }
  }
  const nomCible = cible.startsWith('p:') ? produits.find((p) => p.id === cible.slice(2))?.name : cible.startsWith('r:') ? preparations.find((r) => r.id === cible.slice(2))?.name : null
  return (
    <tr className={cn(sansCible && 'bg-warn/[0.07]')}>
      <Td className="max-w-0"><p className="truncate text-[0.85rem] font-medium text-fg">{ligne.label}</p>{ligne.cost !== null ? <p className="text-[0.7rem] text-fg-subtle">coût fiche {formatQty(ligne.cost)}</p> : null}</Td>
      <Td className="whitespace-nowrap text-right">
        <span className="inline-flex items-center gap-1">
          <input inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value.replace(',', '.'))} className="field h-9 w-20 px-2 py-0 text-right tabular-nums" aria-label={`Quantité — ${ligne.label}`} />
          <input value={unite} onChange={(e) => setUnite(e.target.value)} className="field h-9 w-12 px-1 py-0 text-center" aria-label={`Unité — ${ligne.label}`} />
        </span>
      </Td>
      <Td>
        <RechercheArticle
          produits={produits}
          preparations={preparations}
          cible={cible}
          nomCible={nomCible ?? null}
          onChoix={(c) => setCible(c)}
        />
      </Td>
      <Td>
        <span className="inline-flex items-center gap-1">
          {modifie ? (
            <button type="button" onClick={() => { setQuantite(String(ligne.quantity)); setUnite(ligne.unit); setCible(cibleEnregistree) }} title="Revenir à ce qui est enregistré" aria-label={`Annuler les changements de ${ligne.label}`}
              className="grid size-8 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-[rgb(var(--glass-edge)/0.18)] hover:text-fg"><RotateCcw className="size-4" /></button>
          ) : null}
          <Button size="sm" variant={modifie ? 'primary' : 'ghost'} disabled={!modifie} onClick={enregistrer}><Check className="size-3.5" />OK</Button>
          <button type="button" onClick={() => void supprimer()} title="Retirer cet ingrédient" aria-label={`Retirer ${ligne.label}`} className="grid size-8 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-danger/10 hover:text-danger"><Trash2 className="size-4" /></button>
        </span>
      </Td>
    </tr>
  )
}
