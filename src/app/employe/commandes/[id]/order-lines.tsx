'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, MessageSquareWarning, Pencil, Search, X } from 'lucide-react'
import { EmptyState, TableWrap, Th, Td } from '@/components/ui/glass'
import { FilterBadge, FilterReset } from '@/components/ui/filter-badge'
import { FamilyBand, countByFamily } from '@/components/ui/family-band'
import { useToast } from '@/components/ui/toast'
import { gql, errorMessage } from '@/lib/graphql-client'
import { cn, formatQty, toNumber } from '@/lib/utils'

export type OrderLine = {
  id: string
  productId: string
  productName: string
  productRef: string
  categoryName: string
  unitSymbol: string
  stockFixe: number
  quantityOnHand: number
  quantityAsked: number
  quantityServed: number | null
  // Optionnels : le ticket papier ne les demande pas toujours.
  quantityReceived?: number | null
  receiptGap?: number | null
  status: 'PENDING' | 'VALIDATED' | 'ADJUSTED' | 'REJECTED'
  rejectReason: string | null
}

const UPDATE = /* GraphQL */ `
  mutation UpdateOrder($id: ID!, $lines: [OrderLineInput!]!) {
    updateOrder(id: $id, lines: $lines) { id }
  }
`

/**
 * Détail des lignes d'une commande.
 *
 * Tant que l'économat n'a rien pris en charge, son auteur corrige une ligne
 * sur place : le crayon ouvre le stock compté, et la quantité commandée se
 * recalcule côté serveur (stock fixe moins ce qui reste en rayon). Rouvrir
 * toute la feuille pour un seul chiffre obligeait à retrouver l'article parmi
 * plus de cent.
 */
