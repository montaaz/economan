'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Save, RotateCcw, Search, Receipt, Upload, FileCheck2, AlertTriangle,
  Plus, Pencil, Trash2,
} from 'lucide-react'
import { GlassCard, Button, Badge, Field, EmptyState, TableWrap, Th, Td, usePending } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { FamilyBand } from '@/components/ui/family-band'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import { gql, errorMessage } from '@/lib/graphql-client'
import { cn, formatLongDate, formatQty, toNumber } from '@/lib/utils'

/** Une ligne lue dans un fichier de caisse, rapprochée de la carte. */
type ImportedLine = {
  label: string
  code: string | null
  quantity: number
  amount: number | null
  itemId: string | null
  itemName: string | null
  how: 'code' | 'name' | 'approx' | null
}

type ImportReport = {
  fileName: string
  lineCount: number
  matchedCount: number
  unmatched: ImportedLine[]
  approx: ImportedLine[]
}

export type Dept = { id: string; name: string; color: string; icon: string | null }

export type CardItem = {
  id: string
  name: string
  code: string | null
  price: number | null
  sortOrder: number
  familyId: string
  familyName: string
  department: Dept | null
}

type ItemDraft = {
  id: string | null
  familyId: string
  departmentId: string
  name: string
  code: string
  price: string
}

const SAVE = /* GraphQL */ `
  mutation SaveZ($day: Date, $lines: [SalesLineInput!]!, $note: String) {
    saveSalesReport(day: $day, lines: $lines, note: $note) { id lineCount }
  }
`
const CREATE_FAMILY = /* GraphQL */ `
  mutation CreateFamily($input: SalesFamilyInput!) { createSalesFamily(input: $input) { id name } }
`
const UPDATE_FAMILY = /* GraphQL */ `
  mutation UpdateFamily($id: ID!, $input: SalesFamilyInput!) { updateSalesFamily(id: $id, input: $input) { id name } }
`
const CREATE_ITEM = /* GraphQL */ `
  mutation CreateItem($input: SalesItemInput!) { createSalesItem(input: $input) { id } }
`
const UPDATE_ITEM = /* GraphQL */ `
  mutation UpdateItem($id: ID!, $input: SalesItemInput!) { updateSalesItem(id: $id, input: $input) { id } }
`
const DELETE_ITEM = /* GraphQL */ `
  mutation DeleteItem($id: ID!) { deleteSalesItem(id: $id) }
`

/** La recette en dinars — trois décimales, comme la monnaie du pays. */
function dinars(n: number): string {
  return `${formatQty(n, 3)} DT`
}

/**
 * Saisie de la note Z.
 *
 * Le contrôleur reprend la bande de caisse article par article. La journée
 * est celle du service, pas celle de l'horloge : le restaurant ferme à 3 h,
 * et un Z saisi à 02 h 30 appartient à la veille. Elle reste modifiable —
 * un Z se rattrape le lendemain matin.
 *
 * La carte s'amende ici même : un article qui manque devant la bande de
 * caisse se crée sans quitter l'écran, plutôt que d'attendre l'administration.
 */
