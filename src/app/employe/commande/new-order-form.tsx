'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Search, Send, Trash2, PackageSearch, ListChecks } from 'lucide-react'
import { GlassCard, Button, EmptyState, TableWrap, Th, Td } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { useToast } from '@/components/ui/toast'
import { gql, errorMessage } from '@/lib/graphql-client'
import { cn, formatLongDate, formatQty, toNumber } from '@/lib/utils'
import { usePagedRows, ShowMore } from '@/components/ui/paged-list'

export type CatalogProduct = {
  id: string
  name: string
  reference: string
  category: { id: string; name: string; icon: string | null }
  baseUnit: { id: string; symbol: string; allowsDecimals: boolean }
  /** Quantité cible fixée par l'administration pour ce département. */
  stockFixe: number
}

/** Commande = stock fixe − stock compté, jamais négative. */
function toOrder(stockFixe: number, onHand: number): number {
  return Math.max(stockFixe - onHand, 0)
}

const SUBMIT = /* GraphQL */ `
  mutation Submit($lines: [OrderLineInput!]!, $note: String) {
    submitOrder(lines: $lines, note: $note) {
      id
      reference
      ticketNumber
      lineCount
    }
  }
`

export function NewOrderForm({
  products, departmentName, userName, businessDay,
}: {
  products: CatalogProduct[]
  departmentName: string
  userName: string
  businessDay: string
}) {
  const router = useRouter()
  const { push } = useToast()

  const [search, setSearch] = React.useState('')
  const [activeCategory, setActiveCategory] = React.useState<string | null>(null)
  // Ce que l'employé saisit : son stock en rayon, pas la quantité à commander.
  const [onHand, setOnHand] = React.useState<Record<string, string>>({})
  const [note, setNote] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  // Passe à true seulement quand l'employé tente d'envoyer une feuille
  // incomplète : une feuille neuve ne doit pas s'ouvrir en mur rouge.
  const [showMissing, setShowMissing] = React.useState(false)

  const inputRefs = React.useRef<Record<string, HTMLInputElement | null>>({})

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

  // Le catalogue monte à ~550 articles : on ne rend qu'une tranche, mais le
  // contrôle de complétude ci-dessous porte sur toutes les lignes — rien ne
  // peut partir vide sous prétexte qu'on ne l'a jamais fait défiler.
  const paged = usePagedRows(visible)

  /** Une ligne est renseignée dès qu'elle porte un nombre — zéro compris. */
  const isFilled = React.useCallback(
    (productId: string) => (onHand[productId] ?? '').trim() !== '',
    [onHand],
  )

  const missing = React.useMemo(
    () => products.filter((p) => !isFilled(p.id)),
    [products, isFilled],
  )

  /** Les lignes qui partiront réellement : celles dont l'écart est positif. */
  const selected = React.useMemo(
    () =>
      products
        .filter((p) => isFilled(p.id))
        .map((p) => ({ product: p, asked: toOrder(p.stockFixe, toNumber(onHand[p.id])) }))
        .filter((x) => x.asked > 0),
    [products, onHand, isFilled],
  )

  /** Total des quantités qui seront commandées. */
  const totalAsked = React.useMemo(
    () => selected.reduce((s, x) => s + x.asked, 0),
    [selected],
  )

  /** Articles sans stock fixe : ils ne peuvent rien générer. */
  const withoutPar = React.useMemo(
    () => products.filter((p) => p.stockFixe <= 0).length,
    [products],
  )

  const setStock = (productId: string, value: string) => {
    // La virgule des claviers français vaut point décimal.
    const normalised = value.replace(',', '.')
    if (normalised !== '' && !/^\d*\.?\d*$/.test(normalised)) return
    setOnHand((q) => ({ ...q, [productId]: normalised }))
  }

  /** « Rien en rayon » : met 0 partout où rien n'est saisi. */
  const fillRemainingWithZero = () => {
    setOnHand((q) => {
      const next = { ...q }
      for (const p of products) if ((next[p.id] ?? '').trim() === '') next[p.id] = '0'
      return next
    })
    push('info', 'Les lignes vides ont été mises à 0 (rien en rayon).')
  }

  const clearAll = () => {
    setOnHand({})
    setNote('')
    setShowMissing(false)
  }

  /** Entrée descend la colonne — la feuille se remplit de haut en bas. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const next = paged.shown[index + 1]
    if (next) inputRefs.current[next.id]?.focus()
  }

  const submit = async () => {
    // Chaque article doit être répondu avant l'envoi : une case vide est
    // ambiguë (rien besoin ? ou oublié ?), un « 0 » est une réponse.
    if (missing.length > 0) {
      setShowMissing(true)
      const first = missing[0]
      // On lève les filtres et le plafond de lignes pour que la case fautive
      // soit réellement rendue avant qu'on y saute.
      setSearch('')
      setActiveCategory(null)
      paged.showAll()
      push('error', `${missing.length} ligne(s) non renseignée(s). Saisissez 0 si vous ne commandez rien.`)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const el = inputRefs.current[first.id]
          el?.focus()
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }),
      )
      return
    }

    if (selected.length === 0) {
      push(
        'error',
        'Vos stocks couvrent déjà le stock fixe — il n’y a rien à commander.',
      )
      return
    }

    setSubmitting(true)
    try {
      const data = await gql<{
        submitOrder: { id: string; reference: string; ticketNumber: number; lineCount: number }
      }>(SUBMIT, {
        // On envoie le stock compté ; le serveur recalcule l'écart lui-même.
        lines: products
          .filter((p) => isFilled(p.id))
          .map((p) => ({ productId: p.id, quantityOnHand: toNumber(onHand[p.id]) })),
        note: note.trim() || null,
      })

      const o = data.submitOrder
      push('success', `Commande ${o.reference} envoyée — ticket n°${o.ticketNumber}, ${o.lineCount} article(s).`)
      router.push(`/employe/commandes/${o.id}`)
      router.refresh()
    } catch (error) {
      push('error', errorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const filledCount = products.length - missing.length

  return (
    <GlassCard>
      {/* Cartouche de la feuille */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-[0.95rem] font-semibold leading-tight text-fg">
            {departmentName}
            <span className="mx-2 font-normal text-fg-subtle">·</span>
            <span className="font-medium text-fg-muted">{userName}</span>
          </p>
        </div>
        <p className="shrink-0 text-right text-[0.85rem] font-medium capitalize tabular-nums text-fg-muted">
          {formatLongDate(businessDay)}
        </p>
      </div>

      {/* Rappel de la règle de calcul, et articles encore sans cible. */}
      <div className="no-print flex flex-wrap items-center gap-2 border-b border-[rgb(var(--glass-edge)/0.16)] bg-accent/[0.05] px-4 py-2.5 sm:px-5">
        <p className="text-[0.79rem] leading-snug text-fg-muted">
          Saisissez ce que vous avez <strong className="text-fg">en rayon</strong>. La quantité
          commandée est calculée automatiquement : <strong className="text-fg">stock fixe −
          votre stock</strong>.
        </p>
        {withoutPar > 0 ? (
          <span className="rounded-full border border-warn/35 bg-warn/12 px-2 py-0.5 text-[0.72rem] font-medium text-warn">
            {withoutPar} article(s) sans stock fixe défini
          </span>
        ) : null}
      </div>

      {/* Barre d'outils */}
      <div className="no-print space-y-3 border-b border-[rgb(var(--glass-edge)/0.16)] p-3.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un article ou une référence…"
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

        <div className="flex flex-wrap items-center gap-2 border-t border-[rgb(var(--glass-edge)/0.14)] pt-3">
          {missing.length > 0 ? (
            <Button size="sm" variant="secondary" onClick={fillRemainingWithZero}>
              <ListChecks className="size-3.5" />
              Rien en rayon : mettre 0 ({missing.length})
            </Button>
          ) : null}
          {filledCount > 0 ? (
            <Button size="sm" variant="ghost" onClick={clearAll}>
              <Trash2 className="size-3.5" />
              Tout effacer
            </Button>
          ) : null}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<PackageSearch className="size-6" />}
          title="Aucun article trouvé"
          description="Modifiez votre recherche ou changez de catégorie."
        />
      ) : (
        <>
          {/* Un seul tableau à toutes les tailles. Sur téléphone il défile
              latéralement dans son conteneur plutôt que de perdre des colonnes. */}
          <TableWrap minWidth="0">
            <thead>
              <tr className="[&_th:not(:last-child)]:border-r [&_th]:border-[rgb(var(--glass-edge)/0.12)]">
                <Th className="w-6 px-1 text-right sm:w-10 sm:px-3">#</Th>
                <Th className="w-full px-1 sm:px-3">Article</Th>
                <Th className="px-1 text-right sm:px-3">
                  <span className="sm:hidden">Fixe</span>
                  <span className="hidden sm:inline">Stock fixe</span>
                </Th>
                <Th className="w-[5.5rem] px-1 text-right sm:w-32 sm:px-3">
                  <span className="sm:hidden">En rayon</span>
                  <span className="hidden sm:inline">Mon stock</span>
                </Th>
                <Th className="px-1 text-right sm:px-3">
                  <span className="sm:hidden">Cmd.</span>
                  <span className="hidden sm:inline">commande</span>
                </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)] [&_td:not(:last-child)]:border-r [&_td]:border-[rgb(var(--glass-edge)/0.12)]">
              {paged.shown.map((p, i) => {
                const previous = i > 0 ? paged.shown[i - 1] : null
                const opensFamily = previous?.category.id !== p.category.id
                const filled = isFilled(p.id)
                const flagged = showMissing && !filled
                const stock = toNumber(onHand[p.id])
                const asked = filled ? toOrder(p.stockFixe, stock) : 0
                const noPar = p.stockFixe <= 0
                return (
                  <React.Fragment key={p.id}>
                    {opensFamily ? (
                      <tr className="[&>td]:border-r-0">
                        <td
                          colSpan={5}
                          className="bg-[rgb(var(--glass-edge)/0.16)] px-2 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.06em] text-fg-muted sm:px-3 sm:text-[0.76rem]"
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
                  <tr
                    className={cn(
                      'transition-colors',
                      flagged && 'bg-danger/[0.07]',
                      !flagged && asked > 0 && 'bg-accent/[0.05]',
                    )}
                  >
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

                    {/* Cible fixée par l'administration — lecture seule. */}
                    <Td className="whitespace-nowrap px-1 text-right sm:px-3">
                      {noPar ? (
                        <span className="text-[0.72rem] text-fg-subtle sm:text-[0.78rem]">—</span>
                      ) : (
                        <span className="text-[0.75rem] font-medium tabular-nums text-fg-muted sm:text-[0.86rem]">
                          {formatQty(p.stockFixe)}
                          <span className="ml-1 text-[0.68rem] text-fg-subtle sm:text-[0.72rem]">
                            {p.baseUnit.symbol}
                          </span>
                        </span>
                      )}
                    </Td>

                    {/* La seule case saisissable : ce que l'employé a en rayon. */}
                    <Td className="px-1 sm:px-3">
                      <div className="flex items-center justify-end gap-1 sm:gap-1.5">
                        <input
                          ref={(el) => {
                            inputRefs.current[p.id] = el
                          }}
                          inputMode="decimal"
                          value={onHand[p.id] ?? ''}
                          onChange={(e) => setStock(p.id, e.target.value)}
                          onKeyDown={(e) => onKeyDown(e, i)}
                          placeholder="—"
                          aria-label={`Stock en rayon pour ${p.name}`}
                          aria-invalid={flagged}
                          className={cn(
                            'field h-9 w-14 px-1.5 py-0 text-right text-[0.8rem] tabular-nums sm:w-24 sm:px-3 sm:text-[0.85rem]',
                            flagged && 'border-danger/60 ring-1 ring-danger/30',
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => setStock(p.id, '0')}
                          title="Rien en rayon"
                          aria-label={`Rien en rayon pour ${p.name}`}
                          className="h-9 shrink-0 rounded-lg border border-[rgb(var(--glass-edge)/0.3)] bg-white/60 px-2 text-[0.72rem] font-semibold tabular-nums text-fg-muted transition-colors hover:bg-white/90 hover:text-fg"
                        >
                          0
                        </button>
                      </div>
                    </Td>

                    {/* Résultat du calcul, mis à jour à la frappe. */}
                    <Td className="whitespace-nowrap px-1 text-right sm:px-3">
                      {!filled ? (
                        <span className="text-[0.72rem] text-fg-subtle sm:text-[0.78rem]">—</span>
                      ) : asked > 0 ? (
                        <span className="text-[0.8rem] font-bold tabular-nums text-accent sm:text-[0.9rem]">
                          {formatQty(asked)}
                          <span className="ml-1 text-[0.68rem] font-medium text-accent/70 sm:text-[0.72rem]">
                            {p.baseUnit.symbol}
                          </span>
                        </span>
                      ) : (
                        <span
                          title={
                            noPar
                              ? 'Aucun stock fixe défini pour cet article'
                              : 'Votre stock couvre déjà la cible'
                          }
                          className="text-[0.75rem] tabular-nums text-fg-subtle sm:text-[0.82rem]"
                        >
                          0
                        </span>
                      )}
                    </Td>
                  </tr>
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

      {/* Pied : note et validation */}
      <div className="no-print space-y-3 border-t border-[rgb(var(--glass-edge)/0.16)] p-3.5 sm:p-4">
        <div>
          <label htmlFor="order-note" className="mb-1.5 block text-[0.78rem] font-medium text-fg-muted">
            Note (facultatif)
          </label>
          <textarea
            id="order-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Précision pour l’économat…"
            className="field resize-none"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={cn('text-[0.82rem] tabular-nums', missing.length > 0 ? 'text-fg-muted' : 'font-medium text-ok')}>
            {missing.length > 0 ? (
              <>
                <strong className={showMissing ? 'text-danger' : 'text-fg'}>{filledCount}</strong>
                {' / '}
                {products.length} ligne(s) renseignée(s) — saisissez 0 si vous n’avez rien en rayon.
              </>
            ) : (
              <>
                Les {products.length} lignes sont renseignées ·{' '}
                <strong className="text-fg">{selected.length}</strong> article(s) à commander,{' '}
                <strong className="text-fg">{formatQty(totalAsked)}</strong> au total.
              </>
            )}
          </p>

          <Button
            variant="primary"
            size="lg"
            loading={submitting}
            onClick={submit}
            className="min-w-[13rem]"
          >
            {!submitting ? <Send className="size-4" /> : null}
            {submitting ? 'Envoi…' : 'Envoyer la commande'}
          </Button>
        </div>
      </div>
    </GlassCard>
  )
}
