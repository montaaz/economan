'use client'

import * as React from 'react'
import { Building2, Check, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, FlaskConical, Layers, Loader2, Pencil, Plus, Printer, Trash2 } from 'lucide-react'
import { boutonBon } from '@/components/ui/bon-style'
import { Icon } from '@/components/ui/icon'
import { GlassCard, Button, EmptyState, TableWrap, Th, Td } from '@/components/ui/glass'
import { Modal } from '@/components/ui/modal'
import { SearchField } from '@/components/ui/search-field'
import { ComboSelect } from '@/components/ui/combo-select'
import { useConfirm } from '@/components/ui/confirm'
import { useToast } from '@/components/ui/toast'
import { gql, errorMessage } from '@/lib/graphql-client'
import { correspond, normaliser } from '@/lib/search'
import { unitesCompatibles, versBase, convertible } from '@/lib/units'
import { cn, formatQty, toNumber } from '@/lib/utils'

/**
 * La fiche articles : toutes les familles du catalogue et leurs articles.
 *
 * Une famille — FRUITS DE MER, VOLAILLES, EPICES… — rassemble ses articles,
 * comme sur les feuilles de commande. Chaque article s'y règle : son nom,
 * son unité, les départements qui le commandent et leur stock fixe. Un
 * article préparé dit en plus ce qu'il contient de son article pur :
 * « 250 gr d'escalope par portion » — c'est cette composition que la
 * préparation et la livraison lisent ensuite.
 *
 * On n'y saisit aucune quantité : rien n'entre ni ne sort du stock d'ici.
 */

const QUERY = /* GraphQL */ `
  query FicheArticles {
    generalStock {
      lines {
        productId productName productRef categoryId categoryName unitSymbol kind stock linkedAt departmentIds
        stockFixes { departmentId quantity }
        compositions { departmentId quantity }
        mother { productId productName unitSymbol motherQuantity }
        portions { productId }
      }
    }
    units { id name symbol }
    departments { id name color icon }
    stockCategories { id name }
  }
`
const CREATE_CATEGORY = /* GraphQL */ `mutation CreateCategory($name: String!) { createCategory(name: $name) }`
const RENAME_CATEGORY = /* GraphQL */ `mutation RenameCategory($id: ID!, $name: String!) { renameCategory(id: $id, name: $name) }`
const DELETE_CATEGORY = /* GraphQL */ `mutation DeleteCategory($id: ID!) { deleteCategory(id: $id) }`
const DELETE_ARTICLE = /* GraphQL */ `mutation DeleteArticle($productId: ID!, $detachPrepared: Boolean) { deleteArticle(productId: $productId, detachPrepared: $detachPrepared) }`
const SET_CATEGORY = /* GraphQL */ `mutation SetProductCategory($productId: ID!, $categoryId: ID!) { setProductCategory(productId: $productId, categoryId: $categoryId) }`
const CREATE_PURE = /* GraphQL */ `
  mutation CreatePure($name: String!, $unit: String, $categoryId: ID) {
    createPureProduct(name: $name, unit: $unit, categoryId: $categoryId)
  }
`
const CREATE_PREPARED = /* GraphQL */ `
  mutation CreatePrepared($parentId: ID!, $name: String!, $unit: String!, $motherQuantity: Float!, $categoryId: ID) {
    createPreparedProduct(parentId: $parentId, name: $name, unit: $unit, motherQuantity: $motherQuantity, categoryId: $categoryId)
  }
`
const SET_COMPOSITIONS = /* GraphQL */ `
  mutation SetPreparedCompositions($productId: ID!, $lines: [PreparedStockFixeInput!]!) {
    setPreparedCompositions(productId: $productId, lines: $lines)
  }
`
const SET_FAMILY_PURE = /* GraphQL */ `mutation SetFamilyPure($categoryId: ID!, $productId: ID!) { setFamilyPure(categoryId: $categoryId, productId: $productId) }`
const SET_STOCK_FIXE = /* GraphQL */ `
  mutation SetPreparedStockFixe($productId: ID!, $lines: [PreparedStockFixeInput!]!) {
    setPreparedStockFixe(productId: $productId, lines: $lines)
  }
`
const SET_DEPARTMENTS = /* GraphQL */ `
  mutation SetPreparedDepartments($productId: ID!, $departmentIds: [ID!]!) {
    setPreparedDepartments(productId: $productId, departmentIds: $departmentIds)
  }
`
const SET_PORTION = /* GraphQL */ `
  mutation SetPortion($productId: ID!, $parentId: ID, $motherQuantity: Float) {
    setProductPortion(productId: $productId, parentId: $parentId, motherQuantity: $motherQuantity) { id }
  }
`
const RENAME_ARTICLE = /* GraphQL */ `
  mutation RenamePrepared($productId: ID!, $name: String!, $unit: String) {
    renamePreparedProduct(productId: $productId, name: $name, unit: $unit) { id name }
  }
`

type Line = {
  productId: string; productName: string; productRef: string; categoryId: string; categoryName: string; unitSymbol: string
  kind: 'FINI' | 'MERE' | 'PREPARE'; stock: number
  /** Quand l'article a rejoint son article pur. */
  linkedAt: string | null
  /** Les départements qui peuvent commander l'article. */
  departmentIds: string[]
  /** Le stock fixe réglé, département par département. */
  stockFixes: { departmentId: string; quantity: number }[]
  /** Ce que contient une unité, par département ; vide : la contenance de l'article vaut partout. */
  compositions: { departmentId: string; quantity: number }[]
  mother: { productId: string; productName: string; unitSymbol: string; motherQuantity: number } | null
  portions: { productId: string }[]
}
type Unite = { id: string; name: string; symbol: string }
type Departement = { id: string; name: string; color: string; icon: string | null }
type Categorie = { id: string; name: string }
type Data = { generalStock: { lines: Line[] }; units: Unite[]; departments: Departement[]; stockCategories: Categorie[] }

/** Les départements d'un article, en pastilles ; « Tous » quand il les a tous. */
function Departements({ ids, tous }: { ids: string[]; tous: Departement[] }) {
  if (ids.length === 0) return <span className="text-[0.8rem] font-medium text-fg-subtle">Aucun département</span>
  if (tous.length > 1 && tous.every((d) => ids.includes(d.id))) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#103528] px-2.5 py-1 text-[0.78rem] font-bold text-white">
        <Building2 className="size-3.5" />
        Tous les départements
      </span>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      {tous.filter((d) => ids.includes(d.id)).map((d) => (
        <span key={d.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.76rem] font-semibold text-white" style={{ background: d.color }}>
          <Icon name={d.icon ?? 'Building2'} className="size-3" />
          {d.name}
        </span>
      ))}
    </span>
  )
}

/** Ce que contient une unité d'un préparé pour un département. */
function compositionPour(a: Line, departmentId: string): number {
  return a.compositions.find((c) => c.departmentId === departmentId)?.quantity ?? a.mother?.motherQuantity ?? 0
}

/** 0,25 kg se lit « 250 gr » : c'est ainsi qu'on parle d'une portion. */
function formatContenu(q: number, unit: string): string {
  if (unit === 'kg' && q < 1) return `${formatQty(q * 1000)} gr`
  if (unit === 'L' && q < 1) return `${formatQty(q * 1000)} ml`
  return `${formatQty(q)} ${unit}`
}

/**
 * Le stock fixe d'un article, pour chacun de ses départements.
 *
 * Un seul département : le nombre seul, en gros. Plusieurs : chacun avec sa
 * pastille de couleur, puisque la cible n'est pas la même d'un rayon à
 * l'autre. Un département sans stock fixe se dit — c'est lui qui ne
 * commandera rien.
 */