export function ZForm({
  items, families, departments, day, defaultDay, saved, savedNote, savedTotal, savedByDepartment,
}: {
  items: CardItem[]
  families: { id: string; name: string }[]
  departments: Dept[]
  /** Journée affichée, déjà résolue côté serveur. */
  day: string
  /** Journée de service en cours, pour signaler un rattrapage. */
  defaultDay: string
  /** Quantités déjà enregistrées pour cette journée. */
  saved: Record<string, number>
  savedNote: string | null
  savedTotal: number | null
  savedByDepartment: {
    department: { id: string; name: string; color: string } | null
    quantity: number
    amount: number
    lineCount: number
  }[]
}) {
  const router = useRouter()
  const { push } = useToast()
  const confirmer = useConfirm()
  const [busy, setBusy] = React.useState(false)
  const [gesteEnCours, runGeste] = usePending()
  const [search, setSearch] = React.useState('')
  const [famille, setFamille] = React.useState<string | null>(null)
  // La famille en cours de création ou de renommage ; null quand la boîte est fermée.
  const [familleEdit, setFamilleEdit] = React.useState<{ id: string | null; name: string } | null>(null)
  const [service, setService] = React.useState<string | null>(null)
  const [note, setNote] = React.useState(savedNote ?? '')
  const [qty, setQty] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, String(v)])),
  )
  const [importing, setImporting] = React.useState(false)
  const [rapport, setRapport] = React.useState<ImportReport | null>(null)
  const [survol, setSurvol] = React.useState(false)
  const [article, setArticle] = React.useState<ItemDraft | null>(null)
  const fileInput = React.useRef<HTMLInputElement>(null)

  // Les quantités enregistrées reviennent quand on change de journée : sans
  // cela, l'écran garderait la saisie de la veille sur la feuille du jour.
  //
  // La dépendance est la journée, jamais l'objet : `saved` est reconstruit à
  // chaque rendu du serveur, et s'y fier réinitialisait la saisie en cours à
  // la moindre frappe — les quantités enregistrées s'affichaient alors à 0.
  const jourCharge = React.useRef(day)
  React.useEffect(() => {
    if (jourCharge.current === day) return
    jourCharge.current = day
    setQty(Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, String(v)])))
    setNote(savedNote ?? '')
    setRapport(null)
  }, [day, saved, savedNote])

  const listeFamilles = React.useMemo(() => {
    const vues: { nom: string; total: number }[] = []
    for (const i of items) {
      const f = vues.find((v) => v.nom === i.familyName)
      if (f) f.total += 1
      else vues.push({ nom: i.familyName, total: 1 })
    }
    return vues
  }, [items])

  // Les services qui vendent réellement quelque chose : afficher un rayon
  // sans article sur la carte ne mènerait qu'à un tableau vide.
  const listeServices = React.useMemo(() => {
    const m = new Map<string, { dep: Dept; total: number }>()
    let sans = 0
    for (const i of items) {
      if (!i.department) { sans += 1; continue }
      const e = m.get(i.department.id)
      if (e) e.total += 1
      else m.set(i.department.id, { dep: i.department, total: 1 })
    }
    return { services: [...m.values()], sans }
  }, [items])

  const affiches = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((i) => {
      if (famille && i.familyName !== famille) return false
      if (service === 'sans' && i.department) return false
      if (service && service !== 'sans' && i.department?.id !== service) return false
      if (!q) return true
      return i.name.toLowerCase().includes(q) || (i.code ?? '').toLowerCase().includes(q)
    })
  }, [items, search, famille, service])

  const parFamille = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const i of affiches) m.set(i.familyName, (m.get(i.familyName) ?? 0) + 1)
    return m
  }, [affiches])

  const set = (id: string, raw: string) => {
    const v = raw.replace(',', '.')
    if (v !== '' && !/^\d*\.?\d*$/.test(v)) return
    setQty((s) => ({ ...s, [id]: v }))
  }

  // Le total suit la saisie : c'est le chiffre qu'on rapproche du Z papier
  // avant d'enregistrer. Il se ventile par service, comme la caisse.
  const totaux = React.useMemo(() => {
    let articles = 0
    let quantite = 0
    let recette = 0
    const parService = new Map<string, { dep: Dept | null; quantite: number; recette: number }>()
    for (const i of items) {
      const n = toNumber(qty[i.id] ?? '')
      if (n <= 0) continue
      const montant = i.price !== null ? n * i.price : 0
      articles += 1
      quantite += n
      recette += montant
      const cle = i.department?.id ?? 'sans'
      const e = parService.get(cle) ?? { dep: i.department, quantite: 0, recette: 0 }
      e.quantite += n
      e.recette += montant
      parService.set(cle, e)
    }
    return {
      articles,
      quantite,
      recette,
      parService: [...parService.values()].sort((a, b) => b.recette - a.recette),
    }
  }, [items, qty])

  const enregistrer = async () => {
    const lines = items
      .filter((i) => toNumber(qty[i.id] ?? '') > 0)
      .map((i) => ({ itemId: i.id, quantity: toNumber(qty[i.id] ?? '') }))
    if (lines.length === 0) {
      push('error', 'Saisissez au moins une quantité vendue.')
      return
    }
    setBusy(true)
    try {
      await gql(SAVE, { day, lines, note: note.trim() || null })
      push('success', `Note Z du ${formatLongDate(day)} enregistrée — ${lines.length} article(s).`)
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const vider = () => setQty({})

  /**
   * Dépôt d'un fichier de caisse : PDF, CSV ou tableur.
   *
   * Le serveur lit et rapproche, mais n'enregistre rien : les quantités
   * reconnues remplissent le tableau, et c'est le contrôleur qui valide. Un
   * fichier mal lu ne doit jamais écrire une recette fausse en base.
   */
  const importer = async (file: File) => {
    setImporting(true)
    setRapport(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/z-import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Lecture impossible.')

      const reconnues: Record<string, string> = {}
      for (const l of data.lines as ImportedLine[]) {
        if (!l.itemId || l.quantity <= 0) continue
        // Une caisse peut sortir deux lignes pour le même article — deux
        // services, deux taux : on cumule plutôt que d'écraser.
        reconnues[l.itemId] = String(toNumber(reconnues[l.itemId] ?? '') + l.quantity)
      }
      setQty((s) => ({ ...s, ...reconnues }))
      setRapport({
        fileName: data.fileName,
        lineCount: data.lineCount,
        matchedCount: data.matchedCount,
        unmatched: (data.lines as ImportedLine[]).filter((l) => !l.itemId),
        approx: (data.lines as ImportedLine[]).filter((l) => l.how === 'approx'),
      })
      push(
        data.matchedCount === data.lineCount ? 'success' : 'info',
        `${data.matchedCount} ligne(s) reconnue(s) sur ${data.lineCount}. `
        + 'Vérifiez le tableau, puis enregistrez.',
      )
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setImporting(false)
    }
  }

  /** Crée ou modifie un article de la carte, sans quitter la saisie. */
  const enregistrerArticle = async (draft: ItemDraft) => {
    const input = {
      familyId: draft.familyId,
      departmentId: draft.departmentId || null,
      name: draft.name,
      code: draft.code.trim() || null,
      price: draft.price.trim() === '' ? null : toNumber(draft.price),
    }
    setBusy(true)
    try {
      await gql(draft.id ? UPDATE_ITEM : CREATE_ITEM, draft.id ? { id: draft.id, input } : { input })
      push('success', draft.id ? 'Article modifié.' : 'Article ajouté à la carte.')
      setArticle(null)
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const supprimerArticle = async (i: CardItem) => {
    const ok = await confirmer({
      title: `Retirer « ${i.name} » de la carte ?`,
      message: 'S’il figure déjà sur un Z, il sera archivé plutôt qu’effacé : '
        + 'les recettes passées doivent rester lisibles.',
      confirmLabel: 'Retirer',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    try {
      await gql(DELETE_ITEM, { id: i.id })
      push('success', 'Article retiré de la carte.')
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  /** Un nouvel article, pré-rempli avec la famille et le service filtrés. */
  const nouvelArticle = (familyId?: string) => setArticle({
    id: null,
    familyId: familyId
      ?? families.find((f) => f.name === famille)?.id
      ?? families[0]?.id
      ?? '',
    departmentId: service && service !== 'sans' ? service : '',
    name: '',
    code: '',
    price: '',
  })

  if (families.length === 0) {
    return (
      <GlassCard>
        <EmptyState
          icon={<Receipt className="size-6" />}
          title="La carte de vente est vide"
          description="L’administration doit d’abord créer les familles de la carte."
        />
      </GlassCard>
    )
  }

  // La ventilation affichée : celle de la saisie en cours si elle porte
  // quelque chose, sinon celle du Z enregistré.
  const ventilation = totaux.articles > 0
    ? totaux.parService.map((p) => ({
      department: p.dep,
      quantity: p.quantite,
      amount: p.recette,
    }))
    : savedByDepartment
  const recette = totaux.articles > 0 ? totaux.recette : (savedTotal ?? 0)

  return (
    <div className="space-y-3">
      {/* Le bandeau de tête : la journée, la recette en dinars, et le geste
          qui conclut. Il s'empile sur téléphone plutôt que de déborder. */}
      <div className="rounded-xl border border-accent/30 bg-accent/[0.07] px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[0.9rem] font-semibold text-fg">
              Note Z du {formatLongDate(day)}
            </p>
            <p className="mt-0.5 text-[0.8rem] text-fg-muted">
              {day === defaultDay
                ? 'Journée de service en cours — le service ferme à 3 h.'
                : 'Rattrapage d’une journée passée.'}
            </p>
            {/* La recette du jour, en dinars : c'est le chiffre qu'on
                rapproche du Z papier avant d'enregistrer. */}
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[1.35rem] font-bold tabular-nums text-fg sm:text-[1.5rem]">
                {dinars(recette)}
              </span>
              <span className="text-[0.82rem] font-medium text-fg-muted">
                {totaux.articles > 0
                  ? `${totaux.articles} article(s) · ${formatQty(totaux.quantite)} vendus`
                  : 'Aucune vente saisie'}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
            {totaux.articles > 0 ? (
              <Button variant="ghost" size="sm" onClick={vider}>
                <RotateCcw className="size-3.5" />
                Vider
              </Button>
            ) : null}
            <Button variant="success" loading={busy} onClick={enregistrer} className="flex-1 sm:flex-none">
              {!busy ? <Save className="size-4" /> : null}
              Enregistrer le Z
            </Button>
          </div>
        </div>

        {/* La recette service par service : le bar et la cuisine ne se
            lisent pas dans un total unique. */}
        {ventilation.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-accent/20 pt-2.5">
            {ventilation.map((v) => (
              <span
                key={v.department?.id ?? 'sans'}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/60 px-2.5 py-1 text-[0.8rem]"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: v.department?.color ?? 'rgb(var(--glass-edge))' }}
                />
                <span className="font-semibold text-fg">{v.department?.name ?? 'Sans service'}</span>
                <span className="font-bold tabular-nums text-accent">{dinars(v.amount)}</span>
                <span className="tabular-nums text-fg-muted">· {formatQty(v.quantity)}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Dépôt du fichier de caisse : il remplit le tableau, il ne l'enregistre
          pas. Le contrôleur garde la main sur ce qui part en base. */}
      <div
        onDragOver={(e) => { e.preventDefault(); setSurvol(true) }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault()
          setSurvol(false)
          const f = e.dataTransfer.files?.[0]
          if (f) void importer(f)
        }}
        className={cn(
          'rounded-xl border border-dashed px-3 py-3 transition-colors sm:px-4',
          survol
            ? 'border-accent/60 bg-accent/[0.10]'
            : 'border-[rgb(var(--glass-edge)/0.34)] bg-white/45',
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
              <Upload className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[0.85rem] font-semibold text-fg">Importer le fichier de caisse</p>
              <p className="text-[0.78rem] text-fg-muted">
                PDF, CSV ou tableur — les quantités reconnues remplissent le tableau.
              </p>
            </div>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.csv,.txt,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importer(f)
              e.target.value = ''
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            loading={importing}
            onClick={() => fileInput.current?.click()}
            className="w-full sm:w-auto"
          >
            {!importing ? <Upload className="size-3.5" /> : null}
            Choisir un fichier
          </Button>
        </div>

        {rapport ? (
          <div className="mt-3 space-y-2 border-t border-[rgb(var(--glass-edge)/0.18)] pt-3">
            <p className="flex flex-wrap items-center gap-2 text-[0.82rem] text-fg">
              <FileCheck2 className="size-4 shrink-0 text-ok" />
              <span className="truncate font-mono font-semibold">{rapport.fileName}</span>
              <Badge tone={rapport.matchedCount === rapport.lineCount ? 'ok' : 'warn'}>
                {rapport.matchedCount} / {rapport.lineCount} ligne(s) reconnue(s)
              </Badge>
            </p>
            {rapport.approx.length > 0 ? (
              <p className="text-[0.78rem] leading-snug text-warn">
                Rapprochement approximatif à vérifier :{' '}
                {rapport.approx.map((l) => `${l.label} → ${l.itemName}`).join(', ')}
              </p>
            ) : null}
            {rapport.unmatched.length > 0 ? (
              <p className="flex items-start gap-1.5 text-[0.78rem] leading-snug text-danger">
                <AlertTriangle className="mt-px size-3.5 shrink-0" />
                <span>
                  Non trouvés sur la carte, à ajouter ou à saisir à la main :{' '}
                  {rapport.unmatched.map((l) => `${l.label} (${formatQty(l.quantity)})`).join(', ')}
                </span>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <GlassCard overflowVisible>
        <div className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un article ou un code…"
                aria-label="Rechercher un article de la carte"
                className="field w-full py-2.5 pl-9 pr-3 text-[0.9rem]"
              />
            </label>
            <Button
              variant="primary"
              size="sm"
              onClick={() => nouvelArticle()}
              className="w-full shrink-0 sm:w-auto"
            >
              <Plus className="size-4" />
              Nouvel article
            </Button>
          </div>

          {/* Filtre par service : le bar et la cuisine se pointent l'un après
              l'autre, comme sur les écrans de l'économat. */}
          {listeServices.services.length > 0 ? (
            <div className="scroll-x -mx-1 flex gap-2 px-1 pb-1">
              <FiltreBouton actif={service === null} onClick={() => setService(null)}>
                Tous les services ({items.length})
              </FiltreBouton>
              {listeServices.services.map(({ dep, total }) => (
                <FiltreBouton
                  key={dep.id}
                  actif={service === dep.id}
                  couleur={dep.color}
                  onClick={() => setService(service === dep.id ? null : dep.id)}
                >
                  <Icon name={dep.icon ?? 'Building2'} className="size-3.5" />
                  {dep.name} ({total})
                </FiltreBouton>
              ))}
              {listeServices.sans > 0 ? (
                <FiltreBouton
                  actif={service === 'sans'}
                  onClick={() => setService(service === 'sans' ? null : 'sans')}
                >
                  Sans service ({listeServices.sans})
                </FiltreBouton>
              ) : null}
            </div>
          ) : null}

          <div className="scroll-x -mx-1 flex items-center gap-2 px-1 pb-1">
            <FiltreBouton actif={famille === null} onClick={() => setFamille(null)}>
              Toutes les familles ({items.length})
            </FiltreBouton>
            {listeFamilles.map((f) => (
              <span key={f.nom} className="inline-flex items-center">
                <FiltreBouton
                  actif={famille === f.nom}
                  onClick={() => setFamille(famille === f.nom ? null : f.nom)}
                >
                  {f.nom} ({f.total})
                </FiltreBouton>
                {/* Le crayon renomme la famille sur place, sans quitter le Z. */}
                <button
                  type="button"
                  onClick={() => setFamilleEdit({ id: families.find((x) => x.name === f.nom)?.id ?? null, name: f.nom })}
                  title={`Renommer « ${f.nom} »`}
                  aria-label={`Renommer la famille ${f.nom}`}
                  className="-ml-1 grid size-7 place-items-center rounded-full text-fg-subtle transition-colors hover:bg-accent/12 hover:text-accent"
                >
                  <Pencil className="size-3.5" />
                </button>
              </span>
            ))}
            {/* « + » : une famille de plus, à côté des autres — c'est là qu'on
                s'aperçoit qu'il en manque une. */}
            <button
              type="button"
              onClick={() => setFamilleEdit({ id: null, name: '' })}
              title="Nouvelle famille"
              aria-label="Ajouter une famille"
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-dashed border-accent/50 bg-accent/[0.06] px-3 text-[0.8rem] font-semibold text-accent transition-colors hover:bg-accent/12"
            >
              <Plus className="size-3.5" />
              Famille
            </button>
          </div>
        </div>

        {affiches.length === 0 ? (
          <EmptyState
            icon={<Receipt className="size-6" />}
            title="Aucun article"
            description="Aucun article ne correspond à ce filtre. Ajoutez-en un, ou élargissez la recherche."
          />
        ) : (
          <TableWrap minWidth="44rem">
            <thead>
              <tr>
                <Th className="w-10 text-right">#</Th>
                <Th className="w-full">Article</Th>
                <Th>Service</Th>
                <Th className="text-right">Prix</Th>
                <Th className="w-28 text-right">Vendus</Th>
                <Th className="text-right">Montant</Th>
                <Th className="text-right">Carte</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
              {affiches.map((i, k) => {
                const n = toNumber(qty[i.id] ?? '')
                const ouvre = k === 0 || affiches[k - 1].familyName !== i.familyName
                const ferme = k === affiches.length - 1
                  || affiches[k + 1].familyName !== i.familyName
                return (
                  <React.Fragment key={i.id}>
                    {ouvre ? (
                      <FamilyBand
                        name={i.familyName}
                        count={parFamille.get(i.familyName) ?? 0}
                        colSpan={7}
                      />
                    ) : null}
                    <tr className={cn(n > 0 && 'bg-ok/[0.08]')}>
                      <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{k + 1}</Td>
                      <Td className="max-w-0">
                        <p className="truncate text-[0.85rem] font-medium text-fg">{i.name}</p>
                        {i.code ? (
                          <p className="truncate font-mono text-[0.7rem] text-fg-subtle">{i.code}</p>
                        ) : null}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {i.department ? (
                          <span className="inline-flex items-center gap-1.5 text-[0.8rem] text-fg-muted">
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ background: i.department.color }}
                            />
                            {i.department.name}
                          </span>
                        ) : (
                          <span className="text-[0.8rem] text-fg-subtle">—</span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-right tabular-nums text-fg-subtle">
                        {i.price === null ? '—' : formatQty(i.price, 3)}
                      </Td>
                      <Td className="text-right">
                        <input
                          inputMode="decimal"
                          value={qty[i.id] ?? ''}
                          onChange={(e) => set(i.id, e.target.value)}
                          placeholder="0"
                          aria-label={`Quantité vendue — ${i.name}`}
                          className="field h-9 w-20 px-2 py-0 text-right text-[0.85rem] tabular-nums sm:w-24"
                        />
                      </Td>
                      <Td className="whitespace-nowrap text-right font-semibold tabular-nums">
                        {i.price === null || n <= 0 ? (
                          <span className="text-fg-subtle">—</span>
                        ) : (
                          <span className="text-fg">{dinars(n * i.price)}</span>
                        )}
                      </Td>
                      <Td className="text-right">
                        {/* La carte s'amende en place : renommer, corriger un
                            prix ou retirer une ligne sans quitter le Z. */}
                        <span className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setArticle({
                              id: i.id,
                              familyId: i.familyId,
                              departmentId: i.department?.id ?? '',
                              name: i.name,
                              code: i.code ?? '',
                              price: i.price === null ? '' : String(i.price),
                            })}
                            aria-label={`Modifier ${i.name}`}
                            className="grid size-8 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-[rgb(var(--glass-edge)/0.16)] hover:text-fg"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void runGeste(() => supprimerArticle(i))} disabled={gesteEnCours}
                            aria-label={`Retirer ${i.name}`}
                            className="grid size-8 place-items-center rounded-lg text-danger transition-colors hover:bg-danger/15"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </span>
                      </Td>
                    </tr>
                    {/* Ajouter dans cette famille, à sa place : au bout de ses
                        lignes, là où on constate qu'un article manque. */}
                    {ferme ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-1.5">
                          <button
                            type="button"
                            onClick={() => nouvelArticle(i.familyId)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-ok/45 px-2.5 py-1.5 text-[0.8rem] font-semibold text-ok transition-colors hover:bg-ok/10"
                          >
                            <Plus className="size-3.5" />
                            Ajouter un article dans « {i.familyName} »
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

      <GlassCard>
        <div className="space-y-2 p-3 sm:p-4">
          <label htmlFor="z-note" className="text-[0.82rem] font-semibold text-fg">
            Remarque sur cette journée
          </label>
          <textarea
            id="z-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Facultatif : incident de caisse, service écourté…"
            className="field w-full resize-y px-3 py-2 text-[0.85rem]"
          />
        </div>
      </GlassCard>

      {familleEdit ? (
        <FamilleModal
          famille={familleEdit}
          onClose={() => setFamilleEdit(null)}
          onDone={() => { setFamilleEdit(null); router.refresh() }}
        />
      ) : null}

      {article ? (
        <Modal
          onClose={() => setArticle(null)}
          title={article.id ? 'Modifier l’article' : 'Nouvel article'}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void enregistrerArticle(article)
            }}
          >
            <Field label="Nom" htmlFor="i-name" required>
              <input
                id="i-name"
                value={article.name}
                onChange={(e) => setArticle({ ...article, name: e.target.value })}
                required
                maxLength={120}
                placeholder="Pizza Margherita, Café express…"
                className="field"
              />
            </Field>
            <Field label="Famille" htmlFor="i-family" required>
              <select
                id="i-family"
                value={article.familyId}
                onChange={(e) => setArticle({ ...article, familyId: e.target.value })}
                className="field"
              >
                {families.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Service" htmlFor="i-dep">
              <select
                id="i-dep"
                value={article.departmentId}
                onChange={(e) => setArticle({ ...article, departmentId: e.target.value })}
                className="field"
              >
                <option value="">Aucun service</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Code caisse" htmlFor="i-code">
              <input
                id="i-code"
                value={article.code}
                onChange={(e) => setArticle({ ...article, code: e.target.value })}
                maxLength={40}
                placeholder="Facultatif — sert à relire un Z importé"
                className="field font-mono"
              />
            </Field>
            <Field label="Prix de vente (DT)" htmlFor="i-price">
              <input
                id="i-price"
                inputMode="decimal"
                value={article.price}
                onChange={(e) => setArticle({ ...article, price: e.target.value })}
                placeholder="Facultatif"
                className="field text-right tabular-nums"
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setArticle(null)}>
                Annuler
              </Button>
              <Button type="submit" variant="primary" loading={busy}>
                {article.id ? 'Enregistrer' : 'Ajouter'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}

/** Pastille de filtre, reprise des écrans de l'économat. */
function FiltreBouton({
  actif, couleur, onClick, children,
}: {
  actif: boolean
  couleur?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={actif && couleur ? { borderColor: `${couleur}66`, background: `${couleur}1f`, color: couleur } : undefined}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5',
        'text-[0.78rem] font-semibold transition-colors',
        actif && !couleur
          ? 'border-accent/40 bg-accent/12 text-accent'
          : !actif && 'border-[rgb(var(--glass-edge)/0.3)] bg-white/60 text-fg-muted hover:bg-white',
      )}
    >
      {children}
    </button>
  )
}

/**
 * Créer ou renommer une famille de la carte, depuis le Z.
 *
 * Le contrôleur saisit la bande de caisse et tombe sur une famille absente :
 * il l'ajoute ici, sans passer par l'administration, et l'article suit.
 */
function FamilleModal({
  famille, onClose, onDone,
}: {
  famille: { id: string | null; name: string }
  onClose: () => void
  onDone: () => void
}) {
  const { push } = useToast()
  const [nom, setNom] = React.useState(famille.name)
  const [busy, setBusy] = React.useState(false)
  const valide = nom.trim().length > 0 && nom.trim() !== famille.name

  const enregistrer = async () => {
    if (!valide) return
    setBusy(true)
    try {
      if (famille.id) await gql(UPDATE_FAMILY, { id: famille.id, input: { name: nom.trim() } })
      else await gql(CREATE_FAMILY, { input: { name: nom.trim() } })
      push('success', famille.id ? `Famille renommée « ${nom.trim()} ».` : `Famille « ${nom.trim()} » ajoutée.`)
      onDone()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={famille.id ? 'Renommer la famille' : 'Nouvelle famille'}
      onClose={onClose}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button variant="primary" loading={busy} disabled={!valide} onClick={enregistrer}>
            {famille.id ? 'Renommer' : 'Ajouter'}
          </Button>
        </div>
      }
    >
      <label className="block text-[0.8rem] font-medium text-fg-muted">
        Nom <span className="text-danger">*</span>
        <input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void enregistrer() }}
          maxLength={60}
          placeholder="Pizzas, Boissons chaudes, Desserts…"
          autoFocus
          className="field mt-1 h-10 w-full px-3"
        />
      </label>
      {famille.id ? (
        <p className="mt-2 text-[0.78rem] text-fg-muted">Les articles de la famille la suivent ; les Z déjà enregistrés gardent leurs montants.</p>
      ) : null}
    </Modal>
  )
}