export function OrderLines({
  orderId, lines, editable, showReceived,
}: {
  orderId: string
  lines: OrderLine[]
  /** L'auteur d'une commande encore en attente, et lui seul. */
  editable: boolean
  showReceived: boolean
}) {
  const router = useRouter()
  const { push } = useToast()

  const [search, setSearch] = React.useState('')
  const [famille, setFamille] = React.useState<string | null>(null)
  // Filtre par état : voir d'un coup les articles non livrés ou servis en
  // quantité différente, sans les chercher un à un dans la feuille.
  const [etat, setEtat] = React.useState<'REJECTED' | 'ADJUSTED' | 'VALIDATED' | null>(null)

  // Le rang est celui de la feuille, figé une fois pour toutes : filtrer
  // renumérote les lignes de 1 à n, et « l'article 87 » ne désignerait plus
  // rien entre deux écrans. On le calcule donc avant tout filtrage.
  const numerotees = React.useMemo(
    () => lines.map((l, i) => ({ ...l, rang: i + 1 })),
    [lines],
  )

  const familles = React.useMemo(() => {
    const vues: { nom: string; total: number }[] = []
    for (const l of lines) {
      const f = vues.find((v) => v.nom === l.categoryName)
      if (f) f.total += 1
      else vues.push({ nom: l.categoryName, total: 1 })
    }
    return vues
  }, [lines])

  const counts = React.useMemo(() => ({
    rejected: lines.filter((l) => l.status === 'REJECTED').length,
    adjusted: lines.filter((l) => l.status === 'ADJUSTED').length,
    // Servi exactement ce qui était commandé : le reste de la feuille.
    validated: lines.filter((l) => l.status === 'VALIDATED').length,
  }), [lines])

  const affichees = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return numerotees.filter((l) => {
      if (etat && l.status !== etat) return false
      if (famille && l.categoryName !== famille) return false
      if (!q) return true
      // Même recherche qu'à la saisie : sur le nom ou sur la référence.
      return (
        l.productName.toLowerCase().includes(q) || l.productRef.toLowerCase().includes(q)
      )
    })
  }, [numerotees, search, famille, etat])

  // Le compte accompagne le nom sur le bandeau : il porte sur ce qui est
  // réellement affiché, donc il suit le filtre.
  const parFamille = React.useMemo(() => countByFamily(affichees), [affichees])

  const [editing, setEditing] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  // La virgule des claviers français vaut point, et rien d'autre ne passe :
  // une lettre dans la case donnerait 0 sans rien signaler.
  const saisir = (raw: string) => {
    const v = raw.replace(',', '.')
    if (v !== '' && !/^\d*\.?\d*$/.test(v)) return
    setDraft(v)
  }

  // # · Article · Stock fixe · Mon stock · Commande · Servi, plus Reçu et
  // Modifier selon le cas. Un bandeau trop court laisserait un trou blanc au
  // bout de la ligne.
  const colonnes = 6 + (showReceived ? 1 : 0) + (editable ? 1 : 0)

  function ouvrir(l: OrderLine) {
    setEditing(l.id)
    setDraft(String(l.quantityOnHand))
  }

  async function enregistrer(ligne: OrderLine) {
    if (draft.trim() === '') {
      push('error', 'Indiquez le stock compté.')
      return
    }
    const stock = toNumber(draft)
    // Un rayon ne contient pas plus que sa cible : au-delà, c'est une faute de
    // frappe, et le serveur refuse de toute façon.
    if (ligne.stockFixe > 0 && stock > ligne.stockFixe) {
      push(
        'error',
        `Stock fixe de ${formatQty(ligne.stockFixe)} ${ligne.unitSymbol} : `
          + 'un rayon ne peut pas en contenir davantage.',
      )
      return
    }
    if (stock === ligne.quantityOnHand) {
      setEditing(null)
      return
    }
    // Un stock qui atteint la cible ramène la ligne à zéro : l'article reste
    // affiché tant que la commande est modifiable, donc rien ne disparaît sous
    // les yeux. Mais une commande entièrement à zéro n'existe plus — le
    // serveur la refuserait, et l'employé se retrouverait devant une erreur
    // technique là où il voulait simplement tout annuler.
    const reste = lines.some((l) =>
      l.id === ligne.id ? stock < l.stockFixe : l.quantityAsked > 0,
    )
    if (!reste) {
      push(
        'error',
        'Ce serait la dernière ligne de la commande. Une commande vide ne peut pas être '
          + 'enregistrée : annulez-la depuis « Refaire la feuille ».',
      )
      return
    }

    setBusy(true)
    try {
      await gql(UPDATE, {
        id: orderId,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantityOnHand: l.id === ligne.id ? stock : l.quantityOnHand,
        })),
      })
      const commande = Math.max(ligne.stockFixe - stock, 0)
      push(
        'success',
        commande > 0
          ? `${ligne.productName} : ${formatQty(commande)} ${ligne.unitSymbol} commandé.`
          : `${ligne.productName} : rien à commander, le rayon couvre le stock fixe.`,
      )
      setEditing(null)
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* Même barre qu'à la saisie : sur cent lignes, retrouver un article en
          faisant défiler est un travail en soi. */}
      <div className="no-print space-y-3 border-b border-[rgb(var(--glass-edge)/0.16)] p-3.5">
        {/* Ce qui cloche se compte en tête, et se montre au clic : chercher
            trois ruptures parmi cent lignes était le travail que ce compteur
            doit épargner. */}
        {counts.rejected > 0 || counts.adjusted > 0 || counts.validated > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {counts.rejected > 0 ? (
              <FilterBadge
                tone="danger"
                actif={etat === 'REJECTED'}
                onClick={() => setEtat(etat === 'REJECTED' ? null : 'REJECTED')}
                label={etat === 'REJECTED'
                  ? 'Afficher de nouveau tous les articles'
                  : `N’afficher que les ${counts.rejected} article(s) en rupture`}
              >
                {counts.rejected} rupture{counts.rejected > 1 ? 's' : ''}
              </FilterBadge>
            ) : null}
            {counts.adjusted > 0 ? (
              <FilterBadge
                tone="warn"
                actif={etat === 'ADJUSTED'}
                onClick={() => setEtat(etat === 'ADJUSTED' ? null : 'ADJUSTED')}
                label={etat === 'ADJUSTED'
                  ? 'Afficher de nouveau tous les articles'
                  : `N’afficher que les ${counts.adjusted} article(s) servi(s) en quantité différente`}
              >
                {counts.adjusted} ajustée{counts.adjusted > 1 ? 's' : ''}
              </FilterBadge>
            ) : null}
            {counts.validated > 0 ? (
              <FilterBadge
                tone="ok"
                actif={etat === 'VALIDATED'}
                onClick={() => setEtat(etat === 'VALIDATED' ? null : 'VALIDATED')}
                label={etat === 'VALIDATED'
                  ? 'Afficher de nouveau tous les articles'
                  : `N’afficher que les ${counts.validated} article(s) servi(s) comme demandé`}
              >
                {counts.validated} conforme{counts.validated > 1 ? 's' : ''}
              </FilterBadge>
            ) : null}
            {etat !== null ? (
              <FilterReset total={lines.length} onClick={() => setEtat(null)} />
            ) : null}
          </div>
        ) : null}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un article ou une référence…"
            className="field pl-9"
            aria-label="Rechercher un article dans la commande"
          />
        </div>

        <div className="scroll-x -mx-1 flex gap-1.5 px-1 pb-1">
          <button
            type="button"
            onClick={() => setFamille(null)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-[0.78rem] font-medium transition-colors',
              famille === null
                ? 'border-accent/40 bg-accent/12 text-accent'
                : 'border-[rgb(var(--glass-edge)/0.28)] text-fg-muted hover:bg-[rgb(var(--glass-edge)/0.14)]',
            )}
          >
            Tout ({lines.length})
          </button>
          {familles.map((f) => (
            <button
              key={f.nom}
              type="button"
              onClick={() => setFamille(f.nom)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-[0.78rem] font-medium transition-colors',
                famille === f.nom
                  ? 'border-accent/40 bg-accent/12 text-accent'
                  : 'border-[rgb(var(--glass-edge)/0.28)] text-fg-muted hover:bg-[rgb(var(--glass-edge)/0.14)]',
              )}
            >
              {f.nom} ({f.total})
            </button>
          ))}
        </div>

        {/* Une liste filtrée ne dit pas d'elle-même qu'elle est partielle :
            sans ce compte, on croirait la commande plus courte qu'elle n'est. */}
        {affichees.length !== lines.length ? (
          <p className="text-[0.8rem] text-fg-muted">
            {affichees.length} article{affichees.length > 1 ? 's' : ''} sur {lines.length}
            <button
              type="button"
              onClick={() => { setSearch(''); setFamille(null); setEtat(null) }}
              className="ml-2 font-medium text-accent hover:underline"
            >
              Tout afficher
            </button>
          </p>
        ) : null}
      </div>

      {affichees.length === 0 ? (
        <EmptyState
          icon={<Search className="size-6" />}
          title="Aucun article"
          description="Aucun article de cette commande ne correspond à votre recherche."
        />
      ) : (
    <TableWrap minWidth={editable ? '52rem' : '46rem'}>
      <thead>
        <tr>
          <Th className="w-10 text-right">#</Th>
          <Th className="w-full">Article</Th>
          {/* Les deux valeurs d'où sort la quantité commandée : la cible du
              département moins ce qui restait en rayon. Sans elles, un chiffre
              inattendu reste inexplicable. */}
          <Th className="text-right">Stock fixe</Th>
          <Th className="text-right">Mon stock</Th>
          {/* Même intitulé que l'écran de l'économat et la feuille papier :
              une seule notion, un seul mot. */}
          <Th className="text-right">Commande</Th>
          <Th className="text-right">Servi</Th>
          {showReceived ? <Th className="text-right">Reçu</Th> : null}
          {editable ? <Th className="text-right">Modifier</Th> : null}
        </tr>
      </thead>
      <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
        {affichees.map((l, i) => {
          const ouvert = editing === l.id
          return (
            <React.Fragment key={l.id}>
              {i === 0 || affichees[i - 1].categoryName !== l.categoryName ? (
                <FamilyBand
                  name={l.categoryName}
                  count={parFamille.get(l.categoryName) ?? 0}
                  colSpan={colonnes}
                />
              ) : null}
              <tr
                className={cn(
                  l.status === 'REJECTED' && 'bg-danger/[0.06]',
                  ouvert && 'bg-accent/[0.08]',
                )}
              >
                <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{l.rang}</Td>
                <Td className="max-w-0">
                  <p className="truncate text-[0.85rem] font-medium text-fg">{l.productName}</p>
                  {/* La famille est portée par le bandeau : la répéter sous
                      chaque nom allongeait sans rien apprendre. */}
                  <p className="truncate font-mono text-[0.7rem] text-fg-subtle">{l.productRef}</p>
                  {/* La colonne d'état a disparu : sans ce report, un article
                      en rupture n'aurait plus nulle part où dire pourquoi.
                      C'est le motif saisi par l'économat, « sera disponible
                      dans 2 jours » — précisément ce qu'il faut savoir. */}
                  {l.rejectReason ? (
                    <p className="mt-0.5 flex items-start gap-1 text-[0.75rem] font-medium leading-snug text-danger">
                      <MessageSquareWarning className="mt-px size-3.5 shrink-0" />
                      {l.rejectReason}
                    </p>
                  ) : null}
                </Td>
                <Td className="whitespace-nowrap text-right tabular-nums text-fg-subtle">
                  {formatQty(l.stockFixe)} {l.unitSymbol}
                </Td>
                <Td className="whitespace-nowrap text-right tabular-nums text-fg-subtle">
                  {ouvert ? (
                    <input
                      autoFocus
                      type="text"
                      inputMode="decimal"
                      value={draft}
                      disabled={busy}
                      onChange={(e) => saisir(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void enregistrer(l)
                        }
                        if (e.key === 'Escape') setEditing(null)
                      }}
                      aria-label={`Mon stock de ${l.productName}`}
                      className="w-20 rounded-lg border border-accent/50 bg-white px-2 py-1 text-right text-[0.9rem] font-semibold tabular-nums text-fg outline-none focus:ring-2 focus:ring-accent/30"
                    />
                  ) : (
                    <>
                      {formatQty(l.quantityOnHand)} {l.unitSymbol}
                    </>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-right font-semibold tabular-nums text-fg">
                  {/* Pendant la saisie, la quantité suit ce qui est tapé : on
                      voit ce qu'on commande avant de valider. */}
                  {ouvert && draft.trim() !== ''
                    ? `${formatQty(Math.max(l.stockFixe - toNumber(draft), 0))} ${l.unitSymbol}`
                    : ouvert
                      ? '—'
                      : `${formatQty(l.quantityAsked)} ${l.unitSymbol}`}
                </Td>
                <Td className="whitespace-nowrap text-right font-medium tabular-nums text-fg">
                  {l.quantityServed === null ? '—' : `${formatQty(l.quantityServed)} ${l.unitSymbol}`}
                </Td>
                {showReceived ? (
                  <Td className="whitespace-nowrap text-right tabular-nums">
                    {l.quantityReceived == null ? (
                      <span className="text-fg-subtle">—</span>
                    ) : (
                      <span className={cn((l.receiptGap ?? 0) !== 0 && 'font-bold text-warn')}>
                        {formatQty(l.quantityReceived)} {l.unitSymbol}
                        {(l.receiptGap ?? 0) !== 0 ? (
                          <span className="ml-1 text-[0.72rem]">
                            ({(l.receiptGap ?? 0) > 0 ? '+' : ''}{formatQty(l.receiptGap ?? 0)})
                          </span>
                        ) : null}
                      </span>
                    )}
                  </Td>
                ) : null}
                {editable ? (
                  <Td className="text-right">
                    {ouvert ? (
                      <span className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void enregistrer(l)}
                          aria-label={`Enregistrer ${l.productName}`}
                          title="Enregistrer"
                          className="grid size-8 place-items-center rounded-lg bg-ok text-white transition-colors hover:bg-ok/85 disabled:opacity-60"
                        >
                          {busy ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Check className="size-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setEditing(null)}
                          aria-label={`Annuler la modification de ${l.productName}`}
                          title="Annuler"
                          className="grid size-8 place-items-center rounded-lg border border-[rgb(var(--glass-edge)/0.3)] text-fg-muted transition-colors hover:bg-[rgb(var(--glass-edge)/0.14)] disabled:opacity-60"
                        >
                          <X className="size-4" />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => ouvrir(l)}
                        aria-label={`Modifier ${l.productName}`}
                        title="Modifier cette ligne"
                        className="grid size-8 place-items-center rounded-lg border border-[rgb(var(--glass-edge)/0.3)] text-accent transition-colors hover:border-accent/50 hover:bg-accent/10 disabled:opacity-40"
                      >
                        <Pencil className="size-4" />
                      </button>
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
    </>
  )
}