function StockFixe({ article, tous }: { article: Line; tous: Departement[] }) {
  const deps = tous.filter((d) => article.departmentIds.includes(d.id))
  if (deps.length === 0) return <span className="text-fg-subtle">—</span>
  const valeur = (id: string) => article.stockFixes.find((f) => f.departmentId === id)?.quantity ?? 0
  if (deps.length === 1) {
    const q = valeur(deps[0].id)
    return q > 0
      ? <span className="text-[0.95rem] font-bold tabular-nums text-fg">{formatQty(q)} <span className="text-[0.76rem] font-medium text-fg-muted">{article.unitSymbol}</span></span>
      : <span className="rounded-md bg-warn/15 px-2 py-0.5 text-[0.76rem] font-semibold text-warn">À régler</span>
  }
  return (
    <span className="flex flex-col gap-0.5">
      {deps.map((d) => {
        const q = valeur(d.id)
        return (
          <span key={d.id} className="flex items-center gap-1.5 text-[0.82rem]">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="text-fg-muted">{d.name}</span>
            {q > 0
              ? <span className="font-bold tabular-nums text-fg">{formatQty(q)} {article.unitSymbol}</span>
              : <span className="font-semibold text-warn">à régler</span>}
          </span>
        )
      })}
    </span>
  )
}

/**
 * La composition d'un préparé : une seule pastille quand elle vaut la même
 * chose partout, sinon une ligne par département, à sa couleur.
 */
function Composition({ article: a, tous, nomUnite }: { article: Line; tous: Departement[]; nomUnite: (s: string) => string }) {
  const m = a.mother!
  const deps = tous.filter((d) => a.departmentIds.includes(d.id))
  const valeurs = deps.map((d) => compositionPour(a, d.id))
  const uniforme = valeurs.every((v) => Math.abs(v - (valeurs[0] ?? m.motherQuantity)) < 1e-9)
  if (deps.length <= 1 || uniforme) {
    const q = valeurs[0] ?? m.motherQuantity
    return (
      <span className="flex flex-col items-start gap-0.5">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-ok/35 bg-ok/10 px-2.5 py-1 text-[0.88rem] font-bold text-ok">
          <FlaskConical className="size-4" />
          {formatContenu(q, m.unitSymbol)} par {nomUnite(a.unitSymbol)}
        </span>
        <span className="pl-1 text-[0.72rem] text-fg-muted">de {m.productName}</span>
      </span>
    )
  }
  return (
    <span className="flex flex-col gap-0.5">
      {deps.map((d) => (
        <span key={d.id} className="flex items-center gap-1.5 text-[0.82rem]">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
          <span className="text-fg-muted">{d.name}</span>
          <span className="font-bold text-ok">{formatContenu(compositionPour(a, d.id), m.unitSymbol)}</span>
        </span>
      ))}
      <span className="text-[0.72rem] text-fg-muted">par {nomUnite(a.unitSymbol)} de {m.productName}</span>
    </span>
  )
}

