'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Loader2, PackagePlus, Scissors, Trash2, Warehouse, AlertTriangle, Pencil, History, ArrowDownToLine, Plus, Search, Building2, Check, CalendarDays, ChevronDown, LayoutGrid, Leaf, Box, FlaskConical } from 'lucide-react'

/**
 * Les filtres de nature, chacun de sa couleur : bleu pour tout, vert pour
 * les articles purs (la matière), ambre pour les pièces, violet pour les
 * préparés (ce qu'on a tiré d'un article pur).
 */
const FILTRES_NATURE = [
  { v: 'tous', l: 'Tous', k: null, icone: LayoutGrid,
    actif: 'border-[#2f7fe0] bg-gradient-to-r from-[#3a8ef0] to-[#2f7fe0] text-white shadow-[0_8px_18px_-8px_rgb(47_127_224/0.8)]',
    repos: 'border-[#2f7fe0]/45 bg-[#2f7fe0]/8 text-[#1f5fb0] hover:bg-[#2f7fe0]/15' },
  { v: 'MERE', l: 'Articles purs', k: 'MERE', icone: Leaf,
    actif: 'border-[#0f9b6c] bg-gradient-to-r from-[#17b07c] to-[#0f9b6c] text-white shadow-[0_8px_18px_-8px_rgb(15_155_108/0.8)]',
    repos: 'border-[#0f9b6c]/45 bg-[#0f9b6c]/8 text-[#0b7a55] hover:bg-[#0f9b6c]/15' },
  { v: 'FINI', l: 'Articles pièce', k: 'FINI', icone: Box,
    actif: 'border-[#e07f16] bg-gradient-to-r from-[#f39a2e] to-[#e07f16] text-white shadow-[0_8px_18px_-8px_rgb(224_127_22/0.8)]',
    repos: 'border-[#e07f16]/45 bg-[#e07f16]/8 text-[#b4630f] hover:bg-[#e07f16]/15' },
  { v: 'PREPARE', l: 'Articles préparés', k: 'PREPARE', icone: FlaskConical,
    actif: 'border-[#7c3aed] bg-gradient-to-r from-[#8b5cf6] to-[#7c3aed] text-white shadow-[0_8px_18px_-8px_rgb(124_58_237/0.8)]',
    repos: 'border-[#7c3aed]/45 bg-[#7c3aed]/8 text-[#6d28d9] hover:bg-[#7c3aed]/15' },
] as const
import { GlassCard, Button, Badge, EmptyState, TableWrap, Th, Td, usePending } from '@/components/ui/glass'
import { Modal } from '@/components/ui/modal'
import { SearchField } from '@/components/ui/search-field'
import { DateField } from '@/components/ui/date-field'
import { useConfirm } from '@/components/ui/confirm'
import { useToast } from '@/components/ui/toast'
import { gql, errorMessage } from '@/lib/graphql-client'
import { correspond, normaliser } from '@/lib/search'
import { unitesCompatibles, versBase } from '@/lib/units'
import { cn, formatDate, formatMoney, formatQty, formatTime, formatPeriod, toNumber, toDateKey } from '@/lib/utils'

const QUERY = /* GraphQL */ `
  query GeneralStock {
    generalStock {
      totalValue
      negativeCount
      lines {
        productId productName productRef categoryName unitSymbol kind
        mother { productId productName unitSymbol motherQuantity }
        portions { productId productName productRef unitSymbol motherQuantity }
        entered delivered prepared stock unitCost stockValue lastEntryAt
      }
    }
    stockEntries(limit: 200) {
      id quantity unitPrice total reference note businessDay createdAt
      product { id name reference baseUnit { symbol } }
      createdBy { fullName }
      supplier { id name phone taxId }
    }
    stockProducts { id name reference category { name } baseUnit { symbol } }
  }
`
const ENTRIES_OF = /* GraphQL */ `
  query EntriesOf($productId: ID!) {
    stockEntries(productId: $productId, limit: 500) {
      id type quantity unitPrice total reference businessDay createdAt
      supplier { name }
    }
  }
`
const SUPPLIERS = /* GraphQL */ `query Suppliers { suppliers { id name phone taxId } units { id name symbol } }`
const ADD_PREPARATION = /* GraphQL */ `
  mutation AddPreparation($sourceId: ID!, $productId: ID!, $quantityUsed: Float!, $quantityMade: Float!, $madeUnit: String, $day: Date, $note: String) {
    addPreparation(sourceId: $sourceId, productId: $productId, quantityUsed: $quantityUsed, quantityMade: $quantityMade, madeUnit: $madeUnit, day: $day, note: $note)
  }
`
const CREATE_UNIT = /* GraphQL */ `mutation CreateUnit($name: String!, $symbol: String!) { createUnit(name: $name, symbol: $symbol) { id name symbol } }`
const ENTRIES_PERIOD = /* GraphQL */ `
  query EntriesPeriod($from: Date, $to: Date) {
    stockEntries(from: $from, to: $to, limit: 5000) {
      id quantity unitPrice total reference note businessDay createdAt
      product { id name reference baseUnit { symbol } }
      createdBy { fullName }
      supplier { id name phone taxId }
    }
  }
`
const ADD_ENTRIES = /* GraphQL */ `
  mutation AddEntries($supplier: SupplierInput, $reference: String, $note: String, $day: Date, $lines: [StockEntryLineInput!]!) {
    addStockEntries(supplier: $supplier, reference: $reference, note: $note, day: $day, lines: $lines)
  }
`
const DELETE_ENTRY = /* GraphQL */ `
  mutation DeleteStockEntry($id: ID!) { deleteStockEntry(id: $id) }
`
const SET_KIND = /* GraphQL */ `
  mutation SetKind($productId: ID!, $kind: ProductKind!) { setProductKind(productId: $productId, kind: $kind) { id } }
`
const SET_LEVEL = /* GraphQL */ `
  mutation SetLevel($productId: ID!, $quantity: Float!, $unitCost: Float!, $note: String) {
    setStockLevel(productId: $productId, quantity: $quantity, unitCost: $unitCost, note: $note)
  }
`
const SET_PORTION = /* GraphQL */ `
  mutation SetPortion($productId: ID!, $parentId: ID, $motherQuantity: Float) {
    setProductPortion(productId: $productId, parentId: $parentId, motherQuantity: $motherQuantity) { id }
  }
`

/** 0,3 kg se lit « 300 g », 0,25 L « 250 ml » : l'unité de la portion, pas du sac. */
function formatMere(q: number, unit: string): string {
  if (unit === 'kg' && q < 1) return `${formatQty(q * 1000)} g`
  if (unit === 'L' && q < 1) return `${formatQty(q * 1000)} ml`
  return `${formatQty(q)} ${unit}`
}

type Portion = { productId: string; productName: string; productRef: string; unitSymbol: string; motherQuantity: number }
type Kind = 'FINI' | 'MERE' | 'PREPARE'
type Line = {
  productId: string; productName: string; productRef: string; categoryName: string; unitSymbol: string
  kind: Kind
  mother: { productId: string; productName: string; unitSymbol: string; motherQuantity: number } | null
  portions: Portion[]; entered: number; delivered: number; prepared: number; stock: number; unitCost: number | null
  stockValue: number; lastEntryAt: string | null
}
const NATURES: Record<Kind, { label: string; tone: 'accent' | 'ok' | 'warn' }> = {
  MERE: { label: 'Pure', tone: 'accent' },
  FINI: { label: 'Pièce', tone: 'ok' },
  PREPARE: { label: 'Préparé', tone: 'warn' },
}
type Entry = {
  id: string; quantity: number; unitPrice: number; total: number; reference: string | null; note: string | null
  businessDay: string; createdAt: string
  product: { id: string; name: string; reference: string; baseUnit: { symbol: string } }
  createdBy: { fullName: string }
  supplier: { id: string; name: string; phone: string | null; taxId: string | null } | null
}
type Produit = { id: string; name: string; reference: string; category: { name: string }; baseUnit: { symbol: string } }
type Data = { generalStock: { totalValue: number; negativeCount: number; lines: Line[] }; stockEntries: Entry[]; stockProducts: Produit[] }

/**
 * Le stock général, pour l'économat et l'administration.
 *
 * Une ligne par article mère (ou vendu tel quel) : entré, sorti, reste,
 * coût moyen, valeur. Les portions se lisent sous leur mère. On y saisit
 * les arrivages, et l'administration y règle le portionnage.
 */
