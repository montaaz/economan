'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, PackagePlus, Scissors, Trash2, Warehouse, AlertTriangle, Pencil, History, ArrowDownToLine } from 'lucide-react'
import { GlassCard, Button, Badge, EmptyState, TableWrap, Th, Td, usePending } from '@/components/ui/glass'
import { Modal } from '@/components/ui/modal'
import { SearchField } from '@/components/ui/search-field'
import { DateField } from '@/components/ui/date-field'
import { useConfirm } from '@/components/ui/confirm'
import { useToast } from '@/components/ui/toast'
import { gql, errorMessage } from '@/lib/graphql-client'
import { correspond, normaliser } from '@/lib/search'
import { cn, formatDate, formatMoney, formatQty, formatTime, toNumber, toDateKey } from '@/lib/utils'

const QUERY = /* GraphQL */ `
  query GeneralStock {
    generalStock {
      totalValue
      negativeCount
      lines {
        productId productName productRef categoryName unitSymbol kind
        mother { productId productName unitSymbol motherQuantity }
        portions { productId productName productRef unitSymbol motherQuantity }
        entered delivered stock unitCost stockValue lastEntryAt
      }
    }
    stockEntries(limit: 200) {
      id quantity unitPrice total reference note businessDay createdAt
      product { id name reference baseUnit { symbol } }
      createdBy { fullName }
    }
    stockProducts { id name reference category { name } baseUnit { symbol } }
  }
`
const ADD_ENTRY = /* GraphQL */ `
  mutation AddStockEntry($productId: ID!, $quantity: Float!, $unitPrice: Float!, $reference: String, $note: String, $day: Date) {
    addStockEntry(productId: $productId, quantity: $quantity, unitPrice: $unitPrice, reference: $reference, note: $note, day: $day) { id }
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
  portions: Portion[]; entered: number; delivered: number; stock: number; unitCost: number | null
  stockValue: number; lastEntryAt: string | null
}
const NATURES: Record<Kind, { label: string; tone: 'accent' | 'ok' | 'warn' }> = {
  MERE: { label: 'Mère', tone: 'accent' },
  FINI: { label: 'Fini', tone: 'ok' },
  PREPARE: { label: 'Préparé', tone: 'warn' },
}
type Entry = {
  id: string; quantity: number; unitPrice: number; total: number; reference: string | null; note: string | null
  businessDay: string; createdAt: string
  product: { id: string; name: string; reference: string; baseUnit: { symbol: string } }
  createdBy: { fullName: string }
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
  const entreesJour = (data?.stockEntries ?? []).filter((e) => e.businessDay.slice(0, 10) === aujourdhui)
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
      <div className={cn('grid gap-3', admin ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        {admin ? (
          <GlassCard className="p-4">
            <p className="text-[0.74rem] font-semibold uppercase tracking-wide text-fg-muted">Valeur du stock</p>
            <p className="mt-1 text-[1.5rem] font-bold tabular-nums text-fg">{data ? formatMoney(data.generalStock.totalValue) : '…'}</p>
            <p className="text-[0.78rem] text-fg-muted">Entrées − livraisons, au coût moyen</p>
          </GlassCard>
        ) : null}
        {/* Les entrées du jour, en carte : un clic ouvre leur liste. Le
            passé, lui, se lit dans l'historique. */}
        <button type="button" onClick={() => setJournal(true)} className="text-left">
          <GlassCard className="h-full border-danger/30 p-4 transition-colors hover:bg-danger/[0.04]">
            <p className="flex items-center gap-1.5 text-[0.74rem] font-semibold uppercase tracking-wide text-danger"><ArrowDownToLine className="size-3.5" /> Entrées aujourd’hui</p>
            <p className="mt-1 text-[1.5rem] font-bold tabular-nums text-fg">{data ? (admin ? formatMoney(totalJour) : `${entreesJour.length} arrivage${entreesJour.length > 1 ? 's' : ''}`) : '…'}</p>
            <p className="text-[0.78rem] text-fg-muted">{data ? (admin ? `${entreesJour.length} arrivage${entreesJour.length > 1 ? 's' : ''} · voir la liste` : 'voir la liste') : '…'}</p>
          </GlassCard>
        </button>
        <button type="button" onClick={() => setNegatifs((v) => !v)} aria-pressed={negatifs} className="text-left">
          <GlassCard className={cn('h-full p-4 transition-colors', (data?.generalStock.negativeCount ?? 0) > 0 && 'border-danger/40', negatifs && 'ring-2 ring-danger/40')}>
            <p className="text-[0.74rem] font-semibold uppercase tracking-wide text-fg-muted">Stock négatif</p>
            <p className={cn('mt-1 text-[1.5rem] font-bold tabular-nums', (data?.generalStock.negativeCount ?? 0) > 0 ? 'text-danger' : 'text-fg')}>{data?.generalStock.negativeCount ?? '…'}</p>
            <p className="text-[0.78rem] text-fg-muted">{negatifs ? 'filtre actif · cliquer pour tout revoir' : 'plus sorti qu’entré : cliquer pour les voir'}</p>
          </GlassCard>
        </button>
      </div>

      <GlassCard overflowVisible>
        <div className="flex flex-wrap items-center gap-2 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
          <SearchField value={recherche} onChange={setRecherche} className="min-w-0 flex-1 basis-56 sm:max-w-md" />
          <div className="flex flex-wrap items-center gap-1.5">
            {([['tous', 'Tous', null], ['MERE', 'Articles mères', 'MERE'], ['FINI', 'Articles finis', 'FINI'], ['PREPARE', 'Articles préparés', 'PREPARE']] as const).map(([v, l, k]) => (
              <button key={v} type="button" onClick={() => setNature(v)} aria-pressed={nature === v}
                className={cn('h-9 rounded-full border px-3 text-[0.8rem] font-semibold transition-colors',
                  nature === v ? 'border-accent/40 bg-accent/12 text-accent' : 'border-[rgb(var(--glass-edge)/0.34)] bg-white/65 text-fg-muted hover:bg-white hover:text-fg')}>
                {l}{data && k ? <span className="ml-1 text-[0.72rem] opacity-70">({compte(k)})</span> : null}
              </button>
            ))}
          </div>
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
                {admin ? <Th className="w-28" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
              {lignes.map((l, i) => {
                const negatif = l.stock < -1e-9
                const ouvre = i === 0 || lignes[i - 1].categoryName !== l.categoryName
                return (
                  <React.Fragment key={l.productId}>
                    {ouvre ? (
                      <tr><td colSpan={admin ? 8 : 5} className="bg-ok/12 px-3 py-1.5 text-[0.74rem] font-bold uppercase tracking-[0.06em] text-ok">{l.categoryName}</td></tr>
                    ) : null}
                    <tr className={cn(negatif && 'bg-danger/[0.06]', l.kind === 'PREPARE' && 'bg-warn/[0.04]')}>
                      <Td className="max-w-0">
                        <p className="truncate text-[0.85rem] font-medium text-fg">{l.productName}</p>
                        <p className="truncate font-mono text-[0.7rem] text-fg-subtle">{l.productRef}{l.lastEntryAt ? <span className="ml-2 font-sans">dernière entrée {formatDate(l.lastEntryAt)}</span> : null}</p>
                        {l.mother ? (
                          <p className="mt-0.5 text-[0.74rem] text-fg-muted">← {l.mother.productName} · {formatMere(l.mother.motherQuantity, l.mother.unitSymbol)} par portion</p>
                        ) : null}
                        {l.portions.length > 0 ? (
                          <p className="mt-1 flex flex-wrap gap-1">
                            {l.portions.map((p) => (
                              <button key={p.productId} type="button" disabled={!admin} onClick={() => setPortion(l)}
                                className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[0.72rem] font-medium text-accent disabled:cursor-default">
                                <Scissors className="size-3" />{p.productName} · {formatMere(p.motherQuantity, l.unitSymbol)}
                              </button>
                            ))}
                          </p>
                        ) : null}
                      </Td>
                      <Td><Badge tone={NATURES[l.kind].tone}>{NATURES[l.kind].label}</Badge></Td>
                      {l.kind === 'PREPARE' ? (
                        <>
                          <Td className="text-right text-fg-subtle">—</Td>
                          <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">{formatQty(l.delivered)} {l.unitSymbol}</Td>
                          <Td className="whitespace-nowrap text-right text-[0.78rem] text-fg-subtle">dans la mère</Td>
                          {admin ? <Td className="text-right text-fg-subtle">—</Td> : null}
                          {admin ? <Td className="text-right text-fg-subtle">—</Td> : null}
                        </>
                      ) : (
                        <>
                          <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">{formatQty(l.entered)} {l.unitSymbol}</Td>
                          <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">{formatQty(l.delivered)} {l.unitSymbol}</Td>
                          <Td className={cn('whitespace-nowrap text-right font-bold tabular-nums', negatif ? 'text-danger' : 'text-fg')}>
                            {negatif ? <AlertTriangle className="mr-1 inline size-3.5" /> : null}{formatQty(l.stock)} {l.unitSymbol}
                          </Td>
                          {admin ? <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">{l.unitCost === null ? '—' : formatMoney(l.unitCost)}</Td> : null}
                          {admin ? <Td className="whitespace-nowrap text-right font-semibold tabular-nums text-fg">{l.unitCost === null ? '—' : formatMoney(l.stockValue)}</Td> : null}
                        </>
                      )}
                      {admin ? (
                        <Td>
                          {l.kind === 'MERE' ? (
                            <Button variant="ghost" size="sm" onClick={() => setPortion(l)} title="Dispatching : les articles préparés tirés de cette mère">
                              <Scissors className="size-3.5" />
                              Dispatching
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => setModif(l)} title="Modifier la nature de cet article">
                              <Pencil className="size-3.5" />
                              Modifier
                            </Button>
                          )}
                        </Td>
                      ) : null}
                    </tr>
                  </React.Fragment>
                )
              })}
            </tbody>
          </TableWrap>
        )}
      </GlassCard>

      {journal && data ? (
        <Modal title={admin ? `Entrées d’aujourd’hui — ${formatMoney(totalJour)}` : 'Entrées d’aujourd’hui'} onClose={() => setJournal(false)} wide
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
            <EmptyState icon={<PackagePlus className="size-6" />} title="Aucune entrée aujourd’hui" description="Saisissez un arrivage avec « Nouvelle entrée »." />
          ) : (
            <TableWrap minWidth="40rem">
              <thead>
                <tr>
                  <Th>Heure</Th>
                  <Th className="w-full">Article</Th>
                  <Th className="text-right">Quantité</Th>
                  {admin ? <Th className="text-right">Prix unitaire</Th> : null}
                  {admin ? <Th className="text-right">Total</Th> : null}
                  <Th>Référence</Th>
                  <Th>Par</Th>
                  {admin ? <Th className="w-10" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
                {entreesJour.map((e) => (
                  <tr key={e.id} className="bg-danger/[0.04] shadow-[inset_3px_0_0_0_var(--danger)]">
                    <Td className="whitespace-nowrap text-[0.8rem] text-fg-muted">{formatTime(e.createdAt)}</Td>
                    <Td className="max-w-0"><p className="truncate text-[0.85rem] font-medium text-fg">{e.product.name}</p>{e.note ? <p className="truncate text-[0.72rem] text-fg-subtle">{e.note}</p> : null}</Td>
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
      {modif && data ? (
        <ModifierArticle article={modif} lignes={data.generalStock.lines} onClose={() => setModif(null)} onDone={() => { setModif(null); recharger() }} />
      ) : null}
    </div>
  )
}

/** Un arrivage : l'article, la quantité, le prix — et la facture. */
function NouvelleEntree({ produits, onClose, onDone }: { produits: Produit[]; onClose: () => void; onDone: () => void }) {
  const { push } = useToast()
  const [recherche, setRecherche] = React.useState('')
  const [produit, setProduit] = React.useState<Produit | null>(null)
  const [quantite, setQuantite] = React.useState('')
  const [prix, setPrix] = React.useState('')
  const [reference, setReference] = React.useState('')
  const [note, setNote] = React.useState('')
  const [jour, setJour] = React.useState(toDateKey(new Date()))
  const [busy, setBusy] = React.useState(false)
  const mot = normaliser(recherche)
  const choix = produits.filter((p) => correspond(mot, p.name, p.reference, p.category.name)).slice(0, 12)
  const total = toNumber(quantite) * toNumber(prix)
  const valide = produit && toNumber(quantite) > 0 && toNumber(prix) >= 0 && prix !== ''

  const envoyer = async () => {
    if (!valide || !produit) return
    setBusy(true)
    try {
      await gql(ADD_ENTRY, { productId: produit.id, quantity: toNumber(quantite), unitPrice: toNumber(prix), reference: reference.trim() || null, note: note.trim() || null, day: jour || null })
      push('success', `${formatQty(toNumber(quantite))} ${produit.baseUnit.symbol} de ${produit.name} entrés au stock — ${formatMoney(total)}.`)
      onDone()
    } catch (e) { push('error', errorMessage(e)) } finally { setBusy(false) }
  }

  return (
    <Modal title="Nouvelle entrée au stock général" onClose={onClose} wide
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-[0.85rem] text-fg-muted">Total : <strong className="text-fg">{formatMoney(total)}</strong></span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Annuler</Button>
            <Button variant="primary" loading={busy} disabled={!valide} onClick={envoyer}>
              {!busy ? <PackagePlus className="size-4" /> : null}
              Entrer au stock
            </Button>
          </div>
        </div>
      }>
      <div className="space-y-3">
        {produit ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-accent/30 bg-accent/[0.07] px-3 py-2">
            <span className="min-w-0"><span className="block truncate text-[0.9rem] font-bold text-fg">{produit.name}</span><span className="block font-mono text-[0.72rem] text-fg-subtle">{produit.reference} · {produit.category.name}</span></span>
            <Button variant="ghost" size="sm" onClick={() => setProduit(null)}>Changer</Button>
          </div>
        ) : (
          <>
            <SearchField value={recherche} onChange={setRecherche} placeholder="Quel article entre ?" autoFocus />
            <div className="max-h-56 overflow-y-auto rounded-xl border border-[rgb(var(--glass-edge)/0.2)]">
              {choix.length === 0 ? <p className="px-3 py-4 text-center text-[0.83rem] text-fg-muted">Aucun article ne correspond.</p> : choix.map((p) => (
                <button key={p.id} type="button" onClick={() => setProduit(p)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/[0.08]">
                  <span className="min-w-0"><span className="block truncate text-[0.85rem] font-medium text-fg">{p.name}</span><span className="block font-mono text-[0.7rem] text-fg-subtle">{p.reference} · {p.category.name}</span></span>
                  <Badge tone="neutral">{p.baseUnit.symbol}</Badge>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-[0.8rem] font-medium text-fg-muted">Quantité{produit ? ` (${produit.baseUnit.symbol})` : ''}
            <input inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value.replace(',', '.'))} placeholder="0" className="field mt-1 h-10 w-full px-3 text-right tabular-nums" />
          </label>
          <label className="block text-[0.8rem] font-medium text-fg-muted">Prix unitaire (DT)
            <input inputMode="decimal" value={prix} onChange={(e) => setPrix(e.target.value.replace(',', '.'))} placeholder="0.000" className="field mt-1 h-10 w-full px-3 text-right tabular-nums" />
          </label>
          <label className="block text-[0.8rem] font-medium text-fg-muted">Journée
            <div className="mt-1"><DateField value={jour} onChange={(v) => setJour(v ?? '')} /></div>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[0.8rem] font-medium text-fg-muted">Référence facture / bon fournisseur
            <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} className="field mt-1 h-10 w-full px-3" />
          </label>
          <label className="block text-[0.8rem] font-medium text-fg-muted">Remarque
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="field mt-1 h-10 w-full px-3" />
          </label>
        </div>
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
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-accent">Article mère</p>
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
                Quantité de mère par portion
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
                  : 'Une portion d’une mère : ne s’achète pas, sort de la mère.'}
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
          <p className="text-[0.8rem] font-semibold text-fg">Article mère</p>
          {choisie ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-accent/30 bg-white/70 px-3 py-2">
              <span className="text-[0.88rem] font-semibold text-fg">{choisie.productName} <span className="text-[0.75rem] font-normal text-fg-muted">({choisie.unitSymbol})</span></span>
              <Button variant="ghost" size="sm" onClick={() => setMere('')}>Changer</Button>
            </div>
          ) : (
            <>
              <SearchField value={recherche} onChange={setRecherche} placeholder="Chercher la mère…" />
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
          <label className="block text-[0.8rem] font-medium text-fg-muted">Quantité de mère par portion{choisie ? ` (${choisie.unitSymbol})` : ''}
            <input inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value.replace(',', '.'))} placeholder="0.300" className="field mt-1 h-10 w-40 px-3 text-right tabular-nums" />
            {choisie && toNumber(quantite) > 0 ? <span className="ml-2 text-[0.8rem] font-semibold text-accent">= {formatMere(toNumber(quantite), choisie.unitSymbol)}</span> : null}
          </label>
        </div>
      ) : null}
    </Modal>
  )
}