export function FicheArticles() {
  const { push } = useToast()
  const confirmer = useConfirm()
  const [data, setData] = React.useState<Data | null>(null)
  const [erreur, setErreur] = React.useState<string | null>(null)
  const [version, setVersion] = React.useState(0)
  const [recherche, setRecherche] = React.useState('')
  // Le filtre par département : « tous », un département, ou les articles
  // qui n'en ont aucun — ceux qu'il reste à ranger.
  const [filtre, setFiltre] = React.useState<string>('tous')
  // Les familles repliées : on garde l'écran lisible sur trente familles.
  const [repliees, setRepliees] = React.useState<Set<string>>(new Set())
  // La boîte ouverte : un article à corriger ou à ajouter, une famille à
  // créer ou à modifier.
  const [boite, setBoite] = React.useState<
    | { mode: 'article'; famille: Categorie; article: Line | null }
    | { mode: 'famille'; famille: Categorie | null; total: number }
    | null
  >(null)

  React.useEffect(() => {
    let vivant = true
    gql<Data>(QUERY)
      .then((d) => { if (vivant) { setData(d); setErreur(null) } })
      .catch((e) => { if (vivant) setErreur(errorMessage(e)) })
    return () => { vivant = false }
  }, [version])
  const recharger = () => setVersion((v) => v + 1)

  const lignes = React.useMemo(() => data?.generalStock.lines ?? [], [data])
  const unites = data?.units ?? []
  const departements = data?.departments ?? []
  const categories = React.useMemo(() => data?.stockCategories ?? [], [data])
  const nomUnite = (symbole: string) =>
    (unites.find((u) => u.symbol.toLowerCase() === symbole.toLowerCase())?.name ?? (symbole === 'p' ? 'portion' : symbole)).toLowerCase()

  // Le bouton de filtre et la recherche répondent tout de suite ; la liste
  // de six cents articles se recalcule juste après, sans geler l'écran.
  const filtreListe = React.useDeferredValue(filtre)
  const rechercheListe = React.useDeferredValue(recherche)
  const dansLeFiltre = React.useCallback((l: Line) =>
    filtreListe === 'tous' || (filtreListe === 'aucun' ? l.departmentIds.length === 0 : l.departmentIds.includes(filtreListe)), [filtreListe])

  // Les familles du catalogue, chacune avec ses articles.
  const familles = React.useMemo(() => {
    const mot = normaliser(rechercheListe)
    const parFamille = new Map<string, Line[]>()
    for (const l of lignes) if (l.kind !== 'MERE') parFamille.set(l.categoryId, [...(parFamille.get(l.categoryId) ?? []), l])
    return categories
      .map((famille) => {
        const toutes = parFamille.get(famille.id) ?? []
        // La recherche retient une famille par son nom (tous ses articles), ou
        // ses seuls articles qui répondent.
        const parNom = mot !== '' && correspond(mot, famille.name)
        const articles = toutes
          .filter((l) => dansLeFiltre(l) && (mot === '' || parNom || correspond(mot, l.productName, l.productRef, l.mother?.productName)))
          .sort((a, b) => a.productName.localeCompare(b.productName))
        return { famille, articles, total: toutes.length }
      })
      // Sous une recherche ou un filtre, une famille sans article s'efface.
      .filter((f) => (mot === '' && filtreListe === 'tous') || f.articles.length > 0)
  }, [categories, lignes, rechercheListe, filtreListe, dansLeFiltre])

  // Supprimer un article : effacé s'il n'a jamais servi, sinon désactivé
  // (retiré des feuilles, historique gardé). Le serveur décide.
  const [suppression, setSuppression] = React.useState<string | null>(null)
  const supprimerArticle = async (a: Line) => {
    const base = a.portions.length
    const ok = await confirmer({
      title: `Supprimer ${a.productName} ?`,
      message: (
        <div className="space-y-2">
          {base > 0 ? (
            <p className="rounded-lg bg-warn/12 px-3 py-2 font-semibold text-warn">
              {a.productName} est la base de {base} article{base > 1 ? 's' : ''} préparé{base > 1 ? 's' : ''} : ils restent, mais perdent leur composition (« … gr par portion »).
            </p>
          ) : null}
          <p>L’article disparaît de la fiche articles et des feuilles de commande. S’il a déjà servi (commandes, factures, préparations), il est seulement désactivé : son historique reste intact.</p>
        </div>
      ),
      confirmLabel: base > 0 ? `Supprimer et détacher ${base}` : 'Supprimer', tone: 'danger',
    })
    if (!ok) return
    setSuppression(a.productId)
    try {
      const r = await gql<{ deleteArticle: string }>(DELETE_ARTICLE, { productId: a.productId, detachPrepared: base > 0 })
      push('success', r.deleteArticle === 'supprime'
        ? `${a.productName} supprimé.`
        : `${a.productName} a un historique : il est désactivé et retiré des feuilles de commande, son historique est conservé.`)
      recharger()
    } catch (e) { push('error', errorMessage(e)) } finally { setSuppression(null) }
  }

  // Les articles qui se commandent : un article pur n'en est pas.
  const commandables = lignes.filter((l) => l.kind !== 'MERE')
  const compte = (id: string) => commandables.filter((l) => l.departmentIds.includes(id)).length
  const sansDepartement = commandables.filter((l) => l.departmentIds.length === 0).length
  const nbArticles = familles.reduce((n, f) => n + f.articles.length, 0)
  const toutReplie = familles.length > 0 && familles.every((f) => repliees.has(f.famille.id))
  const basculerFamille = (id: string) => setRepliees((r) => { const n = new Set(r); if (n.has(id)) n.delete(id); else n.add(id); return n })
  // Les gestes du tableau passent par une référence : le tableau mémorisé
  // appelle toujours leur dernière version.
  const gestes = React.useRef({ supprimerArticle, basculerFamille, setBoite, nomUnite })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useLayoutEffect(() => { gestes.current = { supprimerArticle, basculerFamille, setBoite, nomUnite } })

  const tableau = React.useMemo(() => (
          <TableWrap minWidth="54rem">
            <thead>
              <tr>
                <Th className="w-full">Article</Th>
                <Th className="whitespace-nowrap">Composition</Th>
                <Th>Départements</Th>
                <Th className="whitespace-nowrap">Stock fixe</Th>
                <Th className="w-24 text-right"><span className="sr-only">Actions</span></Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
              {familles.map(({ famille, articles, total }) => {
                const repliee = repliees.has(famille.id)
                return (
                  <React.Fragment key={famille.id}>
                    {/* La famille, en bandeau : on la replie, on la modifie. */}
                    <tr className="bg-ok/12">
                      <td colSpan={4} className="px-2 py-1.5 sm:px-3">
                        <span className="flex flex-wrap items-center gap-2">
                          <button type="button" onClick={() => gestes.current.basculerFamille(famille.id)} aria-expanded={!repliee}
                            className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-white/40">
                            {repliee ? <ChevronRight className="size-4 shrink-0 text-ok" /> : <ChevronDown className="size-4 shrink-0 text-ok" />}
                            <span className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-ok">Famille</span>
                            <span className="text-[0.98rem] font-bold text-fg">{famille.name}</span>
                          </button>
                          {/* L'article pur de la famille : il ne se commande pas ; un clic
                              ouvre ce qu'on en prépare, et ce que chacun en contient. */}
                          {lignes.filter((l) => l.categoryId === famille.id && l.kind === 'MERE').map((pur) => (
                            <button key={pur.productId} type="button" onClick={() => gestes.current.setBoite({ mode: 'article', famille, article: pur })}
                              title={`Préparés à partir de ${pur.productName}`}
                              className="inline-flex items-center gap-1 rounded-full border border-ok/45 bg-white/85 px-2.5 py-1 text-[0.74rem] font-semibold text-ok transition-colors hover:bg-ok hover:text-white">
                              <FlaskConical className="size-3.5" /> Article pur : {pur.productName}
                              <span className="opacity-75">· {pur.portions.length} préparé{pur.portions.length > 1 ? 's' : ''}</span>
                              <Pencil className="ml-0.5 size-3" />
                            </button>
                          ))}
                          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[0.72rem] font-semibold text-fg-muted">
                            {total === 0 ? 'vide' : articles.length === total ? `${total} article${total > 1 ? 's' : ''}` : `${articles.length} sur ${total}`}
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button type="button" onClick={() => gestes.current.setBoite({ mode: 'famille', famille, total })}
                          title={`Modifier la famille ${famille.name}`} aria-label={`Modifier la famille ${famille.name}`}
                          className="grid size-9 place-items-center rounded-lg border border-ok/45 bg-white/70 text-ok transition-colors hover:bg-ok/15">
                          <Pencil className="size-4" />
                        </button>
                      </td>
                    </tr>
                    {repliee ? null : articles.map((a) => (
                      <tr key={a.productId} className="transition-colors hover:bg-white/40">
                        <Td className="pl-9 sm:pl-11">
                          <p className="text-[0.9rem] font-semibold text-fg">{a.productName}</p>
                          <p className="text-[0.72rem] text-fg-subtle">{a.unitSymbol}</p>
                        </Td>
                        <Td className="whitespace-nowrap">
                          {a.mother ? (
                            <Composition article={a} tous={departements} nomUnite={(x: string) => gestes.current.nomUnite(x)} />
                          ) : a.kind === 'MERE' || a.portions.length > 0 ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-ok/40 bg-ok/[0.08] px-2.5 py-1 text-[0.8rem] font-bold text-ok">
                              <FlaskConical className="size-3.5" /> Article pur · base de {a.portions.length} préparé{a.portions.length > 1 ? 's' : ''}
                            </span>
                          ) : <span className="text-fg-subtle">—</span>}
                        </Td>
                        <Td className="min-w-[12rem]">
                          {a.kind === 'MERE' ? <span className="text-[0.8rem] font-medium text-fg-subtle">Ne se commande pas</span>
                            : <Departements ids={a.departmentIds} tous={departements} />}
                        </Td>
                        <Td className="whitespace-nowrap">
                          {a.kind === 'MERE' ? <span className="text-fg-subtle">—</span> : <StockFixe article={a} tous={departements} />}
                        </Td>
                        <Td className="text-right">
                          <span className="inline-flex items-center gap-1.5">
                            <button type="button" onClick={() => gestes.current.setBoite({ mode: 'article', famille, article: a })}
                              title={`Modifier ${a.productName}`} aria-label={`Modifier ${a.productName}`}
                              className="grid size-9 place-items-center rounded-lg border border-accent/40 bg-accent/10 text-accent transition-colors hover:bg-accent/20">
                              <Pencil className="size-4" />
                            </button>
                            <button type="button" onClick={() => void gestes.current.supprimerArticle(a)} disabled={suppression !== null}
                              title={`Supprimer ${a.productName}`} aria-label={`Supprimer ${a.productName}`}
                              className="grid size-9 place-items-center rounded-lg border border-danger/35 bg-danger/[0.06] text-danger transition-colors hover:bg-danger/15 disabled:opacity-50">
                              {suppression === a.productId ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                            </button>
                          </span>
                        </Td>
                      </tr>
                    ))}
                    {/* Au pied de chaque famille : un article de plus. */}
                    {repliee ? null : (
                      <tr>
                        <td colSpan={5} className="px-4 py-2 pl-9 sm:px-5 sm:pl-11">
                          <button type="button" onClick={() => gestes.current.setBoite({ mode: 'article', famille, article: null })}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-ok/55 bg-ok/[0.06] px-3 text-[0.82rem] font-semibold text-ok transition-colors hover:bg-ok/15">
                            <Plus className="size-4" />
                            Ajouter un article à {famille.name}
                          </button>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </TableWrap>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [familles, repliees, suppression, departements, filtreListe, lignes])

  return (
    <>
      <GlassCard overflowVisible>
        <div className="flex flex-wrap items-center gap-2 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
          <SearchField value={recherche} onChange={setRecherche} placeholder="Rechercher une famille ou un article…" className="min-w-0 flex-1 basis-56 sm:max-w-md" />
          {data ? (
            <p className="text-[0.82rem] text-fg-muted">
              <strong className="text-fg">{familles.length}</strong> famille{familles.length > 1 ? 's' : ''} · <strong className="text-fg">{nbArticles}</strong> article{nbArticles > 1 ? 's' : ''}
            </p>
          ) : null}
          {data && familles.length > 0 ? (
            <button type="button" onClick={() => setRepliees(toutReplie ? new Set() : new Set(familles.map((f) => f.famille.id)))}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[0.8rem] font-semibold text-fg-muted hover:bg-[rgb(var(--glass-edge)/0.14)] hover:text-fg">
              {toutReplie ? <ChevronsUpDown className="size-4" /> : <ChevronsDownUp className="size-4" />}
              {toutReplie ? 'Tout déplier' : 'Tout replier'}
            </button>
          ) : null}
          {/* Le papier suit l'écran : tout sous « Tous », sinon le seul
              département choisi — et la recherche en cours. */}
          <button type="button" disabled={!data || nbArticles === 0}
            onClick={() => {
              const p = new URLSearchParams({ dep: filtre })
              if (recherche.trim()) p.set('q', recherche.trim())
              window.open(`/api/fiche-articles?${p}`, '_blank', 'noopener')
            }}
            title="Ouvre la liste en PDF, prête à imprimer"
            className={cn(boutonBon('commande'), 'ml-auto !h-10 !rounded-xl !px-4 !text-[0.875rem]')}>
            <Printer className="size-4" />
            Imprimer{filtre === 'tous' ? ' tout' : filtre === 'aucun' ? ' — sans département' : ` — ${departements.find((d) => d.id === filtre)?.name ?? ''}`}
          </button>
          <button type="button" onClick={() => setBoite({ mode: 'famille', famille: null, total: 0 })} disabled={!data}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#103528] bg-[#103528] px-4 text-[0.875rem] font-semibold text-white shadow-[0_6px_16px_-8px_rgb(16_53_40/0.7)] transition-[filter,transform] hover:brightness-110 active:translate-y-px disabled:opacity-55">
            <Plus className="size-4" />
            Nouvelle famille
          </button>
        </div>

        {/* Le filtre par département : une pastille chacun, à sa couleur. */}
        {data ? (
          <div className="scroll-x flex gap-1.5 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-2.5 sm:flex-wrap sm:px-5">
            <button type="button" aria-pressed={filtre === 'tous'} onClick={() => setFiltre('tous')}
              className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border-2 px-3 text-[0.82rem] font-bold transition-colors',
                filtre === 'tous' ? 'border-[#103528] bg-[#103528] text-white' : 'border-[#103528]/35 bg-white/70 text-[#103528] hover:bg-[#103528]/10')}>
              <Building2 className="size-4" />
              Tous
              <span className={cn('rounded-full px-1.5 text-[0.72rem] tabular-nums', filtre === 'tous' ? 'bg-white/25' : 'bg-[#103528]/10')}>{commandables.length}</span>
            </button>
            {departements.map((d) => {
              const actif = filtre === d.id
              const n = compte(d.id)
              return (
                <button key={d.id} type="button" aria-pressed={actif} onClick={() => setFiltre(actif ? 'tous' : d.id)}
                  className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border-2 px-3 text-[0.82rem] font-semibold transition-[filter,background-color,color]',
                    actif ? 'text-white hover:brightness-110' : 'bg-white/70 text-fg hover:bg-white', n === 0 && !actif && 'opacity-55')}
                  style={actif ? { background: d.color, borderColor: d.color } : { borderColor: `${d.color}66` }}>
                  <Icon name={d.icon ?? 'Building2'} className="size-4" style={actif ? undefined : { color: d.color }} />
                  {d.name}
                  <span className={cn('rounded-full px-1.5 text-[0.72rem] tabular-nums', actif ? 'bg-white/25' : 'bg-[rgb(var(--glass-edge)/0.2)]')}>{n}</span>
                </button>
              )
            })}
            {sansDepartement > 0 ? (
              <button type="button" aria-pressed={filtre === 'aucun'} onClick={() => setFiltre(filtre === 'aucun' ? 'tous' : 'aucun')}
                className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border-2 px-3 text-[0.82rem] font-semibold transition-colors',
                  filtre === 'aucun' ? 'border-warn bg-warn text-white' : 'border-warn/50 bg-warn/10 text-warn hover:bg-warn/20')}>
                Sans département
                <span className={cn('rounded-full px-1.5 text-[0.72rem] tabular-nums', filtre === 'aucun' ? 'bg-white/25' : 'bg-warn/15')}>{sansDepartement}</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {erreur ? (
          <p role="alert" className="px-4 py-4 text-[0.85rem] font-medium text-danger">{erreur}</p>
        ) : data === null ? (
          <p className="flex items-center gap-2 px-4 py-6 text-[0.85rem] text-fg-muted"><Loader2 className="size-4 animate-spin" /> Chargement…</p>
        ) : familles.length === 0 ? (
          <EmptyState icon={<Layers className="size-6" />} title="Aucune famille"
            description={recherche ? 'Aucune famille ni aucun article ne correspond à cette recherche.'
              : filtre !== 'tous' ? 'Aucun article pour ce département.'
                : 'Créez votre première famille avec « Nouvelle famille ».'} />
        ) : (
          tableau
        )}
      </GlassCard>

      {boite?.mode === 'famille' ? (
        <BoiteFamille famille={boite.famille} total={boite.total} lignes={lignes} onClose={() => setBoite(null)}
          onDone={(message, id) => {
            setBoite(null); recharger(); push('success', message)
            // Une famille qu'on vient de créer se déplie, prête à recevoir.
            if (id) setRepliees((r) => { const n = new Set(r); n.delete(id); return n })
          }} />
      ) : null}
      {boite?.mode === 'article' ? (
        <BoiteArticle
          famille={boite.famille}
          article={boite.article}
          lignes={lignes}
          unites={unites}
          departements={departements}
          categories={categories}
          onClose={() => setBoite(null)}
          onOuvrir={(a) => setBoite({ mode: 'article', famille: categories.find((c) => c.id === a.categoryId) ?? boite.famille, article: a })}
          onDone={(message) => { setBoite(null); recharger(); push('success', message) }}
        />
      ) : null}
    </>
  )
}


/** L'unité où se dit la composition : le gramme pour un pur au kilo, le millilitre pour un pur au litre. */
function unitePetite(unitePur: string) {
  return unitePur === 'kg' ? 'gr' : unitePur === 'L' ? 'ml' : unitePur
}
/** Une quantité de pur, dite dans l'unité de la composition (0,25 kg → « 250 » gr). */
function versSaisie(q: number, unitePur: string): { q: string; u: string } {
  const petit = q < 1
  if (petit && unitePur === 'kg') return { q: String(Math.round(q * 1000 * 1000) / 1000), u: 'gr' }
  if (petit && unitePur === 'L') return { q: String(Math.round(q * 1000 * 1000) / 1000), u: 'ml' }
  return { q: String(Math.round(q * 1000) / 1000), u: unitePur }
}

/**
 * Créer une famille, la renommer, ou la supprimer quand elle est vide.
 *
 * Une famille peut avoir son article pur — l'escalope achetée au kilo — dont
 * on tire ses articles ; ou n'en avoir aucun. L'article pur ne se commande
 * jamais : seuls ses préparés vont aux départements.
 */
function BoiteFamille({ famille, total, lignes, onClose, onDone }: {
  famille: Categorie | null; total: number; lignes: Line[]; onClose: () => void; onDone: (message: string, id?: string) => void
}) {
  const { push } = useToast()
  const confirmer = useConfirm()
  const [nom, setNom] = React.useState(famille?.name ?? '')
  const purActuel = famille ? lignes.find((l) => l.categoryId === famille.id && l.kind === 'MERE') ?? null : null
  const [purId, setPurId] = React.useState(purActuel?.productId ?? '')
  const [busy, setBusy] = React.useState(false)
  const propre = nom.trim().replace(/\s+/g, ' ').toUpperCase()
  const pur = lignes.find((l) => l.productId === purId) ?? null
  const purChange = purId !== '' && purId !== purActuel?.productId
  const valide = propre.length >= 2 && (propre !== famille?.name || purChange)
  // Un article pur possible : ni préparé, ni déjà pur d'une autre famille.
  const candidats = lignes.filter((l) => !l.mother && (l.kind !== 'MERE' || l.productId === purActuel?.productId))

  const enregistrer = async () => {
    if (!valide || busy) return
    setBusy(true)
    try {
      let id = famille?.id ?? ''
      if (!famille) id = (await gql<{ createCategory: string }>(CREATE_CATEGORY, { name: propre })).createCategory
      else if (propre !== famille.name) await gql(RENAME_CATEGORY, { id: famille.id, name: propre })
      if (pur && purChange) await gql(SET_FAMILY_PURE, { categoryId: id, productId: pur.productId })
      onDone(famille ? `Famille ${propre} enregistrée.` : `Famille « ${propre} » créée${pur ? ` avec son article pur ${pur.productName}` : ''} : ajoutez-lui ses articles.`, famille ? undefined : id)
    } catch (e) { push('error', errorMessage(e)) } finally { setBusy(false) }
  }
  const supprimer = async () => {
    if (!famille) return
    const ok = await confirmer({ title: `Supprimer la famille ${famille.name} ?`, message: 'Elle est vide : elle disparaît du catalogue.', confirmLabel: 'Supprimer', tone: 'danger' })
    if (!ok) return
    setBusy(true)
    try {
      await gql(DELETE_CATEGORY, { id: famille.id })
      onDone(`Famille ${famille.name} supprimée.`)
    } catch (e) { push('error', errorMessage(e)) } finally { setBusy(false) }
  }

  return (
    <Modal title={famille ? 'Modifier la famille' : 'Nouvelle famille'} onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {famille ? (
            <Button variant="ghost" onClick={() => void supprimer()} disabled={busy || total > 0}
              title={total > 0 ? 'Déplacez d’abord ses articles dans une autre famille' : 'Supprimer la famille'}
              className="text-danger hover:bg-danger/10">
              <Trash2 className="size-4" /> Supprimer
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Annuler</Button>
            <Button variant="primary" loading={busy} disabled={!valide} onClick={() => void enregistrer()}>
              {!busy ? <Check className="size-4" /> : null}{famille ? 'Enregistrer' : 'Créer la famille'}
            </Button>
          </div>
        </div>
      }>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-[0.8rem] font-medium text-fg-muted">Nom de la famille</span>
          <input value={nom} onChange={(e) => setNom(e.target.value.toUpperCase())} autoFocus maxLength={80}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void enregistrer() } }}
            placeholder="VOLAILLES" className="field h-12 w-full px-4 text-[1rem] font-semibold uppercase" />
        </label>
        <div>
          <span className="mb-1.5 block text-[0.8rem] font-medium text-fg-muted">Article pur de la famille <span className="font-normal text-fg-subtle">(facultatif)</span></span>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <ComboSelect value={purId} onChange={setPurId} label="Article pur de la famille" placeholder="Sans article pur"
                searchPlaceholder="Rechercher un article (escalope, farine…)"
                options={candidats.map((l) => ({ value: l.productId, label: `${l.productName} (${l.unitSymbol})`, group: l.categoryName }))} />
            </div>
            {purId && !purActuel ? (
              <Button variant="ghost" size="sm" onClick={() => setPurId('')}>Aucun</Button>
            ) : null}
          </div>
          <p className="mt-1.5 text-[0.78rem] text-fg-muted">
            {pur
              ? <>L’article acheté tel quel dont on tire les articles de la famille. <strong className="text-fg">{pur.productName} ne se commande plus</strong> : seuls ses préparés vont aux départements.</>
              : 'Sans article pur, la famille rassemble simplement ses articles.'}
          </p>
        </div>
        {famille ? (
          <p className="text-[0.8rem] text-fg-muted">
            {total > 0 ? `${total} article${total > 1 ? 's' : ''} dans cette famille. Pour la supprimer, rangez-les d’abord dans une autre famille.` : 'Cette famille est vide : vous pouvez la supprimer.'}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

type ParDep = Record<string, { fixe: string; q: string; u: string }>

/**
 * La fiche d'un article.
 *
 * Un article pur ne se commande pas : sa fiche montre ce qu'on en prépare,
 * avec ce que contient chaque préparé. Tout autre article se commande ; pour
 * chaque département qui le commande, on règle son stock fixe et — s'il est
 * préparé — ce que contient une unité : la portion de la cuisine n'est pas
 * forcément celle du fast food.
 */
function BoiteArticle({ famille, article, lignes, unites, departements, categories, onClose, onOuvrir, onDone }: {
  famille: Categorie; article: Line | null; lignes: Line[]; unites: Unite[]; departements: Departement[]; categories: Categorie[]
  onClose: () => void; onOuvrir: (a: Line) => void; onDone: (message: string) => void
}) {
  const { push } = useToast()
  const [choisi, setChoisi] = React.useState<Line | null>(article)
  const [nouveau, setNouveau] = React.useState(false)
  const [recherche, setRecherche] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  // L'article pur de la famille : le pur par défaut d'un nouvel article.
  const purDeFamille = lignes.find((l) => l.categoryId === famille.id && l.kind === 'MERE') ?? null

  const depart = (l: Line | null, nom = '') => {
    const mereId = l ? (l.mother?.productId ?? '') : (purDeFamille?.productId ?? '')
    const mere = lignes.find((x) => x.productId === mereId) ?? null
    const parDep: ParDep = {}
    for (const d of departements) {
      const fixe = l?.stockFixes.find((f) => f.departmentId === d.id)?.quantity
      const c = l?.mother ? versSaisie(compositionPour(l, d.id), l.mother.unitSymbol) : { q: '', u: unitePetite(mere?.unitSymbol ?? 'kg') }
      parDep[d.id] = { fixe: fixe ? String(fixe) : '', q: c.q, u: c.u }
    }
    return {
      nom: l?.productName ?? nom,
      // Un nouvel article tiré d'un pur se compte d'ordinaire à la portion.
      unite: l?.unitSymbol ?? (mereId && unites.some((u) => u.symbol === 'p') ? 'p' : 'kg'),
      categorieId: l?.categoryId ?? famille.id,
      mereId,
      deps: l?.departmentIds ?? [],
      parDep,
    }
  }
  const [saisie, setSaisie] = React.useState(() => depart(article))
  const maj = (champs: Partial<ReturnType<typeof depart>>) => setSaisie((s) => ({ ...s, ...champs }))
  const majDep = (id: string, champs: Partial<ParDep[string]>) =>
    setSaisie((s) => ({ ...s, parDep: { ...s.parDep, [id]: { ...s.parDep[id], ...champs } } }))

  // Un article pur : ce que contient chacun de ses préparés.
  const estPur = !!choisi && (choisi.kind === 'MERE' || choisi.portions.length > 0)
  const enfants = choisi ? lignes.filter((x) => x.mother?.productId === choisi.productId)
    .sort((a, b) => (a.linkedAt ?? '9').localeCompare(b.linkedAt ?? '9') || a.productName.localeCompare(b.productName)) : []
  const uniforme = (x: Line) => {
    const v = x.departmentIds.map((d) => compositionPour(x, d))
    return v.every((n) => Math.abs(n - (v[0] ?? 0)) < 1e-9)
  }
  const [compos, setCompos] = React.useState<Record<string, { q: string; u: string }>>(() => Object.fromEntries(
    (article ? lignes.filter((x) => x.mother?.productId === article.productId) : []).map((x) => [x.productId, versSaisie(x.departmentIds.length > 0 ? compositionPour(x, x.departmentIds[0]) : x.mother!.motherQuantity, x.mother!.unitSymbol)])))
  const compoEnfant = (x: Line) => {
    const c = compos[x.productId]
    if (!c || !convertible(c.u, x.mother!.unitSymbol)) return null
    const v = versBase(toNumber(c.q), c.u, x.mother!.unitSymbol)
    return v !== null && Number.isFinite(v) && v > 0 ? v : null
  }
  const enfantsValides = enfants.every((x) => !uniforme(x) || compoEnfant(x) !== null)

  const choisir = (l: Line) => {
    if (l.kind === 'MERE' || l.portions.length > 0) { onOuvrir(l); return }
    setChoisi(l); setNouveau(false); setSaisie(depart(l))
  }

  const nomCherche = recherche.trim().replace(/\s+/g, ' ').toUpperCase()
  const existeDeja = lignes.some((l) => normaliser(l.productName) === normaliser(nomCherche))
  const candidats = lignes
    .filter((l) => l.categoryId !== famille.id && correspond(normaliser(recherche), l.productName, l.productRef, l.categoryName))
    .sort((a, b) => a.productName.localeCompare(b.productName))
    .slice(0, 30)

  const meres = lignes.filter((l) => !l.mother && l.productId !== choisi?.productId)
  const mere = lignes.find((l) => l.productId === saisie.mereId) ?? null
  // La composition d'un département, dans l'unité de l'article pur.
  const compoDep = (id: string) => {
    const c = saisie.parDep[id]
    if (!mere || !c || !convertible(c.u, mere.unitSymbol)) return null
    const v = versBase(toNumber(c.q), c.u, mere.unitSymbol)
    return v !== null && Number.isFinite(v) && v > 0 ? v : null
  }
  const nom = saisie.nom.trim().replace(/\s+/g, ' ')
  const fixesValides = saisie.deps.every((id) => { const v = (saisie.parDep[id]?.fixe ?? '').trim(); return v === '' || (Number.isFinite(toNumber(v)) && toNumber(v) >= 0) })
  const composValides = !mere || saisie.deps.every((id) => compoDep(id) !== null)
  // Un nouvel article préparé a besoin d'au moins un département pour dire ce qu'il contient.
  const prepareSansDep = !!mere && !choisi?.mother && saisie.deps.length === 0
  const valide = (!!choisi || nouveau) && nom.length >= 2 && saisie.unite !== '' && saisie.categorieId !== ''
    && (estPur ? enfantsValides : fixesValides && composValides && !prepareSansDep)
  const tousCoches = departements.length > 0 && departements.every((d) => saisie.deps.includes(d.id))
  const basculer = (id: string) => maj({ deps: saisie.deps.includes(id) ? saisie.deps.filter((x) => x !== id) : [...saisie.deps, id] })

  const enregistrer = async () => {
    if (!valide || busy) return
    setBusy(true)
    try {
      let productId: string
      const avant = choisi
      const premiere = saisie.deps.map((id) => compoDep(id)).find((v) => v !== null) ?? avant?.mother?.motherQuantity ?? null
      if (avant) {
        productId = avant.productId
        if (saisie.categorieId !== avant.categoryId) await gql(SET_CATEGORY, { productId, categoryId: saisie.categorieId })
        if (!estPur) {
          if (mere && premiere !== null && avant.mother?.productId !== mere.productId) {
            await gql(SET_PORTION, { productId, parentId: mere.productId, motherQuantity: premiere })
          } else if (!mere && avant.mother) {
            await gql(SET_PORTION, { productId, parentId: null, motherQuantity: null })
          }
        }
        const uniteChange = saisie.unite.toLowerCase() !== avant.unitSymbol.toLowerCase()
        if (nom !== avant.productName || uniteChange) await gql(RENAME_ARTICLE, { productId, name: nom, unit: uniteChange ? saisie.unite : null })
      } else if (mere && premiere !== null) {
        productId = (await gql<{ createPreparedProduct: string }>(CREATE_PREPARED, { parentId: mere.productId, name: nom, unit: saisie.unite, motherQuantity: premiere, categoryId: saisie.categorieId })).createPreparedProduct
      } else {
        productId = (await gql<{ createPureProduct: string }>(CREATE_PURE, { name: nom, unit: saisie.unite, categoryId: saisie.categorieId })).createPureProduct
      }

      if (estPur) {
        // Les préparés d'un pur : une seule valeur pour tous leurs départements.
        for (const x of enfants) {
          if (!uniforme(x)) continue
          const v = compoEnfant(x)
          const actuelle = x.departmentIds.length > 0 ? compositionPour(x, x.departmentIds[0]) : x.mother!.motherQuantity
          if (v === null || Math.abs(v - actuelle) < 1e-9) continue
          await gql(SET_PORTION, { productId: x.productId, parentId: productId, motherQuantity: v })
          if (x.departmentIds.length > 0) await gql(SET_COMPOSITIONS, { productId: x.productId, lines: x.departmentIds.map((d) => ({ departmentId: d, quantity: v })) })
        }
      } else {
        if ([...(avant?.departmentIds ?? [])].sort().join(',') !== [...saisie.deps].sort().join(',')) {
          await gql(SET_DEPARTMENTS, { productId, departmentIds: saisie.deps })
        }
        const lus = Object.fromEntries((avant?.stockFixes ?? []).map((f) => [f.departmentId, f.quantity]))
        const cibles = saisie.deps
          .map((id) => ({ departmentId: id, quantity: (saisie.parDep[id]?.fixe ?? '').trim() === '' ? 0 : toNumber(saisie.parDep[id].fixe) }))
          .filter((l) => Math.abs(l.quantity - (lus[l.departmentId] ?? 0)) > 1e-9)
        if (cibles.length > 0) await gql(SET_STOCK_FIXE, { productId, lines: cibles })
        if (mere) {
          await gql(SET_COMPOSITIONS, { productId, lines: saisie.deps.map((id) => ({ departmentId: id, quantity: compoDep(id)! })) })
        }
      }
      const ici = categories.find((c) => c.id === saisie.categorieId)?.name ?? famille.name
      onDone(choisi ? `${nom} enregistré — famille ${ici}.` : `${nom} ajouté à la famille ${ici}.`)
    } catch (e) { push('error', errorMessage(e)) } finally { setBusy(false) }
  }

  const optionsUnite = (unites.some((u) => u.symbol.toLowerCase() === saisie.unite.toLowerCase()) ? [] : [{ id: saisie.unite, symbol: saisie.unite, name: saisie.unite === 'p' ? 'Portion' : saisie.unite }]).concat(unites)
  const unitesCompo = (pur: string, actuelle: string) => [...new Set([...unitesCompatibles(pur), actuelle])]
  const nomUniteArticle = (unites.find((u) => u.symbol.toLowerCase() === saisie.unite.toLowerCase())?.name ?? (saisie.unite === 'p' ? 'portion' : saisie.unite)).toLowerCase()

  return (
    <Modal title={article ? (estPur ? 'Article pur' : 'Modifier l’article') : `Ajouter un article à ${famille.name}`} onClose={onClose} wide
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={onClose}>Annuler</Button>
          {choisi || nouveau ? (
            <Button variant="primary" loading={busy} disabled={!valide} onClick={() => void enregistrer()}>
              {!busy ? <Check className="size-4" /> : null}
              {article ? 'Enregistrer' : 'Ajouter l’article'}
            </Button>
          ) : null}
        </div>
      }>
      {!choisi && !nouveau ? (
        <div>
          <SearchField value={recherche} onChange={setRecherche} placeholder="Nom de l’article à ajouter…" autoFocus />
          {nomCherche.length >= 2 && !existeDeja ? (
            <button type="button" onClick={() => { setNouveau(true); setSaisie(depart(null, nomCherche)) }}
              className="mt-2 flex w-full items-center gap-2.5 rounded-xl border-2 border-dashed !border-ok/60 bg-ok/10 px-3 py-2.5 text-left transition-colors hover:bg-ok/20">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ok text-white"><Plus className="size-5" /></span>
              <span className="min-w-0">
                <span className="block truncate text-[0.92rem] font-bold text-fg">Créer « {nomCherche} »</span>
                <span className="block text-[0.76rem] text-fg-muted">Nouvel article, dans la famille {famille.name}{purDeFamille ? `, préparé à partir de ${purDeFamille.productName}` : ''}</span>
              </span>
            </button>
          ) : null}
          {recherche.trim() ? (
            <>
              <p className="mt-3 text-[0.74rem] font-semibold uppercase tracking-wide text-fg-subtle">Ou ranger dans {famille.name} un article existant</p>
              <div className="mt-1.5 flex max-h-72 flex-col gap-1.5 overflow-y-auto">
                {candidats.map((l) => (
                  <button key={l.productId} type="button" onClick={() => choisir(l)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-[rgb(var(--glass-edge)/0.25)] bg-white/60 px-3 py-2 text-left transition-colors hover:border-accent/40 hover:bg-white">
                    <span className="min-w-0">
                      <span className="block truncate text-[0.88rem] font-medium text-fg">{l.productName}</span>
                      <span className="block text-[0.72rem] text-fg-subtle">aujourd’hui dans {l.categoryName}</span>
                    </span>
                    <span className="shrink-0 text-[0.78rem] tabular-nums text-fg-muted">{l.unitSymbol}</span>
                  </button>
                ))}
                {candidats.length === 0 ? <p className="py-3 text-center text-[0.82rem] text-fg-muted">Aucun article existant ne correspond.</p> : null}
              </div>
            </>
          ) : (
            <p className="mt-3 text-[0.8rem] text-fg-muted">Tapez le nom de l’article : créez-le, ou rangez ici un article qui existe déjà dans une autre famille.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {nouveau ? (
            <p className="inline-flex items-center gap-1.5 rounded-full bg-ok px-2.5 py-1 text-[0.76rem] font-bold text-white">
              <Plus className="size-3.5" /> Nouvel article — il sera créé au catalogue
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <label className="block">
              <span className="mb-1.5 block text-[0.8rem] font-medium text-fg-muted">Nom de l’article</span>
              <input value={saisie.nom} onChange={(e) => maj({ nom: e.target.value })} autoFocus maxLength={120}
                onKeyDown={(e) => { if (e.key === 'Enter') void enregistrer() }}
                aria-label="Nom de l’article" className="field h-11 w-full px-3 text-[0.95rem] font-semibold" />
            </label>
            <div>
              <span className="mb-1.5 block text-[0.8rem] font-medium text-fg-muted">Unité</span>
              <ComboSelect value={saisie.unite} onChange={(v) => maj({ unite: v })} label="Unité de l’article" searchPlaceholder="Rechercher une unité…"
                options={optionsUnite.map((u) => ({ value: u.symbol, label: `${u.symbol} · ${u.name}` }))} />
            </div>
          </div>
          <div>
            <span className="mb-1.5 block text-[0.8rem] font-medium text-fg-muted">Famille</span>
            <ComboSelect value={saisie.categorieId} onChange={(v) => maj({ categorieId: v })} label="Famille de l’article" searchPlaceholder="Rechercher une famille…"
              options={categories.map((c) => ({ value: c.id, label: c.name }))} />
          </div>

          {estPur ? (
            /* Un article pur : il ne se commande pas ; on règle ses préparés. */
            <div className="rounded-xl border border-ok/35 bg-ok/[0.06] p-3">
              <p className="flex flex-wrap items-center gap-2 text-[0.88rem] font-bold text-fg">
                <FlaskConical className="size-4 text-ok" />
                Préparés à partir de {nom || choisi!.productName}
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[0.72rem] font-semibold text-fg-muted">{enfants.length}</span>
              </p>
              <p className="mt-0.5 text-[0.76rem] text-fg-muted">Article pur : il ne se commande pas, seuls ses préparés vont aux départements. Combien en contient une unité de chacun :</p>
              <div className="mt-2 max-h-80 space-y-1.5 overflow-y-auto pr-1">
                {enfants.length === 0 ? <p className="py-2 text-[0.8rem] text-fg-muted">Aucun préparé pour l’instant : ajoutez-les à la famille avec « ＋ Ajouter un article ».</p> : null}
                {enfants.map((x) => {
                  const nomU = (unites.find((u) => u.symbol.toLowerCase() === x.unitSymbol.toLowerCase())?.name ?? (x.unitSymbol === 'p' ? 'portion' : x.unitSymbol)).toLowerCase()
                  if (!uniforme(x)) {
                    // Une valeur par département : elle se règle sur la fiche du préparé.
                    return (
                      <div key={x.productId} className="flex flex-wrap items-center gap-2 rounded-lg border border-[rgb(var(--glass-edge)/0.25)] bg-white px-2.5 py-1.5">
                        <span className="min-w-0 flex-1 truncate text-[0.86rem] font-semibold text-fg">{x.productName}</span>
                        <span className="text-[0.78rem] text-fg-muted">
                          {departements.filter((d) => x.departmentIds.includes(d.id)).map((d) => `${d.name} ${formatContenu(compositionPour(x, d.id), x.mother!.unitSymbol)}`).join(' · ')}
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => onOuvrir(x)}><Pencil className="size-3.5" /> Régler</Button>
                      </div>
                    )
                  }
                  const c = compos[x.productId] ?? { q: '', u: 'gr' }
                  const faux = compoEnfant(x) === null
                  return (
                    <div key={x.productId} className={cn('flex flex-wrap items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5', faux ? 'border-danger/50' : 'border-[rgb(var(--glass-edge)/0.25)]')}>
                      <span className="min-w-0 flex-1 truncate text-[0.86rem] font-semibold text-fg" title={x.productName}>{x.productName}</span>
                      <input inputMode="decimal" value={c.q}
                        onChange={(e) => setCompos((m) => ({ ...m, [x.productId]: { ...c, q: e.target.value.replace(',', '.') } }))}
                        aria-label={`Quantité de ${choisi!.productName} dans ${x.productName}`}
                        className="field h-9 w-24 px-2 text-right text-[0.92rem] font-bold tabular-nums" />
                      <select value={c.u} onChange={(e) => setCompos((m) => ({ ...m, [x.productId]: { ...c, u: e.target.value } }))}
                        aria-label={`Unité de la quantité pour ${x.productName}`} className="field h-9 w-20 px-2 py-0 text-[0.86rem] font-semibold leading-none">
                        {unitesCompo(x.mother!.unitSymbol, c.u).map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <span className="w-28 truncate text-[0.78rem] text-fg-muted">par {nomU}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <>
              {/* L'article pur dont l'article est tiré : un seul, pour tous les départements. */}
              <div className="rounded-xl border border-[rgb(var(--glass-edge)/0.3)] bg-white/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[0.8rem] font-semibold text-fg-muted">
                    <FlaskConical className="size-4 text-ok" /> Préparé à partir de
                  </p>
                  {saisie.mereId ? (
                    <button type="button" onClick={() => maj({ mereId: '' })}
                      className="text-[0.76rem] font-semibold text-fg-muted underline-offset-2 hover:text-danger hover:underline">
                      Aucun : article acheté tel quel
                    </button>
                  ) : null}
                </div>
                <div className="mt-2">
                  <ComboSelect value={saisie.mereId} onChange={(v) => {
                    const m = lignes.find((l) => l.productId === v)
                    const u = unitePetite(m?.unitSymbol ?? 'kg')
                    setSaisie((s) => ({
                      ...s, mereId: v,
                      parDep: Object.fromEntries(Object.entries(s.parDep).map(([id, x]) => [id, { ...x, u: m && convertible(x.u, m.unitSymbol) ? x.u : u }])),
                      ...(nouveau && s.unite === 'kg' && unites.some((x) => x.symbol === 'p') ? { unite: 'p' } : {}),
                    }))
                  }} label="Article pur" placeholder="Aucun : article acheté tel quel" searchPlaceholder="Rechercher un article pur…"
                    options={meres.map((l) => ({ value: l.productId, label: `${l.productName} (${l.unitSymbol})`, group: l.categoryName }))} />
                </div>
                <p className="mt-1.5 text-[0.76rem] text-fg-subtle">
                  {mere ? `Ce que contient une unité se règle ci-dessous, pour chaque département.` : 'Laissez vide pour un article acheté tel quel.'}
                </p>
              </div>

              {/* Chaque département qui commande l'article : son stock fixe et, pour un préparé, sa composition. */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[0.8rem] font-medium text-fg-muted">
                    Départements <span className="font-normal text-fg-subtle">— cochez-en un pour le régler</span>
                    {prepareSansDep ? <span className="ml-1.5 font-semibold text-danger">— choisissez-en au moins un</span> : null}
                  </p>
                  <button type="button" aria-pressed={tousCoches} onClick={() => maj({ deps: tousCoches ? [] : departements.map((d) => d.id) })}
                    className={cn('inline-flex h-9 items-center gap-1.5 rounded-full border-2 px-3 text-[0.8rem] font-bold transition-colors',
                      tousCoches ? 'border-[#103528] bg-[#103528] text-white' : 'border-[#103528]/40 bg-white/70 text-[#103528] hover:bg-[#103528]/10')}>
                    {tousCoches ? <Check className="size-4" /> : <Building2 className="size-4" />}
                    Tous les départements
                  </button>
                </div>
                <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                  {departements.map((d) => {
                    const coche = saisie.deps.includes(d.id)
                    const c = saisie.parDep[d.id] ?? { fixe: '', q: '', u: 'gr' }
                    const v = compoDep(d.id)
                    return (
                      <div key={d.id}
                        className={cn('rounded-xl border-2 transition-colors', coche ? 'bg-white sm:col-span-2' : 'bg-white/50')}
                        style={{ borderColor: coche ? d.color : `${d.color}40` }}>
                        <button type="button" aria-pressed={coche} onClick={() => basculer(d.id)}
                          className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left">
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg text-white transition-opacity" style={{ background: d.color, opacity: coche ? 1 : 0.55 }}>
                            {coche ? <Check className="size-4" /> : <Icon name={d.icon ?? 'Building2'} className="size-4" />}
                          </span>
                          <span className={cn('min-w-0 flex-1 truncate text-[0.88rem]', coche ? 'font-bold text-fg' : 'font-medium text-fg-muted')}>{d.name}</span>
                          {!coche ? <span className="text-[0.72rem] text-fg-subtle">ne commande pas</span> : null}
                        </button>
                        {coche ? (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-3 py-2.5" style={{ borderColor: `${d.color}33` }}>
                            <label className="flex items-center gap-2 text-[0.84rem] text-fg">
                              <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-fg-muted">Stock fixe</span>
                              <input inputMode="decimal" value={c.fixe} placeholder="0"
                                onChange={(e) => { const x = e.target.value.replace(',', '.'); if (x === '' || /^\d*\.?\d*$/.test(x)) majDep(d.id, { fixe: x }) }}
                                aria-label={`Stock fixe pour ${d.name}`} className="field h-10 w-24 px-2 text-right text-[0.95rem] font-bold tabular-nums" />
                              <span className="text-[0.8rem] text-fg-muted">{saisie.unite}</span>
                            </label>
                            {mere ? (
                              <label className="flex flex-wrap items-center gap-2 text-[0.84rem] text-fg">
                                <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-fg-muted">Composition</span>
                                <span>1 {saisie.unite} contient</span>
                                <input inputMode="decimal" value={c.q} placeholder="250"
                                  onChange={(e) => majDep(d.id, { q: e.target.value.replace(',', '.') })}
                                  aria-label={`Composition pour ${d.name}`}
                                  className={cn('field h-10 w-24 px-2 text-right text-[0.95rem] font-bold tabular-nums', v === null && '!border-danger/60')} />
                                <select value={c.u} onChange={(e) => majDep(d.id, { u: e.target.value })}
                                  aria-label={`Unité de la composition pour ${d.name}`} className="field h-10 w-20 px-2 py-0 text-[0.86rem] font-semibold leading-none">
                                  {unitesCompo(mere.unitSymbol, c.u).map((u) => <option key={u} value={u}>{u}</option>)}
                                </select>
                                <span>de {mere.productName}</span>
                              </label>
                            ) : null}
                            {mere && v !== null ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-ok/10 px-2 py-0.5 text-[0.78rem] font-bold text-ok">
                                <FlaskConical className="size-3.5" /> {formatContenu(v, mere.unitSymbol)} par {nomUniteArticle}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
                <p className="mt-1.5 text-[0.74rem] text-fg-subtle">
                  {saisie.deps.length === 0 ? 'Aucun département : l’article ne figure sur aucune feuille de commande.'
                    : `${saisie.deps.length} département${saisie.deps.length > 1 ? 's' : ''}. Sans stock fixe, l’article figure sur la feuille mais ne commande rien.`}
                  {mere && !composValides ? <span className="ml-1 font-semibold text-danger">Chaque département coché doit avoir sa composition.</span> : null}
                </p>
              </div>
            </>
          )}
          {!article ? (
            <button type="button" onClick={() => { setChoisi(null); setNouveau(false); setRecherche('') }} className="text-[0.8rem] font-semibold text-accent hover:underline">
              ← Choisir un autre article
            </button>
          ) : null}
        </div>
      )}
    </Modal>
  )
}