export function GeneralStock({ admin, base }: { admin: boolean; base: '/economat' | '/admin' }) {
  const router = useRouter()
  const confirmer = useConfirm()
  const { push } = useToast()
  const [data, setData] = React.useState<Data | null>(null)
  const [erreur, setErreur] = React.useState<string | null>(null)
  const [recherche, setRecherche] = React.useState('')
  const [nature, setNature] = React.useState<'tous' | Kind>('tous')
  const [negatifs, setNegatifs] = React.useState(false)
  const [entree, setEntree] = React.useState(false)
  const [journal, setJournal] = React.useState(false)
  const [portion, setPortion] = React.useState<Line | null>(null)
  const [modif, setModif] = React.useState<Line | null>(null)
  const [detailCout, setDetailCout] = React.useState<Line | null>(null)
  const [preparation, setPreparation] = React.useState(false)
  const [suppression, runSuppression] = usePending()
  const [version, setVersion] = React.useState(0)
  const recharger = () => setVersion((v) => v + 1)

  React.useEffect(() => {
    let vivant = true
    gql<Data>(QUERY).then((d) => { if (vivant) setData(d) }).catch((e) => { if (vivant) setErreur(errorMessage(e)) })
    return () => { vivant = false }
  }, [version])

  const mot = normaliser(recherche)
  const lignes = (data?.generalStock.lines ?? []).filter((l) =>
    (nature === 'tous' || l.kind === nature)
    && (!negatifs || l.stock < -1e-9)
    && correspond(mot, l.productName, l.productRef, l.categoryName, l.mother?.productName, ...l.portions.map((p) => p.productName)))
  const aujourdhui = toDateKey(new Date())
  // L'administration choisit la journée, ou une période : la carte en donne
  // le total, et la liste s'ouvre sur la même. Par défaut, la journée en
  // cours. L'économat, lui, lit toujours le jour.
  const [periode, setPeriode] = React.useState<{ du: string; au: string | null }>({ du: aujourdhui, au: null })
  const [choixDates, setChoixDates] = React.useState(false)
  const boutonDates = React.useRef<HTMLButtonElement>(null)
  const panneauDates = React.useRef<HTMLDivElement>(null)
  const [posDates, setPosDates] = React.useState<{ right: number; width: number; top?: number; bottom?: number } | null>(null)
  React.useLayoutEffect(() => {
    if (!choixDates) { setPosDates(null); return }
    const maj = () => {
      const r = boutonDates.current?.getBoundingClientRect(); if (!r) return
      const width = Math.min(24 * 16, window.innerWidth - 16)
      // Aligné sur le bord droit de l'icône, sans sortir de l'écran.
      const right = Math.max(8, Math.min(window.innerWidth - r.right, window.innerWidth - width - 8))
      const enBas = window.innerHeight - r.bottom
      if (enBas < 300 && r.top > enBas) setPosDates({ right, width, bottom: window.innerHeight - r.top + 10 })
      else setPosDates({ right, width, top: r.bottom + 10 })
    }
    maj()
    window.addEventListener('scroll', maj, true); window.addEventListener('resize', maj)
    return () => { window.removeEventListener('scroll', maj, true); window.removeEventListener('resize', maj) }
  }, [choixDates])
  // Cliquer ailleurs referme le panneau — sauf dans un calendrier ouvert
  // depuis lui, qui flotte lui aussi hors du panneau.
  React.useEffect(() => {
    if (!choixDates) return
    const auClic = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (panneauDates.current?.contains(t) || boutonDates.current?.contains(t) || t.closest?.('[aria-label="Calendrier"]')) return
      setChoixDates(false)
    }
    const auClavier = (e: KeyboardEvent) => { if (e.key === 'Escape') setChoixDates(false) }
    document.addEventListener('mousedown', auClic); document.addEventListener('keydown', auClavier)
    return () => { document.removeEventListener('mousedown', auClic); document.removeEventListener('keydown', auClavier) }
  }, [choixDates])
  const surAujourdhui = periode.du === aujourdhui && (periode.au === null || periode.au === aujourdhui)
  const libellePeriode = surAujourdhui ? 'aujourd’hui' : formatPeriod(periode.du, periode.au ?? periode.du)
  const [entreesPeriode, setEntreesPeriode] = React.useState<Entry[] | null>(null)
  React.useEffect(() => {
    if (!admin) return
    let vivant = true
    const fin = periode.au ?? periode.du
    const [from, to] = periode.du <= fin ? [periode.du, fin] : [fin, periode.du]
    gql<{ stockEntries: Entry[] }>(ENTRIES_PERIOD, { from, to }).then((d) => { if (vivant) setEntreesPeriode(d.stockEntries) }).catch(() => {})
    return () => { vivant = false }
  }, [admin, periode, version])
  const entreesJour = React.useMemo(
    () => (admin
      ? (entreesPeriode ?? [])
      : (data?.stockEntries ?? []).filter((e) => e.businessDay.slice(0, 10) === aujourdhui)),
    [admin, entreesPeriode, data, aujourdhui],
  )
  // Le journal du jour se lit fournisseur par fournisseur : une pastille
  // chacun, « Tout » pour l'ensemble, « Sans fournisseur » pour le reste.
  const [fournisseurVu, setFournisseurVu] = React.useState<string | null>(null)
  // La recherche parmi les fournisseurs du jour : nom, téléphone, matricule, facture.
  const [rechercheFournisseur, setRechercheFournisseur] = React.useState('')
  const fournisseursJour = React.useMemo(() => {
    const m = new Map<string, { nom: string; phone: string | null; taxId: string | null; n: number; total: number; references: Set<string> }>()
    for (const e of entreesJour) {
      const cle = e.supplier?.id ?? ''
      const f = m.get(cle) ?? { nom: e.supplier?.name ?? 'Sans fournisseur', phone: e.supplier?.phone ?? null, taxId: e.supplier?.taxId ?? null, n: 0, total: 0, references: new Set<string>() }
      f.n += 1; f.total += e.total
      if (e.reference) f.references.add(e.reference)
      m.set(cle, f)
    }
    return [...m.entries()].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[1].nom.localeCompare(b[1].nom)))
  }, [entreesJour])
  // « tout » : la journée entière ; un identifiant : ce fournisseur seul.
  const entreesVues = fournisseurVu === null || fournisseurVu === 'tout' ? entreesJour : entreesJour.filter((e) => (e.supplier?.id ?? '') === fournisseurVu)
  const fournisseurChoisi = fournisseurVu !== null && fournisseurVu !== 'tout' ? fournisseursJour.find(([cle]) => cle === fournisseurVu)?.[1] ?? null : null
  const totalJour = entreesJour.reduce((s, e) => s + e.total, 0)
  const compte = (k: Kind) => (data?.generalStock.lines ?? []).filter((l) => l.kind === k).length

  const supprimerEntree = async (e: Entry) => {
    const ok = await confirmer({
      title: 'Retirer cette entrée ?',
      message: `${formatQty(e.quantity)} ${e.product.baseUnit.symbol} de ${e.product.name} à ${formatMoney(e.unitPrice)} l’unité. Le stock et sa valeur seront recalculés.`,
      confirmLabel: 'Retirer', tone: 'danger',
    })
    if (!ok) return
    try {
      await gql(DELETE_ENTRY, { id: e.id })
      push('success', 'Entrée retirée.')
      recharger()
    } catch (err) { push('error', errorMessage(err)) }
  }

  return (
    <div className="space-y-4">
      {/* L'argent ne se lit qu'en administration : l'économat voit les
          quantités, pas ce qu'elles valent. */}
      <div className={cn('grid gap-3 sm:grid-cols-2', admin ? 'xl:grid-cols-4' : 'xl:grid-cols-3')}>
        {admin ? (
          <GlassCard className="p-4">
            <p className="text-[0.74rem] font-semibold uppercase tracking-wide text-fg-muted">Valeur du stock</p>
            <p className="mt-1 text-[1.5rem] font-bold tabular-nums text-fg">{data ? formatMoney(data.generalStock.totalValue) : '…'}</p>
            <p className="text-[0.78rem] text-fg-muted">Entrées − livraisons, au coût moyen</p>
          </GlassCard>
        ) : null}
        {/* Les entrées du jour, en carte : un clic ouvre leur liste. Le
            passé, lui, se lit dans l'historique. */}
        <GlassCard className="relative h-full border-danger/30 transition-colors hover:bg-danger/[0.04]">
          <button type="button" onClick={() => setJournal(true)} className="block h-full w-full p-4 text-left">
            <p className="flex items-center gap-1.5 pr-10 text-[0.74rem] font-semibold uppercase tracking-wide text-danger"><ArrowDownToLine className="size-3.5" /> Entrées {libellePeriode}</p>
            <p className="mt-1 text-[1.5rem] font-bold tabular-nums text-fg">{data ? (admin ? formatMoney(totalJour) : `${entreesJour.length} arrivage${entreesJour.length > 1 ? 's' : ''}`) : '…'}</p>
            <p className="text-[0.78rem] text-fg-muted">{data ? (admin ? `${entreesJour.length} arrivage${entreesJour.length > 1 ? 's' : ''} · voir la liste` : 'voir la liste') : '…'}</p>
          </button>
          {/* L'administration choisit la journée ou la période, depuis la
              carte : le total suit, la liste aussi. */}
          {admin ? (
            <div className="absolute right-3 top-3">
              <button ref={boutonDates} type="button" onClick={() => setChoixDates((v) => !v)} aria-expanded={choixDates} aria-label="Choisir la journée ou la période"
                title="Choisir la journée ou la période"
                className={cn('grid size-8 place-items-center rounded-lg border transition-colors', surAujourdhui ? 'border-[rgb(var(--glass-edge)/0.34)] bg-white/70 text-fg-muted hover:text-fg' : 'border-accent/40 bg-accent/12 text-accent')}>
                <CalendarDays className="size-4" />
              </button>
            </div>
          ) : null}
        </GlassCard>
        {/* Le choix des dates s'ouvre depuis la carte, accroché à son icône :
            un panneau enfant de la carte, pas une boîte au milieu de l'écran.
            Il flotte hors du flux (portal) pour que rien ne le coupe, et se
            recale au bord de l'écran sur un téléphone. */}
        {admin && choixDates && posDates ? createPortal(
          <div
            ref={panneauDates}
            role="dialog"
            aria-label="Journée ou période des entrées"
            style={{ position: 'fixed', top: posDates.top, bottom: posDates.bottom, right: posDates.right, width: posDates.width }}
            className="animate-rise z-[60] rounded-2xl border border-danger/30 bg-white p-4 shadow-[0_18px_40px_-16px_rgb(var(--shadow-ambient)/0.55)]"
          >
            {/* La pointe : le panneau sort de l'icône de la carte. */}
            <span aria-hidden className={cn('absolute right-4 size-3 rotate-45 border-danger/30 bg-white', posDates.top !== undefined ? '-top-1.5 border-l border-t' : '-bottom-1.5 border-b border-r')} />
            <p className="flex items-center gap-1.5 text-[0.74rem] font-semibold uppercase tracking-wide text-danger"><CalendarDays className="size-3.5" /> Journée ou période</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-[0.8rem] font-medium text-fg-muted">Du
                <div className="mt-1"><DateField value={periode.du} max={aujourdhui} onChange={(v) => { if (v) setPeriode((p) => ({ ...p, du: v, au: p.au && p.au < v ? null : p.au })) }} label="Du" className="w-full" /></div>
              </label>
              <label className="block text-[0.8rem] font-medium text-fg-muted">Au <span className="font-normal text-fg-subtle">(facultatif)</span>
                <div className="mt-1"><DateField value={periode.au} min={periode.du} max={aujourdhui} clearable onChange={(v) => setPeriode((p) => ({ ...p, au: v }))} label="Au" className="w-full" /></div>
              </label>
            </div>
            <p className="mt-3 rounded-xl bg-danger/[0.06] px-3 py-2 text-[0.85rem] text-fg">
              Entrées <span className="font-semibold">{libellePeriode}</span> : <span className="font-bold tabular-nums">{formatMoney(totalJour)}</span> · {entreesJour.length} arrivage{entreesJour.length > 1 ? 's' : ''}
            </p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setPeriode({ du: aujourdhui, au: null }); setChoixDates(false) }}>Aujourd’hui</Button>
              <Button variant="primary" size="sm" onClick={() => setChoixDates(false)}><Check className="size-3.5" />Appliquer</Button>
            </div>
          </div>,
          document.body,
        ) : null}
        {/* Les préparations : ce que l'économat tire chaque jour des articles
            purs. La carte ouvre leur journal, d'où l'on en saisit une nouvelle. */}
        <button type="button" onClick={() => setNature((n) => (n === 'PREPARE' ? 'tous' : 'PREPARE'))} aria-pressed={nature === 'PREPARE'} className="text-left">
          <GlassCard className={cn('h-full border-warn/40 p-4 transition-colors hover:bg-warn/[0.05]', nature === 'PREPARE' && 'ring-2 ring-warn/40')}>
            <p className="flex items-center gap-1.5 text-[0.74rem] font-semibold uppercase tracking-wide text-warn"><Scissors className="size-3.5" /> Préparations</p>
            <p className="mt-1 text-[1.5rem] font-bold tabular-nums text-fg">{data ? `${data.generalStock.lines.filter((l) => l.kind === 'PREPARE').length} article${data.generalStock.lines.filter((l) => l.kind === 'PREPARE').length > 1 ? 's' : ''}` : '…'}</p>
            <p className="text-[0.78rem] text-fg-muted">{nature === 'PREPARE' ? 'filtre actif · cliquer pour tout revoir' : 'préparés à partir d’un article pur · cliquer pour les voir'}</p>
          </GlassCard>
        </button>
        <button type="button" onClick={() => setNegatifs((v) => !v)} aria-pressed={negatifs} className="text-left">
          {/* Une rupture se voit de loin : la carte entière passe au rouge
              plein, texte en blanc. Sans rupture, elle reste neutre. */}
          <GlassCard className={cn('h-full p-4 transition-[filter,box-shadow]',
            (data?.generalStock.negativeCount ?? 0) > 0
              ? '!border-[#a3122c] !bg-[#c81e3a] text-white shadow-[0_12px_28px_-12px_rgb(200_30_58/0.7)] hover:brightness-110'
              : 'hover:bg-[rgb(var(--glass-edge)/0.08)]',
            negatifs && 'ring-4 ring-[#c81e3a]/35')}>
            <p className={cn('flex items-center gap-1.5 text-[0.74rem] font-bold uppercase tracking-wide', (data?.generalStock.negativeCount ?? 0) > 0 ? 'text-white' : 'text-fg-muted')}>
              {(data?.generalStock.negativeCount ?? 0) > 0 ? <AlertTriangle className="size-3.5" /> : null}
              Rupture de stock
            </p>
            <p className={cn('mt-1 text-[1.5rem] font-bold tabular-nums', (data?.generalStock.negativeCount ?? 0) > 0 ? 'text-white' : 'text-fg')}>{data?.generalStock.negativeCount ?? '…'}</p>
            <p className={cn('text-[0.78rem]', (data?.generalStock.negativeCount ?? 0) > 0 ? 'font-medium text-white/90' : 'text-fg-muted')}>{negatifs ? 'filtre actif · cliquer pour tout revoir' : 'plus sorti qu’entré : cliquer pour les voir'}</p>
          </GlassCard>
        </button>
      </div>

      <GlassCard overflowVisible>
        <div className="flex flex-wrap items-center gap-2 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
          <SearchField value={recherche} onChange={setRecherche} className="min-w-0 flex-1 basis-56 sm:max-w-md" />
          {/* Quatre natures, quatre couleurs : on lit le filtre actif à sa
              teinte, sans chercher lequel est surligné. Le choisi se remplit
              en plein ; les autres gardent un liseré de leur couleur. */}
          <div className="flex flex-wrap items-center gap-2">
            {FILTRES_NATURE.map(({ v, l, k, icone: Icone, actif, repos }) => (
              <button key={v} type="button" onClick={() => setNature(v)} aria-pressed={nature === v}
                className={cn(
                  'inline-flex h-10 items-center gap-1.5 rounded-full border-2 px-3.5 text-[0.85rem] font-bold transition-[filter,transform,background-color,color,box-shadow] duration-150',
                  'hover:-translate-y-px hover:brightness-105 active:translate-y-px',
                  nature === v ? actif : repos,
                )}>
                <Icone className="size-4" />
                {l}
                {data && k ? (
                  <span className={cn('ml-0.5 rounded-full px-1.5 py-0.5 text-[0.72rem] font-bold tabular-nums',
                    nature === v ? 'bg-white/25 text-white' : 'bg-current/10')}>
                    {compte(k)}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setPreparation(true)} disabled={!data} title="Tirer un article préparé d'un article pur"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#103528] bg-[#103528] px-4 text-[0.875rem] font-semibold text-white shadow-[0_6px_16px_-8px_rgb(16_53_40/0.7)] transition-[filter,transform] hover:brightness-110 active:translate-y-px disabled:opacity-55">
            <Scissors className="size-4" />
            Nouvelle préparation
          </button>
          <Button variant="primary" size="sm" className="ml-auto" onClick={() => setEntree(true)}>
            <PackagePlus className="size-3.5" />
            Nouvelle entrée
          </Button>
        </div>

        {erreur ? (
          <p role="alert" className="px-4 py-4 text-[0.85rem] font-medium text-danger">{erreur}</p>
        ) : data === null ? (
          <p className="flex items-center gap-2 px-4 py-6 text-[0.85rem] text-fg-muted"><Loader2 className="size-4 animate-spin" /> Chargement…</p>
        ) : lignes.length === 0 ? (
          <EmptyState icon={<Warehouse className="size-6" />} title="Aucun article" description="Aucun article ne correspond à ce filtre." />
        ) : (
          <TableWrap minWidth="60rem">
            <thead>
              <tr>
                <Th className="w-full">Article</Th>
                <Th>Nature</Th>
                <Th className="text-right">Entré</Th>
                <Th className="text-right">Sorti</Th>
                <Th className="text-right">Stock</Th>
                {admin ? <Th className="text-right">Coût moyen</Th> : null}
                {admin ? <Th className="text-right">Valeur</Th> : null}
                <Th className="w-40" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
              {lignes.map((l, i) => {
                const negatif = l.stock < -1e-9
                const ouvre = i === 0 || lignes[i - 1].categoryName !== l.categoryName
                return (
                  <React.Fragment key={l.productId}>
                    {ouvre ? (
                      <tr><td colSpan={admin ? 8 : 6} className="bg-ok/12 px-3 py-1.5 text-[0.74rem] font-bold uppercase tracking-[0.06em] text-ok">{l.categoryName}</td></tr>
                    ) : null}
                    {/* Une rupture se lit d'un coup : la ligne entière en rouge
                        franc, un liseré épais à gauche, le stock en blanc sur rouge. */}
                    <tr className={cn(negatif ? 'bg-[#c81e3a]/[0.16] shadow-[inset_6px_0_0_0_#c81e3a]' : l.kind === 'PREPARE' && 'bg-warn/[0.04]')}>
                      <Td className="max-w-0">
                        <p className="truncate text-[0.85rem] font-medium text-fg">{l.productName}</p>
                        <p className="truncate font-mono text-[0.7rem] text-fg-subtle">{l.productRef}{l.lastEntryAt ? <span className="ml-2 font-sans">dernière entrée {formatDate(l.lastEntryAt)}</span> : null}</p>
                        {l.mother ? (
                          <p className="mt-0.5 text-[0.74rem] text-fg-muted">← {l.mother.productName} · {formatMere(l.mother.motherQuantity, l.mother.unitSymbol)} par portion</p>
                        ) : null}
                        {l.portions.length > 0 ? (
                          <p className="mt-1 flex flex-wrap gap-1">
                            {l.portions.map((p) => (
                              <button key={p.productId} type="button" onClick={() => setPortion(l)}
                                className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[0.72rem] font-medium text-accent disabled:cursor-default">
                                <Scissors className="size-3" />{p.productName} · {formatMere(p.motherQuantity, l.unitSymbol)}
                              </button>
                            ))}
                          </p>
                        ) : null}
                      </Td>
                      <Td><Badge tone={NATURES[l.kind].tone}>{NATURES[l.kind].label}</Badge></Td>
                      {(
                        <>
                          <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">
                            {formatQty(l.entered)} {l.unitSymbol}
                            {l.kind === 'PREPARE' ? <span className="block text-[0.68rem] text-fg-subtle">préparé</span> : null}
                          </Td>
                          <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">
                            {formatQty(l.delivered)} {l.unitSymbol}
                            {/* Pour un pur : ce que les préparations lui ont pris, en plus des livraisons. */}
                            {l.prepared > 0 ? <span className="block text-[0.68rem] text-warn">+ {formatQty(l.prepared)} préparé{l.prepared > 1 ? 's' : ''}</span> : null}
                          </Td>
                          <Td className="whitespace-nowrap text-right font-bold tabular-nums text-fg">
                            {negatif ? (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-[#c81e3a] px-2 py-0.5 text-white">
                                <AlertTriangle className="size-3.5" />{formatQty(l.stock)} {l.unitSymbol}
                              </span>
                            ) : <>{formatQty(l.stock)} {l.unitSymbol}</>}
                          </Td>
                          {admin ? (
                            <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">
                              {l.unitCost === null ? '—' : (
                                /* Le coût moyen se lit, mais aussi se vérifie : le
                                   détail montre chaque arrivage et la division. */
                                <button type="button" onClick={() => setDetailCout(l)} title="Voir le calcul du coût moyen"
                                  className="rounded-md px-1.5 py-0.5 underline decoration-dotted underline-offset-4 transition-colors hover:bg-accent/[0.08] hover:text-accent">
                                  {formatMoney(l.unitCost)}
                                </button>
                              )}
                            </Td>
                          ) : null}
                          {admin ? <Td className="whitespace-nowrap text-right font-semibold tabular-nums text-fg">{l.unitCost === null ? '—' : formatMoney(l.stockValue)}</Td> : null}
                        </>
                      )}
                      <Td>
                        <span className="flex flex-wrap items-center justify-end gap-1">
                          {/* Le dispatching est le geste de l'économat autant que de
                              l'administration : relier au pur ce qu'on en prépare. */}
                          {l.kind !== 'PREPARE' ? (
                            <Button variant="ghost" size="sm" onClick={() => setPortion(l)} title="Dispatching : les articles préparés tirés de cet article">
                              <Scissors className="size-3.5" />
                              Dispatching
                            </Button>
                          ) : null}
                          {admin ? (
                            <Button variant="ghost" size="sm" onClick={() => setModif(l)} title="Inventaire, nature de l'article">
                              <Pencil className="size-3.5" />
                              Modifier
                            </Button>
                          ) : null}
                        </span>
                      </Td>
                    </tr>
                  </React.Fragment>
                )
              })}
            </tbody>
          </TableWrap>
        )}
      </GlassCard>

      {journal && data ? (
        <Modal title={admin ? `Entrées ${libellePeriode} — ${formatMoney(totalJour)}` : 'Entrées d’aujourd’hui'} onClose={() => { setJournal(false); setFournisseurVu(null); setRechercheFournisseur('') }} size="xl"
          footer={
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <Link href={`${base}/historique?vue=stock`} className="inline-flex items-center gap-1.5 text-[0.85rem] font-semibold text-accent hover:underline">
                <History className="size-4" />
                Voir tout l’historique du stock
              </Link>
              <Button variant="ghost" onClick={() => setJournal(false)}>Fermer</Button>
            </div>
          }>
          {entreesJour.length === 0 ? (
            <EmptyState icon={<PackagePlus className="size-6" />} title={`Aucune entrée ${libellePeriode}`} description="Saisissez un arrivage avec « Nouvelle entrée »." />
          ) : (
            <>
            {fournisseurVu === null ? (
              /* D'abord les fournisseurs : une carte chacun, et une pour la
                 journée entière. La carte ouvre la fiche du fournisseur. */
              <>
              <SearchField value={rechercheFournisseur} onChange={setRechercheFournisseur} placeholder="Rechercher un fournisseur…" className="mb-3" autoFocus />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {!rechercheFournisseur.trim() ? (
                <button type="button" onClick={() => setFournisseurVu('tout')}
                  className="flex flex-col items-start gap-2 rounded-2xl border border-accent/35 bg-accent/[0.07] p-4 text-left transition-colors hover:bg-accent/[0.12]">
                  <span className="grid size-10 place-items-center rounded-xl bg-accent text-white"><PackagePlus className="size-5" /></span>
                  <span className="text-[1rem] font-bold text-fg">Tout</span>
                  <span className="text-[0.8rem] text-fg-muted">{entreesJour.length} article{entreesJour.length > 1 ? 's' : ''} entré{entreesJour.length > 1 ? 's' : ''} {libellePeriode}{admin ? ` · ${formatMoney(totalJour)}` : ''}</span>
                </button>
                ) : null}
                {fournisseursJour.filter(([, f]) => correspond(rechercheFournisseur, f.nom, f.phone ?? '', f.taxId ?? '', ...f.references)).map(([cle, f]) => (
                  <button key={cle || 'aucun'} type="button" onClick={() => setFournisseurVu(cle)}
                    className="flex flex-col items-start gap-2 rounded-2xl border border-[rgb(var(--glass-edge)/0.3)] bg-white/60 p-4 text-left transition-colors hover:border-accent/40 hover:bg-white">
                    <span className={cn('grid size-10 place-items-center rounded-xl text-white', cle === '' ? 'bg-fg-subtle' : 'bg-info')}><Building2 className="size-5" /></span>
                    <span className={cn('text-[1rem] font-bold text-fg', cle === '' && 'italic text-fg-muted')}>{f.nom}</span>
                    {f.phone || f.taxId ? (
                      <span className="text-[0.78rem] text-fg-muted">{[f.phone, f.taxId ? `MF ${f.taxId}` : null].filter(Boolean).join(' · ')}</span>
                    ) : null}
                    <span className="text-[0.8rem] text-fg-muted">{f.n} article{f.n > 1 ? 's' : ''}{admin ? ` · ${formatMoney(f.total)}` : ''}{f.references.size > 0 ? ` · ${[...f.references].join(', ')}` : ''}</span>
                  </button>
                ))}
              </div>
              {rechercheFournisseur.trim() && !fournisseursJour.some(([, f]) => correspond(rechercheFournisseur, f.nom, f.phone ?? '', f.taxId ?? '', ...f.references)) ? (
                <p className="py-6 text-center text-[0.85rem] text-fg-muted">Aucun fournisseur ne correspond {libellePeriode}.</p>
              ) : null}
              </>
            ) : (
            <>
            {/* La fiche : le fournisseur en tête, puis toutes ses lignes. */}
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setFournisseurVu(null)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[rgb(var(--glass-edge)/0.34)] bg-white/65 px-3 text-[0.8rem] font-semibold text-fg-muted transition-colors hover:bg-white hover:text-fg">
                ← Fournisseurs
              </button>
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-info text-white"><Building2 className="size-4" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[1rem] font-bold text-fg">{fournisseurChoisi ? fournisseurChoisi.nom : `Toutes les entrées ${libellePeriode}`}</span>
                  <span className="block text-[0.78rem] text-fg-muted">
                    {fournisseurChoisi
                      ? [fournisseurChoisi.phone ? `Tél. ${fournisseurChoisi.phone}` : null, fournisseurChoisi.taxId ? `MF ${fournisseurChoisi.taxId}` : null, `${fournisseurChoisi.n} article${fournisseurChoisi.n > 1 ? 's' : ''}`, admin ? formatMoney(fournisseurChoisi.total) : null].filter(Boolean).join(' · ')
                      : `${entreesJour.length} article${entreesJour.length > 1 ? 's' : ''}${admin ? ` · ${formatMoney(totalJour)}` : ''}`}
                  </span>
                </span>
              </span>
            </div>
            <TableWrap minWidth="48rem">
              <thead>
                <tr>
                  <Th>Heure</Th>
                  <Th className="w-full">Article</Th>
                  <Th>Fournisseur</Th>
                  <Th className="text-right">Quantité</Th>
                  {admin ? <Th className="text-right">Prix unitaire</Th> : null}
                  {admin ? <Th className="text-right">Total</Th> : null}
                  <Th>Référence</Th>
                  <Th>Par</Th>
                  {admin ? <Th className="w-10" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
                {entreesVues.map((e) => (
                  <tr key={e.id} className="bg-danger/[0.04] shadow-[inset_3px_0_0_0_var(--danger)]">
                    <Td className="whitespace-nowrap text-[0.8rem] text-fg-muted">{formatTime(e.createdAt)}</Td>
                    <Td className="max-w-0"><p className="truncate text-[0.85rem] font-medium text-fg">{e.product.name}</p>{e.note ? <p className="truncate text-[0.72rem] text-fg-subtle">{e.note}</p> : null}</Td>
                    <Td className="whitespace-nowrap text-[0.8rem] text-fg">{e.supplier ? e.supplier.name : <span className="text-fg-subtle">—</span>}</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums text-fg">{formatQty(e.quantity)} {e.product.baseUnit.symbol}</Td>
                    {admin ? <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">{formatMoney(e.unitPrice)}</Td> : null}
                    {admin ? <Td className="whitespace-nowrap text-right font-semibold tabular-nums text-danger">+ {formatMoney(e.total)}</Td> : null}
                    <Td className="whitespace-nowrap font-mono text-[0.75rem] text-fg-muted">{e.reference ?? '—'}</Td>
                    <Td className="whitespace-nowrap text-[0.8rem] text-fg-muted">{e.createdBy.fullName}</Td>
                    {admin ? (
                      <Td>
                        <button type="button" onClick={() => void runSuppression(() => supprimerEntree(e))} disabled={suppression} title="Retirer cette entrée" aria-label={`Retirer l'entrée de ${e.product.name}`}
                          className="grid size-7 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-danger/10 hover:text-danger">
                          <Trash2 className="size-4" />
                        </button>
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            </>
            )}
            </>
          )}
        </Modal>
      ) : null}

      {entree && data ? (
        <NouvelleEntree produits={data.stockProducts.filter((p) => data.generalStock.lines.find((l) => l.productId === p.id)?.kind !== 'PREPARE')}
          onClose={() => setEntree(false)} onDone={() => { setEntree(false); recharger(); router.refresh() }} />
      ) : null}
      {portion && data ? (
        <Dispatching mere={portion} lignes={data.generalStock.lines} onClose={() => setPortion(null)} onDone={() => { setPortion(null); recharger() }} />
      ) : null}
      {detailCout ? <DetailCoutMoyen article={detailCout} onClose={() => setDetailCout(null)} /> : null}
      {preparation && data ? (
        <NouvellePreparation lignes={data.generalStock.lines} onClose={() => setPreparation(false)} onDone={() => { setPreparation(false); recharger() }} />
      ) : null}
      {modif && data ? (
        <ModifierArticle article={modif} lignes={data.generalStock.lines} onClose={() => setModif(null)} onDone={() => { setModif(null); recharger() }} />
      ) : null}
    </div>
  )
}

/** Un arrivage : l'article, la quantité, le prix — et la facture. */
type Fournisseur = { id: string; name: string; phone: string | null; taxId: string | null }
type Unite = { id: string; name: string; symbol: string }

/** La contenance d'une unité pour un article (1 carton de RIZ = 25 kg), retenue d'une facture à l'autre. */
const cleContenance = (productId: string, unite: string) => `economan.contenance.${productId}.${unite.toLowerCase()}`
function contenanceRetenue(productId: string, unite: string): string {
  try { return window.localStorage.getItem(cleContenance(productId, unite)) ?? '' } catch { return '' }
}
function retenirContenance(productId: string, unite: string, valeur: string) {
  try { if (toNumber(valeur) > 0) window.localStorage.setItem(cleContenance(productId, unite), valeur) } catch { /* pas de stockage */ }
}
/** Le champ d'une ligne, pour y conduire le curseur : la saisie descend de case en case. */
function focaliser(label: string) {
  window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[aria-label="${label}"]`)?.focus())
}
/** Une ligne de facture : l'article, ce qu'on en reçoit dans l'unité de la facture, et — quand cette unité ne se convertit pas d'elle-même — ce qu’elle contient d’unités de stock. */
type LigneSaisie = { cle: number; produit: Produit | null; quantite: string; prix: string; unite: string; contenance: string }

/**
 * Une entrée au stock, c'est une facture : un fournisseur, puis ses lignes.
 *
 * Le nom de la société se retrouve à la frappe parmi ceux déjà connus ; le
 * choisir ramène son téléphone et son matricule fiscal. Un nom nouveau se
 * crée avec l'entrée. Chaque ligne porte l'article, la quantité, le prix
 * unitaire et le total qui en découle ; « Valider » enregistre tout d'un
 * coup, une entrée par article, toutes rattachées au même fournisseur et à
 * la même facture.
 */
function NouvelleEntree({ produits, onClose, onDone }: { produits: Produit[]; onClose: () => void; onDone: () => void }) {
  const { push } = useToast()
  const [fournisseurs, setFournisseurs] = React.useState<Fournisseur[]>([])
  const [unites, setUnites] = React.useState<Unite[]>([])
  React.useEffect(() => {
    gql<{ suppliers: Fournisseur[]; units: Unite[] }>(SUPPLIERS).then((d) => { setFournisseurs(d.suppliers); setUnites(d.units) }).catch(() => {})
  }, [])
  // Une nouvelle unité se crée depuis la ligne : « Sac », « Bidon »… Elle
  // rejoint la liste, et le sélecteur la pose sur sa ligne.
  const creerUnite = async (nom: string, symbole: string): Promise<Unite | null> => {
    try {
      const d = await gql<{ createUnit: Unite }>(CREATE_UNIT, { name: nom.trim(), symbol: symbole.trim() })
      setUnites((us) => (us.some((u) => u.id === d.createUnit.id) ? us : [...us, d.createUnit].sort((a, b) => a.name.localeCompare(b.name))))
      return d.createUnit
    } catch (e) { push('error', errorMessage(e)); return null }
  }
  const [nom, setNom] = React.useState('')
  const [tel, setTel] = React.useState('')
  const [mf, setMf] = React.useState('')
  const [listeOuverte, setListeOuverte] = React.useState(false)
  const connu = fournisseurs.find((f) => normaliser(f.name) === normaliser(nom)) ?? null
  const suggestions = (nom.trim()
    ? fournisseurs.filter((f) => correspond(nom, f.name, f.phone ?? '', f.taxId ?? ''))
    : fournisseurs).slice(0, 6)
  const choisirFournisseur = (f: Fournisseur) => {
    setNom(f.name); setTel(f.phone ?? ''); setMf(f.taxId ?? ''); setListeOuverte(false)
  }

  const [lignes, setLignes] = React.useState<LigneSaisie[]>([{ cle: 1, produit: null, quantite: '', prix: '', unite: '', contenance: '' }])
  const prochaineCle = React.useRef(2)
  const poser = (cle: number, patch: Partial<LigneSaisie>) =>
    setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, ...patch } : l)))
  const ajouterLigne = () => setLignes((ls) => [...ls, { cle: prochaineCle.current++, produit: null, quantite: '', prix: '', unite: '', contenance: '' }])
  const retirerLigne = (cle: number) => setLignes((ls) => (ls.length > 1 ? ls.filter((l) => l.cle !== cle) : [{ cle: prochaineCle.current++, produit: null, quantite: '', prix: '', unite: '', contenance: '' }]))

  const [jour, setJour] = React.useState(toDateKey(new Date()))
  const [reference, setReference] = React.useState('')
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const totalLigne = (l: LigneSaisie) => toNumber(l.quantite) * toNumber(l.prix)
  // L'unité de saisie : celle de l'article par défaut. La quantité et le
  // prix unitaire s'écrivent dans l'unité du stock, le total ne bouge pas.
  const uniteDe = (l: LigneSaisie) => l.unite || l.produit?.baseUnit.symbol || ''
  // Convertible d'elle-même (g → kg) ; sinon la contenance saisie fait la
  // conversion (1 carton = 25 kg).
  const convertible = (l: LigneSaisie) => !!l.produit && versBase(1, uniteDe(l), l.produit.baseUnit.symbol) !== null
  const enBase = (l: LigneSaisie) => {
    if (!l.produit) return null
    const direct = versBase(toNumber(l.quantite), uniteDe(l), l.produit.baseUnit.symbol)
    if (direct !== null) return direct
    const c = toNumber(l.contenance)
    return c > 0 ? toNumber(l.quantite) * c : null
  }
  const complete = (l: LigneSaisie) => !!l.produit && toNumber(l.quantite) > 0 && l.prix !== '' && toNumber(l.prix) >= 0 && (enBase(l) ?? 0) > 0
  const entamee = (l: LigneSaisie) => !!l.produit || l.quantite !== '' || l.prix !== ''
  const completes = lignes.filter(complete)
  const incompletes = lignes.filter((l) => entamee(l) && !complete(l))
  const doublons = new Set(completes.map((l) => l.produit!.id)).size !== completes.length
  const total = completes.reduce((n, l) => n + totalLigne(l), 0)
  const valide = nom.trim() !== '' && completes.length > 0 && incompletes.length === 0 && !doublons

  const envoyer = async () => {
    if (!valide) return
    setBusy(true)
    try {
      const n = await gql<{ addStockEntries: number }>(ADD_ENTRIES, {
        supplier: { name: nom.trim(), phone: tel.trim() || null, taxId: mf.trim() || null },
        reference: reference.trim() || null, note: note.trim() || null, day: jour || null,
        lines: completes.map((l) => {
          const q = enBase(l)!
          // Le prix par unité de base : le total de la ligne divisé par ce qui entre.
          return { productId: l.produit!.id, quantity: q, unitPrice: totalLigne(l) / q }
        }),
      })
      push('success', `${n.addStockEntries} article(s) entrés au stock — ${formatMoney(total)} — ${nom.trim()}.`)
      onDone()
    } catch (e) { push('error', errorMessage(e)) } finally { setBusy(false) }
  }

  const champ = 'field h-10 w-full px-3'
  return (
    <Modal title="Nouvelle entrée au stock général" onClose={onClose} size="xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-[0.85rem] text-fg-muted">
            {completes.length} article{completes.length > 1 ? 's' : ''} · Total : <strong className="text-fg">{formatMoney(total)}</strong>
            {doublons ? <span className="ml-2 text-danger">Un article figure deux fois.</span> : null}
            {incompletes.length > 0 ? <span className="ml-2 text-warn">{incompletes.length} ligne(s) à compléter.</span> : null}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Annuler</Button>
            <Button variant="primary" loading={busy} disabled={!valide} onClick={envoyer}>
              {!busy ? <Check className="size-4" /> : null}
              Valider
            </Button>
          </div>
        </div>
      }>
      <div className="space-y-5">
        {/* 1. Le fournisseur : le nom se retrouve à la frappe, le reste suit. */}
        <section className="rounded-xl border border-[rgb(var(--glass-edge)/0.22)] bg-white/40 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[0.74rem] font-semibold uppercase tracking-wide text-fg-muted">
            <Building2 className="size-3.5" /> Fournisseur
          </p>
          <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
            <label className="relative block text-[0.8rem] font-medium text-fg-muted">Nom de la société
              <input
                value={nom}
                onChange={(e) => { setNom(e.target.value); setListeOuverte(true) }}
                onFocus={() => setListeOuverte(true)}
                onBlur={() => window.setTimeout(() => setListeOuverte(false), 150)}
                placeholder="Société…"
                autoFocus
                role="combobox"
                aria-controls="liste-societes"
                aria-autocomplete="list"
                aria-expanded={listeOuverte && suggestions.length > 0}
                aria-label="Nom de la société"
                className={cn(champ, 'mt-1')}
              />
              {connu ? (
                <span className="absolute right-2 top-[2.1rem] inline-flex items-center gap-1 rounded-full bg-ok/12 px-2 py-0.5 text-[0.68rem] font-semibold text-ok"><Check className="size-3" /> connu</span>
              ) : nom.trim() ? (
                <span className="absolute right-2 top-[2.1rem] rounded-full bg-accent/12 px-2 py-0.5 text-[0.68rem] font-semibold text-accent">nouveau</span>
              ) : null}
              {listeOuverte && suggestions.length > 0 && !connu ? (
                <div role="listbox" className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-30 max-h-56 overflow-y-auto rounded-xl border border-[rgb(var(--glass-edge)/0.3)] bg-white shadow-lg">
                  {suggestions.map((f) => (
                    <button key={f.id} type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => choisirFournisseur(f)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[0.83rem] hover:bg-accent/[0.08]">
                      <span className="font-medium text-fg">{f.name}</span>
                      <span className="shrink-0 text-[0.72rem] text-fg-subtle">{[f.phone, f.taxId].filter(Boolean).join(' · ')}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
            <label className="block text-[0.8rem] font-medium text-fg-muted">N° de téléphone
              <input value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" maxLength={30} placeholder="—" className={cn(champ, 'mt-1')} />
            </label>
            <label className="block text-[0.8rem] font-medium text-fg-muted">Matricule fiscal
              <input value={mf} onChange={(e) => setMf(e.target.value)} maxLength={40} placeholder="—" className={cn(champ, 'mt-1 font-mono')} />
            </label>
          </div>
        </section>

        {/* 2. La facture : sa date, son numéro, une remarque. */}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-[0.8rem] font-medium text-fg-muted">Journée
            <div className="mt-1"><DateField value={jour} onChange={(v) => setJour(v ?? '')} /></div>
          </label>
          <label className="block text-[0.8rem] font-medium text-fg-muted">Référence facture / bon fournisseur
            <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} className={cn(champ, 'mt-1')} />
          </label>
          <label className="block text-[0.8rem] font-medium text-fg-muted">Remarque
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={cn(champ, 'mt-1')} />
          </label>
        </div>

        {/* 3. Les articles, une ligne chacun. */}
        <section className="overflow-hidden rounded-xl border border-[rgb(var(--glass-edge)/0.22)]">
          <table className="w-full border-collapse text-left text-[0.85rem]">
            <thead>
              <tr className="bg-[#e7edf7] text-[0.72rem] font-semibold uppercase tracking-wider text-fg-muted">
                <th className="w-10 px-3 py-2.5 text-right">#</th>
                <th className="px-3 py-2.5">Article</th>
                <th className="w-60 whitespace-nowrap px-3 py-2.5 text-right">Quantité · unité</th>
                <th className="w-44 whitespace-nowrap px-3 py-2.5 text-right">Prix unitaire (DT / unité)</th>
                <th className="w-40 whitespace-nowrap px-3 py-2.5 text-right">Prix total</th>
                <th className="w-12 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.14)]">
              {lignes.map((l, i) => {
                const enDouble = !!l.produit && completes.filter((x) => x.produit!.id === l.produit!.id).length > 1
                return (
                  <tr key={l.cle} className={cn(enDouble && 'bg-danger/[0.06]')}>
                    <td className="px-3 py-2 text-right text-[0.8rem] tabular-nums text-fg-subtle">{i + 1}</td>
                    <td className="px-3 py-2">
                      <ChoixArticle produits={produits} produit={l.produit} onChoix={(p) => { poser(l.cle, { produit: p, unite: p?.baseUnit.symbol ?? '', contenance: '' }); if (p) focaliser(`Quantité — ligne ${i + 1}`) }} autoFocus={i > 0 && !l.produit} />
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        <input inputMode="decimal" value={l.quantite} onChange={(e) => poser(l.cle, { quantite: e.target.value.replace(',', '.') })} placeholder="0"
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focaliser(`Prix unitaire — ligne ${i + 1}`) } }}
                          aria-label={`Quantité — ligne ${i + 1}`} className="field h-10 w-full px-2.5 text-right text-[0.9rem] tabular-nums" />
                        {/* L'unité de la facture : kg ou g, L, cl ou ml… Le
                            stock, lui, reste dans l'unité de l'article. */}
                        {l.produit ? (
                          <ChoixUnite
                            base={l.produit.baseUnit.symbol}
                            productId={l.produit.id}
                            valeur={uniteDe(l)}
                            unites={unites}
                            onChoix={(u, c) => { poser(l.cle, { unite: u, contenance: c ?? '' }); if (c) retenirContenance(l.produit!.id, u, c); focaliser(`Quantité — ligne ${i + 1}`) }}
                            onCreer={creerUnite}
                            ligne={i + 1}
                          />
                        ) : <span className="w-[6.5rem] shrink-0" />}
                      </span>
                      {/* Une unité qui ne se convertit pas d'elle-même : on
                          dit ce qu’elle contient d’unités de stock. */}
                      {l.produit && !convertible(l) ? (
                        <span className={cn('mt-1.5 inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[0.76rem]', toNumber(l.contenance) > 0 ? 'border-[rgb(var(--glass-edge)/0.3)] bg-white/60 text-fg-muted' : 'border-warn/40 bg-warn/[0.08] text-warn')}>
                          1 {uniteDe(l)} =
                          <input inputMode="decimal" value={l.contenance} onChange={(e) => { const v = e.target.value.replace(',', '.'); poser(l.cle, { contenance: v }); retenirContenance(l.produit!.id, uniteDe(l), v) }} placeholder="?"
                            aria-label={`Contenance — ligne ${i + 1}`} className="field h-7 w-16 px-1.5 text-right text-[0.8rem] tabular-nums" />
                          {l.produit.baseUnit.symbol}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <span className="relative block">
                        <input inputMode="decimal" value={l.prix} onChange={(e) => poser(l.cle, { prix: e.target.value.replace(',', '.') })} placeholder="0.000"
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (complete(l) && i === lignes.length - 1) ajouterLigne() } }}
                          aria-label={`Prix unitaire — ligne ${i + 1}`} className={cn('field h-10 w-full px-2.5 text-right text-[0.9rem] tabular-nums', l.produit && 'pr-14')} />
                        {/* Le prix est par unité choisie : « / sac », pas « / kg ». */}
                        {l.produit ? <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[0.72rem] text-fg-subtle">/ {uniteDe(l)}</span> : null}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-[0.95rem] font-semibold tabular-nums text-fg">
                      {complete(l) ? (
                        <>
                          {formatMoney(totalLigne(l))}
                          {uniteDe(l) !== l.produit!.baseUnit.symbol ? (
                            <span className="block text-[0.7rem] font-normal text-fg-subtle">= {formatQty(enBase(l)!)} {l.produit!.baseUnit.symbol} au stock</span>
                          ) : null}
                        </>
                      ) : <span className="font-normal text-fg-subtle">—</span>}
                    </td>
                    <td className="px-1 py-1.5 text-right">
                      <button type="button" onClick={() => retirerLigne(l.cle)} aria-label={`Retirer la ligne ${i + 1}`}
                        className="grid size-8 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-danger/12 hover:text-danger">
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between gap-2 border-t border-[rgb(var(--glass-edge)/0.14)] bg-white/40 px-2 py-2">
            <Button variant="secondary" size="sm" onClick={ajouterLigne}>
              <Plus className="size-3.5" />
              Ajouter un article
            </Button>
            <span className="pr-2 text-[0.85rem] text-fg-muted">Total : <strong className="tabular-nums text-fg">{formatMoney(total)}</strong></span>
          </div>
        </section>
      </div>
    </Modal>
  )
}

type EntreeCout = { id: string; type: 'ARRIVAGE' | 'INVENTAIRE'; quantity: number; unitPrice: number; total: number; reference: string | null; businessDay: string; createdAt: string; supplier: { name: string } | null }

/**
 * Le calcul du coût moyen d'un article, posé comme on le ferait au stylo :
 * chaque arrivage avec sa quantité, son prix et son total ; la somme des
 * dinars, la somme des kilos ; et la division. Un inventaire, s'il y en a
 * un, remet les compteurs à ce point : ce qui précède ne compte plus.
 */
function DetailCoutMoyen({ article, onClose }: { article: Line; onClose: () => void }) {
  const [entrees, setEntrees] = React.useState<EntreeCout[] | null>(null)
  React.useEffect(() => {
    let vivant = true
    gql<{ stockEntries: EntreeCout[] }>(ENTRIES_OF, { productId: article.productId })
      .then((d) => { if (vivant) setEntrees([...d.stockEntries].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) })
      .catch(() => { if (vivant) setEntrees([]) })
    return () => { vivant = false }
  }, [article.productId])

  const liste = entrees ?? []
  // Le dernier inventaire est le point de départ : lui et ce qui suit.
  let depart = 0
  liste.forEach((e, i) => { if (e.type === 'INVENTAIRE') depart = i })
  const comptees = liste.slice(depart)
  const avant = liste.slice(0, depart)
  const totalQte = comptees.reduce((n, e) => n + e.quantity, 0)
  const totalDt = comptees.reduce((n, e) => n + e.quantity * e.unitPrice, 0)
  const moyen = totalQte > 0 ? totalDt / totalQte : null
  const u = article.unitSymbol

  const ligne = (e: EntreeCout, grise: boolean) => (
    <tr key={e.id} className={cn(grise && 'opacity-50', e.type === 'INVENTAIRE' && 'bg-accent/[0.06]')}>
      <Td className="whitespace-nowrap text-[0.82rem] text-fg-muted">{formatDate(e.businessDay)}</Td>
      <Td className="text-[0.85rem] text-fg">
        {e.type === 'INVENTAIRE' ? <span className="font-semibold text-accent">Inventaire — point de départ</span> : (e.supplier?.name ?? 'Arrivage')}
        {e.reference ? <span className="ml-1.5 font-mono text-[0.72rem] text-fg-subtle">{e.reference}</span> : null}
      </Td>
      <Td className="whitespace-nowrap text-right tabular-nums">{formatQty(e.quantity)} {u}</Td>
      <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">× {formatMoney(e.unitPrice)}</Td>
      <Td className="whitespace-nowrap text-right font-semibold tabular-nums">{formatMoney(e.quantity * e.unitPrice)}</Td>
    </tr>
  )

  return (
    <Modal title={`Coût moyen — ${article.productName}`} onClose={onClose} wide
      footer={<Button variant="ghost" onClick={onClose}>Fermer</Button>}>
      {entrees === null ? (
        <p className="flex items-center gap-2 py-6 text-[0.85rem] text-fg-muted"><Loader2 className="size-4 animate-spin" /> Chargement…</p>
      ) : liste.length === 0 ? (
        <EmptyState icon={<PackagePlus className="size-6" />} title="Aucune entrée" description="Le coût moyen se calcule à partir des arrivages : entrez-en un avec son prix." />
      ) : (
        <div className="space-y-4">
          <TableWrap minWidth="38rem">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th className="w-full">Arrivage</Th>
                <Th className="text-right">Quantité</Th>
                <Th className="text-right">Prix unitaire</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
              {avant.length > 0 ? (
                <tr><Td colSpan={5} className="bg-[rgb(var(--glass-edge)/0.08)] text-[0.74rem] text-fg-subtle">Avant l’inventaire — ne comptent plus dans le coût moyen</Td></tr>
              ) : null}
              {avant.map((e) => ligne(e, true))}
              {avant.length > 0 ? (
                <tr><Td colSpan={5} className="bg-[rgb(var(--glass-edge)/0.08)] text-[0.74rem] text-fg-subtle">Depuis l’inventaire</Td></tr>
              ) : null}
              {comptees.map((e) => ligne(e, false))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[rgb(var(--glass-edge)/0.35)] bg-[#e7edf7]">
                <Td colSpan={2} className="text-[0.85rem] font-bold uppercase tracking-wide text-fg">Total</Td>
                <Td className="whitespace-nowrap text-right font-bold tabular-nums text-fg">{formatQty(totalQte)} {u}</Td>
                <Td />
                <Td className="whitespace-nowrap text-right font-bold tabular-nums text-fg">{formatMoney(totalDt)}</Td>
              </tr>
            </tfoot>
          </TableWrap>

          {/* La division, en toutes lettres : c'est elle qu'on vient vérifier. */}
          <div className="rounded-2xl border border-accent/30 bg-accent/[0.07] p-4">
            <p className="text-[0.74rem] font-semibold uppercase tracking-wide text-accent">Coût moyen de l’article</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[1.05rem] text-fg">
              <span className="font-semibold tabular-nums">{formatMoney(totalDt)}</span>
              <span className="text-fg-muted">÷</span>
              <span className="font-semibold tabular-nums">{formatQty(totalQte)} {u}</span>
              <span className="text-fg-muted">=</span>
              <span className="text-[1.35rem] font-bold tabular-nums text-accent">{moyen === null ? '—' : `${formatMoney(moyen)} / ${u}`}</span>
            </p>
            <p className="mt-2 text-[0.8rem] text-fg-muted">
              Stock actuel : <strong className="text-fg">{formatQty(article.stock)} {u}</strong> × {moyen === null ? '—' : formatMoney(moyen)} = <strong className="text-fg">{formatMoney(article.stockValue)}</strong> de valeur en magasin.
            </p>
          </div>
        </div>
      )}
    </Modal>
  )
}

/**
 * L'unité d'une ligne de facture.
 *
 * Un bouton qui montre l'unité choisie, et un panneau flottant : l'unité de
 * l'article et celles qui s'y convertissent d'elles-mêmes, puis les autres
 * (carton, sac…), puis « Nouvelle unité » qui ouvre ses deux champs dans le
 * même panneau. Rien de natif : le menu du navigateur cassait l'écran.
 */
function ChoixUnite({ base, productId, valeur, unites, onChoix, onCreer, ligne }: {
  base: string; productId: string; valeur: string; unites: Unite[]
  /** L'unité choisie, et sa contenance en unités de stock quand elle ne se convertit pas d'elle-même. */
  onChoix: (symbole: string, contenance?: string) => void
  onCreer: (nom: string, symbole: string) => Promise<Unite | null>
  ligne: number
}) {
  const [ouvert, setOuvert] = React.useState(false)
  const [creation, setCreation] = React.useState<{ nom: string; symbole: string } | null>(null)
  // Une unité qui ne se convertit pas d'elle-même : on demande tout de
  // suite ce qu'elle contient, pré-rempli de la dernière fois pour cet article.
  const [contenance, setContenance] = React.useState<{ unite: string; valeur: string } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const bouton = React.useRef<HTMLButtonElement>(null)
  const panneau = React.useRef<HTMLDivElement>(null)
  const [pos, setPos] = React.useState<{ left: number; top?: number; bottom?: number } | null>(null)
  React.useLayoutEffect(() => {
    if (!ouvert) { setPos(null); setCreation(null); setContenance(null); return }
    const LARGEUR = 20 * 16, HAUTEUR = 20 * 16
    const maj = () => {
      const r = bouton.current?.getBoundingClientRect(); if (!r) return
      let left = r.right - LARGEUR
      if (left < 8) left = 8
      if (left + LARGEUR > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - LARGEUR)
      const enBas = window.innerHeight - r.bottom
      if (enBas < HAUTEUR + 8 && r.top > enBas) setPos({ left, bottom: window.innerHeight - r.top + 6 })
      else setPos({ left, top: r.bottom + 6 })
    }
    maj()
    window.addEventListener('scroll', maj, true); window.addEventListener('resize', maj)
    return () => { window.removeEventListener('scroll', maj, true); window.removeEventListener('resize', maj) }
  }, [ouvert])
  React.useEffect(() => {
    if (!ouvert) return
    const auClic = (e: MouseEvent) => {
      const t = e.target as Node
      if (!panneau.current?.contains(t) && !bouton.current?.contains(t)) setOuvert(false)
    }
    const auClavier = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false) }
    document.addEventListener('mousedown', auClic); document.addEventListener('keydown', auClavier)
    return () => { document.removeEventListener('mousedown', auClic); document.removeEventListener('keydown', auClavier) }
  }, [ouvert])

  const compat = unitesCompatibles(base)
  const autres = unites.filter((u) => !compat.some((c) => c.toLowerCase() === u.symbol.toLowerCase()))
  const nomDe = (symbole: string) => unites.find((u) => u.symbol.toLowerCase() === symbole.toLowerCase())?.name
  const choisir = (u: string) => {
    if (versBase(1, u, base) !== null) { onChoix(u); setOuvert(false); return }
    setContenance({ unite: u, valeur: contenanceRetenue(productId, u) })
  }
  const validerContenance = () => {
    if (!contenance || toNumber(contenance.valeur) <= 0) return
    onChoix(contenance.unite, contenance.valeur)
    setOuvert(false)
  }
  const creer = async () => {
    if (!creation || !creation.nom.trim() || !creation.symbole.trim() || busy) return
    setBusy(true)
    try {
      const u = await onCreer(creation.nom, creation.symbole)
      if (u) { setCreation(null); choisir(u.symbol) }
    } finally { setBusy(false) }
  }
  const puce = (actif: boolean) => cn(
    'inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[0.82rem] font-semibold transition-colors',
    actif ? 'border-accent bg-accent text-white' : 'border-[rgb(var(--glass-edge)/0.3)] bg-white text-fg hover:border-accent/50 hover:bg-accent/[0.06]',
  )

  return (
    <>
      <button
        ref={bouton}
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        aria-label={`Unité — ligne ${ligne}`}
        title={nomDe(valeur) ?? valeur}
        className={cn('field inline-flex h-10 w-[6.5rem] shrink-0 items-center justify-between gap-1 px-2.5 text-[0.85rem] font-semibold transition-colors', ouvert && 'border-accent/50 ring-2 ring-accent/18')}
      >
        <span className="truncate">{valeur}</span>
        <ChevronDown className="size-3.5 shrink-0 text-fg-subtle" />
      </button>
      {ouvert && pos ? createPortal(
        <div
          ref={panneau}
          role="dialog"
          aria-label={`Choisir l'unité — ligne ${ligne}`}
          style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: 20 * 16 }}
          className="animate-rise z-[80] rounded-2xl border border-[rgb(var(--glass-edge)/0.28)] bg-white p-3 shadow-[0_18px_40px_-16px_rgb(var(--shadow-ambient)/0.55)]"
        >
          {contenance ? (
            <div>
              <p className="mb-2 text-[0.74rem] font-semibold uppercase tracking-wide text-fg-muted">Contenance</p>
              <p className="text-[0.85rem] text-fg">Combien de <strong>{base}</strong> dans 1 <strong>{contenance.unite}</strong>{nomDe(contenance.unite) ? ` (${nomDe(contenance.unite)})` : ''} ?</p>
              <label className="mt-2 flex items-center gap-2 text-[0.85rem] text-fg-muted">1 {contenance.unite} =
                <input inputMode="decimal" value={contenance.valeur} onChange={(e) => setContenance({ ...contenance, valeur: e.target.value.replace(',', '.') })} placeholder="25" autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); validerContenance() } }}
                  aria-label={`Contenance de 1 ${contenance.unite}`} className="field h-10 w-24 px-2.5 text-right text-[0.9rem] tabular-nums" />
                {base}
              </label>
              <p className="mt-2 text-[0.74rem] text-fg-subtle">Retenue pour cet article : la prochaine facture la proposera d’elle-même.</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={() => setContenance(null)}>Retour</Button>
                <Button variant="primary" size="sm" disabled={toNumber(contenance.valeur) <= 0} onClick={validerContenance}><Check className="size-3.5" />Valider</Button>
              </div>
            </div>
          ) : creation ? (
            <div>
              <p className="mb-2 text-[0.74rem] font-semibold uppercase tracking-wide text-fg-muted">Nouvelle unité</p>
              <label className="block text-[0.78rem] font-medium text-fg-muted">Nom
                <input value={creation.nom} onChange={(e) => setCreation({ ...creation, nom: e.target.value })} placeholder="Sac, Bidon, Barquette…" autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void creer() } }}
                  className="field mt-1 h-10 w-full px-3 text-[0.85rem]" />
              </label>
              <label className="mt-2 block text-[0.78rem] font-medium text-fg-muted">Symbole <span className="font-normal text-fg-subtle">(court, tel qu’il s’affiche)</span>
                <input value={creation.symbole} onChange={(e) => setCreation({ ...creation, symbole: e.target.value })} placeholder="sac" maxLength={8}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void creer() } }}
                  className="field mt-1 h-10 w-full px-3 text-[0.85rem]" />
              </label>
              <p className="mt-2 text-[0.74rem] text-fg-subtle">On vous demandera ensuite ce qu’elle contient d’unités de stock (1 sac = 50 kg).</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={() => setCreation(null)} disabled={busy}>Retour</Button>
                <Button variant="primary" size="sm" loading={busy} disabled={!creation.nom.trim() || !creation.symbole.trim()} onClick={creer}>
                  {!busy ? <Check className="size-3.5" /> : null}
                  Créer et choisir
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-fg-muted">Unité de l’article</p>
              <div className="flex flex-wrap gap-1.5">
                {compat.map((u) => (
                  <button key={u} type="button" onClick={() => choisir(u)} className={puce(u === valeur)}>
                    {u}{nomDe(u) ? <span className={cn('text-[0.7rem] font-medium', u === valeur ? 'text-white/80' : 'text-fg-subtle')}>{nomDe(u)}</span> : null}
                  </button>
                ))}
              </div>
              {autres.length > 0 ? (
                <>
                  <p className="mb-1.5 mt-3 text-[0.72rem] font-semibold uppercase tracking-wide text-fg-muted">Autres unités <span className="font-normal normal-case tracking-normal text-fg-subtle">— avec leur contenance</span></p>
                  <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                    {autres.map((u) => (
                      <button key={u.id} type="button" onClick={() => choisir(u.symbol)} className={puce(u.symbol === valeur)}>
                        {u.symbol}<span className={cn('text-[0.7rem] font-medium', u.symbol === valeur ? 'text-white/80' : 'text-fg-subtle')}>{u.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
              <button type="button" onClick={() => setCreation({ nom: '', symbole: '' })}
                className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-accent/50 bg-accent/[0.05] text-[0.82rem] font-semibold text-accent transition-colors hover:bg-accent/[0.1]">
                <Plus className="size-3.5" />
                Nouvelle unité
              </button>
            </div>
          )}
        </div>,
        document.body,
      ) : null}
    </>
  )
}

/**
 * L'article d'une ligne de facture : une barre de recherche, et l'article
 * choisi en badge avec « changer ». La liste flotte hors du tableau, sinon
 * la boîte la coupait après deux résultats.
 */
function ChoixArticle({ produits, produit, onChoix, autoFocus }: {
  produits: Produit[]; produit: Produit | null; onChoix: (p: Produit | null) => void; autoFocus?: boolean
}) {
  const [recherche, setRecherche] = React.useState('')
  const [ouvert, setOuvert] = React.useState(false)
  const [actif, setActif] = React.useState(0)
  const [edition, setEdition] = React.useState(false)
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
  const mot = normaliser(recherche)
  const choix = (mot ? produits.filter((p) => correspond(mot, p.name, p.reference, p.category.name)) : produits).slice(0, 10)
  const choisir = (p: Produit) => { onChoix(p); setRecherche(''); setOuvert(false); setEdition(false) }

  if (produit && !edition) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="min-w-0"><span className="block truncate text-[0.85rem] font-medium text-fg">{produit.name}</span><span className="block font-mono text-[0.68rem] text-fg-subtle">{produit.reference} · {produit.category.name}</span></span>
        <button type="button" onClick={() => { setEdition(true); setOuvert(true) }} className="text-[0.75rem] text-fg-muted hover:underline">changer</button>
      </span>
    )
  }
  const liste = pos ? createPortal(
    <div style={{ position: 'fixed', left: pos.left, width: Math.max(pos.width, 288), top: pos.top, bottom: pos.bottom }} className="z-[70]">
      {choix.length > 0 ? (
        <div role="listbox" style={{ maxHeight: pos.hauteur }} className="overflow-y-auto rounded-xl border border-[rgb(var(--glass-edge)/0.3)] bg-white shadow-lg">
          {choix.map((p, idx) => (
            <button key={p.id} type="button" role="option" aria-selected={idx === actif} onMouseDown={(e) => e.preventDefault()} onClick={() => choisir(p)}
              className={cn('flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[0.83rem]', idx === actif ? 'bg-accent/[0.12]' : 'hover:bg-accent/[0.08]')}>
              <span className="min-w-0"><span className="block truncate font-medium text-fg">{p.name}</span><span className="block font-mono text-[0.68rem] text-fg-subtle">{p.reference} · {p.category.name}</span></span>
              <Badge tone="neutral">{p.baseUnit.symbol}</Badge>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-[rgb(var(--glass-edge)/0.3)] bg-white px-3 py-2 text-[0.8rem] text-fg-muted shadow-lg">Aucun article ne correspond.</p>
      )}
    </div>, document.body) : null
  return (
    <div ref={boite} className="relative w-full min-w-[14rem]">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
      <input
        value={recherche}
        onChange={(e) => { setRecherche(e.target.value); setOuvert(true); setActif(0) }}
        onFocus={() => setOuvert(true)}
        onBlur={() => window.setTimeout(() => { setOuvert(false); if (produit) setEdition(false) }, 150)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setOuvert(false); if (produit) setEdition(false); return }
          if (!ouvert || choix.length === 0) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setActif((a) => Math.min(a + 1, choix.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActif((a) => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); choisir(choix[actif]) }
        }}
        placeholder="Quel article ?"
        role="combobox"
        aria-controls="liste-articles-stock"
        aria-autocomplete="list"
        aria-expanded={ouvert && choix.length > 0}
        aria-label="Rechercher un article"
        autoFocus={autoFocus || edition}
        className="field h-10 w-full pl-8 pr-3 text-[0.88rem]"
      />
      {ouvert ? liste : null}
    </div>
  )
}

/**
 * Une préparation : le pur, le préparé, ce qu'on a pris, ce qu'on a obtenu.
 *
 * Les préparés déjà rattachés au pur viennent en premier ; un article à la
 * pièce peut aussi être choisi, il se rattache alors de lui-même. La
 * contenance connue propose la quantité de pur dès qu'on tape l'obtenu.
 */
function NouvellePreparation({ lignes, onClose, onDone }: { lignes: Line[]; onClose: () => void; onDone: () => void }) {
  const { push } = useToast()
  const [pur, setPur] = React.useState<Line | null>(null)
  const [prepare, setPrepare] = React.useState<Line | null>(null)
  const [obtenu, setObtenu] = React.useState('')
  // La contenance : ce qu'une unité de préparé prend de pur. Connue par le
  // dispatching, elle fait tout le calcul ; sinon on la demande une fois ici.
  const [contenanceSaisie, setContenanceSaisie] = React.useState('')
  // L'unité dans laquelle on compte le préparé : la sienne s'il est déjà
  // rattaché ; sinon « p » (portion) par défaut, ou celle qu'on choisit.
  const [uniteSaisie, setUniteSaisie] = React.useState('')
  const [unites, setUnites] = React.useState<Unite[]>([])
  React.useEffect(() => { gql<{ units: Unite[] }>(SUPPLIERS).then((d) => setUnites(d.units)).catch(() => {}) }, [])
  const [jour, setJour] = React.useState(toDateKey(new Date()))
  const [note, setNote] = React.useState('')
  const [rechPur, setRechPur] = React.useState('')
  const [rechPrep, setRechPrep] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const purs = lignes.filter((l) => l.kind !== 'PREPARE' && correspond(normaliser(rechPur), l.productName, l.productRef, l.categoryName))
    .sort((a, b) => (a.kind === 'MERE' ? 0 : 1) - (b.kind === 'MERE' ? 0 : 1) || a.productName.localeCompare(b.productName)).slice(0, 12)
  // Les préparés du pur choisi d'abord, puis n'importe quel article à la pièce sans portions.
  const candidats = pur
    ? lignes.filter((l) => l.productId !== pur.productId && l.portions.length === 0
        && (l.mother ? l.mother.productId === pur.productId : l.kind !== 'MERE')
        && correspond(normaliser(rechPrep), l.productName, l.productRef, l.categoryName))
        .sort((a, b) => (a.mother ? 0 : 1) - (b.mother ? 0 : 1) || a.productName.localeCompare(b.productName)).slice(0, 12)
    : []
  const contenanceConnue = prepare?.mother?.motherQuantity ?? null
  const uniteMade = prepare
    ? (prepare.mother ? prepare.unitSymbol : (uniteSaisie || (prepare.unitSymbol === pur?.unitSymbol ? 'p' : prepare.unitSymbol)))
    : ''
  const contenance = contenanceConnue ?? (toNumber(contenanceSaisie) > 0 ? toNumber(contenanceSaisie) : null)
  const qObtenu = toNumber(obtenu)
  // Le pur consommé découle du nombre de paquets : 50 × 2 kg = 100 kg.
  const qUtilise = contenance ? Math.round(qObtenu * contenance * 1000) / 1000 : 0
  const valide = !!pur && !!prepare && !!contenance && qUtilise > 0 && qObtenu > 0
  const manque = pur ? qUtilise - pur.stock > 1e-9 : false

  const envoyer = async () => {
    if (!valide || !pur || !prepare) return
    setBusy(true)
    try {
      await gql(ADD_PREPARATION, { sourceId: pur.productId, productId: prepare.productId, quantityUsed: qUtilise, quantityMade: qObtenu, madeUnit: prepare.mother ? null : uniteMade, day: jour || null, note: note.trim() || null })
      push('success', `${formatQty(qObtenu)} ${uniteMade} de ${prepare.productName} préparés — ${formatQty(qUtilise)} ${pur.unitSymbol} de ${pur.productName} consommés.`)
      onDone()
    } catch (e) { push('error', errorMessage(e)) } finally { setBusy(false) }
  }

  const carte = (l: Line, actif: boolean, onClick: () => void) => (
    <button key={l.productId} type="button" onClick={onClick}
      className={cn('flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors', actif ? 'border-accent bg-accent/[0.1]' : 'border-[rgb(var(--glass-edge)/0.25)] bg-white/60 hover:border-accent/40 hover:bg-white')}>
      <span className="min-w-0"><span className="block truncate text-[0.85rem] font-medium text-fg">{l.productName}</span><span className="block font-mono text-[0.7rem] text-fg-subtle">{l.productRef} · {l.categoryName}{l.mother ? ` · ${formatMere(l.mother.motherQuantity, l.mother.unitSymbol)} / ${l.unitSymbol}` : ''}</span></span>
      <span className="shrink-0 text-right text-[0.78rem] tabular-nums text-fg-muted">stock <strong className={cn('text-fg', l.stock < -1e-9 && 'text-danger')}>{formatQty(l.stock)} {l.unitSymbol}</strong></span>
    </button>
  )

  return (
    <Modal title="Nouvelle préparation" onClose={onClose} size="xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-[0.85rem] text-fg-muted">
            {pur && prepare && valide ? (
              <>
                <strong className="text-fg">{pur.productName}</strong> {formatQty(pur.stock)} → <strong className={cn(manque ? 'text-danger' : 'text-fg')}>{formatQty(pur.stock - qUtilise)} {pur.unitSymbol}</strong>
                <span className="mx-2 text-fg-subtle">·</span>
                <strong className="text-fg">{prepare.productName}</strong> {formatQty(prepare.stock)} → <strong className="text-ok">{formatQty(prepare.stock + qObtenu)} {uniteMade}</strong>
                {manque ? <span className="ml-2 text-danger">Le stock du pur passera en rupture.</span> : null}
              </>
            ) : 'Choisissez le pur, le préparé, puis le nombre préparé.'}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Retour</Button>
            <Button variant="primary" loading={busy} disabled={!valide} onClick={envoyer}>{!busy ? <Check className="size-4" /> : null}Valider la préparation</Button>
          </div>
        </div>
      }>
      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
        {/* 1. Le pur */}
        <section className="rounded-2xl border border-accent/30 bg-accent/[0.05] p-3">
          <p className="mb-2 text-[0.72rem] font-bold uppercase tracking-[0.12em] text-accent">1 · Article pur consommé</p>
          {pur ? (
            <>
              {carte(pur, true, () => { setPur(null); setPrepare(null); setContenanceSaisie(''); setUniteSaisie('') })}
              <div className={cn('mt-3 rounded-xl border px-3 py-2.5', manque ? 'border-danger/50 bg-danger/[0.06]' : 'border-[rgb(var(--glass-edge)/0.25)] bg-white/60')}>
                <p className="text-[0.74rem] font-semibold uppercase tracking-wide text-fg-muted">Consommé</p>
                <p className={cn('mt-0.5 text-[1.3rem] font-bold tabular-nums', manque ? 'text-danger' : 'text-fg')}>
                  {qUtilise > 0 ? `${formatQty(qUtilise)} ${pur.unitSymbol}` : `— ${pur.unitSymbol}`}
                </p>
                <p className="text-[0.74rem] text-fg-subtle">
                  {contenance ? `${formatQty(qObtenu)} × ${formatMere(contenance, pur.unitSymbol)} par ${uniteMade || 'unité'}` : 'd’après la contenance de l’article préparé'}
                </p>
              </div>
            </>
          ) : (
            <>
              <SearchField value={rechPur} onChange={setRechPur} placeholder="Quel article pur ?" autoFocus />
              <div className="mt-2 flex max-h-72 flex-col gap-1.5 overflow-y-auto">
                {purs.map((l) => carte(l, false, () => { setPur(l); setRechPur('') }))}
                {purs.length === 0 ? <p className="py-3 text-center text-[0.8rem] text-fg-muted">Aucun article ne correspond.</p> : null}
              </div>
            </>
          )}
        </section>
        <div className="hidden items-center lg:flex"><span className="text-[2rem] text-accent">→</span></div>
        {/* 2. Le préparé */}
        <section className={cn('rounded-2xl border p-3', pur ? 'border-ok/35 bg-ok/[0.05]' : 'border-[rgb(var(--glass-edge)/0.2)] bg-white/30 opacity-60')}>
          <p className="mb-2 text-[0.72rem] font-bold uppercase tracking-[0.12em] text-ok">2 · Article préparé obtenu</p>
          {!pur ? <p className="py-6 text-center text-[0.8rem] text-fg-muted">Choisissez d’abord l’article pur.</p> : prepare ? (
            <>
              {carte(prepare, true, () => { setPrepare(null); setContenanceSaisie(''); setUniteSaisie('') })}
              <label className="mt-3 block text-[0.8rem] font-medium text-fg-muted">Combien de {uniteMade} préparé{uniteMade === 'p' ? 's (portions)' : 's'} ?
                <input inputMode="decimal" value={obtenu} onChange={(e) => setObtenu(e.target.value.replace(',', '.'))} placeholder="0" autoFocus
                  aria-label="Quantité préparée obtenue" className="field mt-1 h-11 w-full px-3 text-right text-[1rem] tabular-nums" />
              </label>
              {contenanceConnue ? (
                <p className="mt-1 text-[0.74rem] text-fg-subtle">1 {prepare.unitSymbol} = {formatMere(contenanceConnue, pur.unitSymbol)} de {pur.productName} (réglé par le dispatching)</p>
              ) : (
                <div className="mt-2 rounded-xl border border-warn/40 bg-warn/[0.08] px-3 py-2 text-[0.78rem] text-fg">
                  Cet article n’est pas encore rattaché à {pur.productName}. En quoi le compte-t-on, et que contient une unité ?
                  <span className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span>1</span>
                    <select value={uniteMade} onChange={(e) => setUniteSaisie(e.target.value)} aria-label="Unité du préparé" className="field h-9 w-40 px-2 text-[0.8rem]">
                      {(unites.some((u) => u.symbol === 'p') ? [] : [{ id: 'p', symbol: 'p', name: 'Portion' }]).concat(unites).map((u) => <option key={u.id} value={u.symbol}>{u.symbol} · {u.name}</option>)}
                    </select>
                    <span>=</span>
                    <input inputMode="decimal" value={contenanceSaisie} onChange={(e) => setContenanceSaisie(e.target.value.replace(',', '.'))} placeholder="2"
                      aria-label={`Contenance de 1 ${uniteMade}`} className="field h-9 w-24 px-2 text-right tabular-nums" />
                    <span>{pur.unitSymbol} de {pur.productName}</span>
                  </span>
                  <span className="mt-1 block text-fg-muted">Retenu pour la suite : l’article se comptera en {uniteMade} et sera rattaché à {pur.productName} avec cette contenance.</span>
                </div>
              )}
            </>
          ) : (
            <>
              <SearchField value={rechPrep} onChange={setRechPrep} placeholder={`Qu’est-ce qu’on prépare à partir de ${pur.productName} ?`} autoFocus />
              <div className="mt-2 flex max-h-72 flex-col gap-1.5 overflow-y-auto">
                {candidats.map((l) => carte(l, false, () => { setPrepare(l); setRechPrep('') }))}
                {candidats.length === 0 ? <p className="py-3 text-center text-[0.8rem] text-fg-muted">Aucun article ne correspond.</p> : null}
              </div>
            </>
          )}
        </section>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr]">
        <label className="block text-[0.8rem] font-medium text-fg-muted">Journée
          <div className="mt-1"><DateField value={jour} onChange={(v) => setJour(v ?? '')} /></div>
        </label>
        <label className="block text-[0.8rem] font-medium text-fg-muted">Remarque
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="field mt-1 h-10 w-full px-3" />
        </label>
      </div>
    </Modal>
  )
}

/**
 * Dispatching : l'article mère en haut, et sous lui, reliées par des
 * flèches, les portions qu'on en tire — chacune avec son nom et ce qu'elle
 * consomme de la mère (ESCALOPE PIZZA : 300 g d'escalope). On ajoute une
 * portion, on corrige une quantité, on en retire une ; rien ne part avant
 * « Enregistrer ». Les livraisons de portions descendent alors le stock de
 * la mère d'autant.
 */
function Dispatching({ mere, lignes, onClose, onDone }: { mere: Line; lignes: Line[]; onClose: () => void; onDone: () => void }) {
  const { push } = useToast()
  const confirmer = useConfirm()
  type Ligne = { productId: string; productName: string; unitSymbol: string; quantite: string; nouvelle: boolean }
  // L'état de départ : les portions déjà en base, dans l'unité de la mère.
  const [portions, setPortions] = React.useState<Ligne[]>(
    mere.portions.map((p) => ({ productId: p.productId, productName: p.productName, unitSymbol: p.unitSymbol, quantite: String(p.motherQuantity), nouvelle: false })),
  )
  const [retirees, setRetirees] = React.useState<string[]>([])
  const [choix, setChoix] = React.useState('')
  const [recherche, setRecherche] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  // Candidats : les articles sans portions à eux, hors la mère et hors ceux déjà listés.
  const mot = normaliser(recherche)
  // Candidats : les articles finis (un préparé a déjà sa mère, une mère ne se portionne pas).
  const candidats = lignes.filter((l) =>
    l.productId !== mere.productId && l.kind === 'FINI'
    && !portions.some((p) => p.productId === l.productId)
    && correspond(mot, l.productName, l.productRef, l.categoryName))

  const ajouter = () => {
    const c = candidats.find((l) => l.productId === choix)
    if (!c) return
    setPortions((p) => [...p, { productId: c.productId, productName: c.productName, unitSymbol: c.unitSymbol, quantite: '', nouvelle: true }])
    setChoix('')
    setRecherche('')
  }
  const poser = (id: string, v: string) => {
    const n = v.replace(',', '.')
    if (n !== '' && !/^\d*\.?\d*$/.test(n)) return
    setPortions((p) => p.map((x) => (x.productId === id ? { ...x, quantite: n } : x)))
  }
  const retirer = (id: string) => {
    const p = portions.find((x) => x.productId === id)
    setPortions((l) => l.filter((x) => x.productId !== id))
    if (p && !p.nouvelle) setRetirees((r) => [...r, id])
  }

  const incompletes = portions.filter((p) => toNumber(p.quantite) <= 0)
  const enregistrer = async () => {
    if (incompletes.length > 0) {
      push('error', `${incompletes.length} portion(s) sans quantité : dites ce que chacune consomme de ${mere.productName}.`)
      return
    }
    if (retirees.length > 0) {
      const ok = await confirmer({
        title: 'Détacher des portions ?',
        message: `${retirees.length} portion(s) redeviendront des articles à la pièce : leurs livraisons ne descendront plus le stock de ${mere.productName}.`,
        confirmLabel: 'Continuer', tone: 'warn',
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      for (const id of retirees) await gql(SET_PORTION, { productId: id, parentId: null, motherQuantity: null })
      for (const p of portions) {
        const avant = mere.portions.find((x) => x.productId === p.productId)
        if (avant && avant.motherQuantity === toNumber(p.quantite)) continue
        await gql(SET_PORTION, { productId: p.productId, parentId: mere.productId, motherQuantity: toNumber(p.quantite) })
      }
      push('success', `Dispatching de ${mere.productName} enregistré : ${portions.length} portion(s).`)
      onDone()
    } catch (e) { push('error', errorMessage(e)) } finally { setBusy(false) }
  }

  return (
    <Modal title="Dispatching" onClose={onClose} wide
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-[0.83rem] text-fg-muted">{portions.length} portion{portions.length > 1 ? 's' : ''}{retirees.length > 0 ? ` · ${retirees.length} à détacher` : ''}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Annuler</Button>
            <Button variant="primary" loading={busy} onClick={enregistrer}>Enregistrer</Button>
          </div>
        </div>
      }>
      {/* La mère, en tête : c'est elle qu'on achète et qu'on entre au stock. */}
      <div className="mx-auto w-full max-w-md rounded-2xl border-2 border-accent/40 bg-accent/[0.08] px-4 py-3 text-center">
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-accent">Article pur</p>
        <p className="mt-0.5 text-[1.05rem] font-bold text-fg">{mere.productName}</p>
        <p className="text-[0.75rem] text-fg-muted">stock {formatQty(mere.stock)} {mere.unitSymbol} · entré et sorti en {mere.unitSymbol}</p>
      </div>

      {/* Les flèches : un tronc qui descend de la mère, une branche par portion. */}
      <div className="relative mx-auto mt-2 w-full max-w-2xl pl-8 sm:pl-12">
        <span aria-hidden className="absolute left-4 top-0 h-full w-0.5 bg-accent/40 sm:left-6" />
        {portions.length === 0 ? (
          <p className="relative py-4 text-[0.85rem] text-fg-muted">
            <span aria-hidden className="absolute -left-4 top-1/2 h-0.5 w-4 bg-accent/40 sm:-left-6 sm:w-6" />
            Aucune portion encore : ajoutez-en une ci-dessous.
          </p>
        ) : null}
        <ul className="space-y-2 py-2">
          {portions.map((p, i) => (
            <li key={p.productId} className="relative flex flex-wrap items-center gap-2 rounded-xl border border-[rgb(var(--glass-edge)/0.28)] bg-white/70 px-3 py-2">
              <span aria-hidden className="absolute -left-4 top-1/2 h-0.5 w-4 bg-accent/40 sm:-left-6 sm:w-6" />
              <span aria-hidden className="absolute -left-[1.15rem] top-1/2 size-2 -translate-y-1/2 rotate-45 border-r-2 border-t-2 border-accent/60 sm:-left-[1.6rem]" />
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/12 text-[0.75rem] font-bold text-accent">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.88rem] font-semibold text-fg">{p.productName}</span>
                <span className="block text-[0.72rem] text-fg-muted">servie en {p.unitSymbol}{p.nouvelle ? ' · nouvelle' : ''}</span>
              </span>
              <label className="flex items-center gap-1.5 text-[0.78rem] font-medium text-fg-muted">
                Quantité d’article pur par portion
                <input inputMode="decimal" value={p.quantite} onChange={(e) => poser(p.productId, e.target.value)} placeholder="0.300"
                  aria-label={`Quantité de ${mere.productName} par ${p.productName}`}
                  className={cn('field h-9 w-24 px-2 py-0 text-right tabular-nums', toNumber(p.quantite) <= 0 && 'border-danger/50')} autoFocus={p.nouvelle} />
                <span className="w-8 text-fg">{mere.unitSymbol}</span>
              </label>
              {toNumber(p.quantite) > 0 ? (
                <span className="text-[0.75rem] font-semibold text-accent">= {formatMere(toNumber(p.quantite), mere.unitSymbol)}</span>
              ) : null}
              <button type="button" onClick={() => retirer(p.productId)} title="Retirer cette portion" aria-label={`Retirer ${p.productName}`}
                className="grid size-7 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-danger/10 hover:text-danger">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        {/* Une nouvelle branche : l'article, puis sa quantité une fois listé. */}
        <div className="relative mt-1 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-accent/40 bg-accent/[0.04] px-3 py-2">
          <span aria-hidden className="absolute -left-4 top-1/2 h-0.5 w-4 bg-accent/40 sm:-left-6 sm:w-6" />
          <span className="text-[0.8rem] font-semibold text-accent">Ajouter une portion</span>
          <SearchField value={recherche} onChange={setRecherche} placeholder="Chercher l’article…" className="min-w-0 flex-1 basis-40" />
          <select value={choix} onChange={(e) => setChoix(e.target.value)} aria-label="Article à rattacher" className="field h-9 min-w-0 flex-1 basis-48 px-2 text-[0.83rem]">
            <option value="">— choisir —</option>
            {candidats.slice(0, 40).map((c) => <option key={c.productId} value={c.productId}>{c.productName} ({c.unitSymbol})</option>)}
          </select>
          <Button variant="secondary" size="sm" onClick={ajouter} disabled={!choix}>
            <PackagePlus className="size-3.5" />
            Ajouter
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Modifier la nature d'un article : fini, mère, ou préparé à partir d'une
 * mère (avec ce qu'une portion en consomme). Le dispatching complet d'une
 * mère se fait depuis sa propre ligne.
 */
function ModifierArticle({ article, lignes, onClose, onDone }: { article: Line; lignes: Line[]; onClose: () => void; onDone: () => void }) {
  const { push } = useToast()
  const [kind, setKind] = React.useState<Kind>(article.kind)
  const [mere, setMere] = React.useState<string>(article.mother?.productId ?? '')
  const [quantite, setQuantite] = React.useState<string>(article.mother ? String(article.mother.motherQuantity) : '')
  const [recherche, setRecherche] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  // L'inventaire : le stock réel et son coût moyen, préremplis avec ce que
  // l'écran calcule. Ne partent que s'ils ont changé.
  const [stockReel, setStockReel] = React.useState(String(article.stock))
  const [cout, setCout] = React.useState(article.unitCost === null ? '' : String(Math.round(article.unitCost * 1000) / 1000))
  const mot = normaliser(recherche)
  const meres = lignes.filter((l) => l.productId !== article.productId && l.kind !== 'PREPARE' && correspond(mot, l.productName, l.productRef))
  const choisie = lignes.find((l) => l.productId === mere) ?? null
  const inventaireChange = kind !== 'PREPARE'
    && (toNumber(stockReel) !== article.stock || (cout !== '' && toNumber(cout) !== (article.unitCost ?? 0)))
  const inventaireValide = !inventaireChange || (stockReel !== '' && toNumber(stockReel) >= 0 && cout !== '' && toNumber(cout) >= 0)
  const valide = (kind !== 'PREPARE' || (mere !== '' && toNumber(quantite) > 0)) && inventaireValide
  const valeurPrevue = toNumber(stockReel) * toNumber(cout)

  const enregistrer = async () => {
    if (!valide) return
    setBusy(true)
    try {
      if (kind === 'PREPARE') await gql(SET_PORTION, { productId: article.productId, parentId: mere, motherQuantity: toNumber(quantite) })
      else if (kind !== article.kind) await gql(SET_KIND, { productId: article.productId, kind })
      if (inventaireChange) {
        await gql(SET_LEVEL, { productId: article.productId, quantity: toNumber(stockReel), unitCost: toNumber(cout), note: 'Inventaire' })
      }
      push('success', `${article.productName} enregistré${inventaireChange ? ` — stock ${formatQty(toNumber(stockReel))} ${article.unitSymbol}, ${formatMoney(valeurPrevue)}` : ''}.`)
      onDone()
    } catch (e) { push('error', errorMessage(e)) } finally { setBusy(false) }
  }

  return (
    <Modal title={`Modifier — ${article.productName}`} onClose={onClose}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button variant="primary" loading={busy} disabled={!valide} onClick={enregistrer}>Enregistrer</Button>
        </div>
      }>
      <p className="text-[0.85rem] text-fg-muted">Quelle est la nature de cet article au stock général ?</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {(['FINI', 'MERE', 'PREPARE'] as Kind[]).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
            className={cn('rounded-xl border p-3 text-left transition-colors', kind === k ? 'border-accent/50 bg-accent/[0.08]' : 'border-[rgb(var(--glass-edge)/0.3)] bg-white/60 hover:bg-white')}>
            <span className="block text-[0.9rem] font-bold text-fg">{NATURES[k].label}</span>
            <span className="mt-0.5 block text-[0.74rem] text-fg-muted">
              {k === 'FINI' ? 'Acheté tel qu’on le sert : entre et sort un pour un.'
                : k === 'MERE' ? 'Acheté en gros, dispatché en articles préparés.'
                  : 'Une portion d’un article pur : ne s’achète pas, sort de l’article pur.'}
            </span>
          </button>
        ))}
      </div>
      {kind !== 'PREPARE' ? (
        <div className="mt-4 rounded-xl border border-[rgb(var(--glass-edge)/0.3)] bg-white/60 p-3">
          <p className="text-[0.8rem] font-semibold text-fg">Quantité en stock</p>
          <p className="text-[0.74rem] text-fg-muted">
            Calculé : {formatQty(article.stock)} {article.unitSymbol}
            {article.unitCost !== null ? ` · coût moyen ${formatMoney(article.unitCost)} · valeur ${formatMoney(article.stockValue)}` : ' · aucun coût connu'}.
            Corrigez si le comptage réel diffère : ce point devient le départ de l’article.
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <label className="block text-[0.78rem] font-medium text-fg-muted">Stock réel ({article.unitSymbol})
              <input inputMode="decimal" value={stockReel} onChange={(e) => setStockReel(e.target.value.replace(',', '.'))} className="field mt-1 h-10 w-full px-3 text-right tabular-nums" />
            </label>
            <label className="block text-[0.78rem] font-medium text-fg-muted">Coût moyen (DT / {article.unitSymbol})
              <input inputMode="decimal" value={cout} onChange={(e) => setCout(e.target.value.replace(',', '.'))} placeholder="0.000" className="field mt-1 h-10 w-full px-3 text-right tabular-nums" />
            </label>
            <div className="block text-[0.78rem] font-medium text-fg-muted">Valeur
              <p className="mt-1 flex h-10 items-center justify-end rounded-lg bg-accent/[0.08] px-3 text-[0.95rem] font-bold tabular-nums text-fg">{formatMoney(valeurPrevue)}</p>
            </div>
          </div>
          {inventaireChange ? <p className="mt-2 text-[0.76rem] font-medium text-accent">Un inventaire sera enregistré à votre nom.</p> : null}
        </div>
      ) : null}
      {kind === 'PREPARE' ? (
        <div className="mt-4 space-y-3 rounded-xl border border-warn/40 bg-warn/[0.06] p-3">
          <p className="text-[0.8rem] font-semibold text-fg">Article pur</p>
          {choisie ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-accent/30 bg-white/70 px-3 py-2">
              <span className="text-[0.88rem] font-semibold text-fg">{choisie.productName} <span className="text-[0.75rem] font-normal text-fg-muted">({choisie.unitSymbol})</span></span>
              <Button variant="ghost" size="sm" onClick={() => setMere('')}>Changer</Button>
            </div>
          ) : (
            <>
              <SearchField value={recherche} onChange={setRecherche} placeholder="Chercher l’article pur…" />
              <div className="max-h-40 overflow-y-auto rounded-lg border border-[rgb(var(--glass-edge)/0.2)] bg-white/60">
                {meres.slice(0, 30).map((m) => (
                  <button key={m.productId} type="button" onClick={() => setMere(m.productId)} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[0.85rem] hover:bg-accent/[0.08]">
                    <span className="truncate font-medium text-fg">{m.productName}</span>
                    <Badge tone={NATURES[m.kind].tone}>{NATURES[m.kind].label}</Badge>
                  </button>
                ))}
              </div>
            </>
          )}
          <label className="block text-[0.8rem] font-medium text-fg-muted">Quantité d’article pur par portion{choisie ? ` (${choisie.unitSymbol})` : ''}
            <input inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value.replace(',', '.'))} placeholder="0.300" className="field mt-1 h-10 w-40 px-3 text-right tabular-nums" />
            {choisie && toNumber(quantite) > 0 ? <span className="ml-2 text-[0.8rem] font-semibold text-accent">= {formatMere(toNumber(quantite), choisie.unitSymbol)}</span> : null}
          </label>
        </div>
      ) : null}
    </Modal>
  )
}
