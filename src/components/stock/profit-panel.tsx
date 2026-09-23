'use client'

import * as React from 'react'
import { UtensilsCrossed, Package, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react'
import { GlassCard, Badge, TableWrap, Th, Td, EmptyState } from '@/components/ui/glass'
import { SearchField } from '@/components/ui/search-field'
import { FilterBadge, FilterReset } from '@/components/ui/filter-badge'
import { cn, formatMoney, formatQty } from '@/lib/utils'
import { correspond } from '@/lib/search'

export type ProfitDish = {
  salesItemId: string
  name: string
  familyName: string
  departmentId: string | null
  quantity: number
  unitPrice: number | null
  revenue: number | null
  unitCost: number | null
  cost: number | null
  margin: number | null
  marginRate: number | null
  hasRecipe: boolean
  incompleteLines: number
}

export type ProfitArticle = {
  productId: string
  name: string
  unitSymbol: string
  categoryName: string
  unitCost: number | null
  purchasedQty: number
  purchasedValue: number
  deliveredQty: number
  deliveredValue: number
  soldQty: number
  soldValue: number
  revenue: number
  margin: number
  gapQty: number
  gapValue: number
}

/**
 * Achats contre ventes, en deux tableaux.
 *
 * « Plats vendus » lit la carte : ce que chaque plat se vend, ce que sa
 * fiche lui fait coûter, et la marge. « Articles du stock » lit le magasin :
 * ce qu'on a acheté d'un article, ce qui en est parti vers les départements,
 * ce que les ventes en ont réellement consommé — et l'écart, qui est de
 * l'argent sorti sans être vendu. Rouge quand on perd, vert quand on gagne.
 */
export function ProfitPanel({
  plats, articles, departements, global,
}: {
  plats: ProfitDish[]
  articles: ProfitArticle[]
  departements: Map<string, string>
  /** Vue « Tous » : les achats de la période s'affichent, la colonne département aussi. */
  global: boolean
}) {
  const [onglet, setOnglet] = React.useState<'plats' | 'articles'>('plats')
  const tab = 'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[0.8rem] font-semibold transition-colors'
  const actif = 'border-accent/40 bg-accent/12 text-accent'
  const inactif = 'border-[rgb(var(--glass-edge)/0.34)] bg-white/65 text-fg-muted hover:bg-white hover:text-fg'
  return (
    <GlassCard>
      <div className="flex flex-wrap items-center gap-2 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
        <button type="button" onClick={() => setOnglet('plats')} aria-pressed={onglet === 'plats'} className={cn(tab, onglet === 'plats' ? actif : inactif)}>
          <UtensilsCrossed className="size-3.5" />
          Plats vendus
          <span className="text-[0.72rem] font-medium opacity-70">({plats.length})</span>
        </button>
        <button type="button" onClick={() => setOnglet('articles')} aria-pressed={onglet === 'articles'} className={cn(tab, onglet === 'articles' ? actif : inactif)}>
          <Package className="size-3.5" />
          Articles du stock
          <span className="text-[0.72rem] font-medium opacity-70">({articles.length})</span>
        </button>
      </div>
      {onglet === 'plats' ? <TablePlats plats={plats} departements={departements} global={global} /> : <TableArticles articles={articles} global={global} />}
    </GlassCard>
  )
}

/** La marge, colorée : rouge en perte, orange sous 30 %, vert au-dessus. */
function Marge({ value, rate }: { value: number | null; rate: number | null }) {
  if (value === null) return <span className="text-fg-subtle">—</span>
  const perte = value < -1e-9
  const faible = !perte && rate !== null && rate < 30
  return (
    <span className={cn('inline-flex items-center gap-1 font-semibold tabular-nums', perte ? 'text-danger' : faible ? 'text-warn' : 'text-ok')}>
      {perte ? <TrendingDown className="size-3.5" /> : <TrendingUp className="size-3.5" />}
      {formatMoney(value)}
      {rate !== null ? <span className="text-[0.72rem] font-medium opacity-80">({formatQty(rate, 0)} %)</span> : null}
    </span>
  )
}

function TablePlats({ plats, departements, global }: { plats: ProfitDish[]; departements: Map<string, string>; global: boolean }) {
  const [search, setSearch] = React.useState('')
  const [filtre, setFiltre] = React.useState<'PERTE' | 'INCOMPLET' | null>(null)
  const enPerte = (p: ProfitDish) => p.margin !== null && p.margin < -1e-9
  const incomplet = (p: ProfitDish) => !p.hasRecipe || p.revenue === null || p.incompleteLines > 0
  const nPerte = plats.filter(enPerte).length
  const nIncomplet = plats.filter(incomplet).length
  const affiches = plats.filter((p) => {
    if (filtre === 'PERTE' && !enPerte(p)) return false
    if (filtre === 'INCOMPLET' && !incomplet(p)) return false
    return !search.trim() || correspond(search, p.name) || correspond(search, p.familyName)
  })
  if (plats.length === 0) {
    return <EmptyState icon={<UtensilsCrossed className="size-6" />} title="Aucune vente sur cette période" description="Les plats apparaissent dès qu'un Z est saisi dans le contrôle." />
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
        <SearchField value={search} onChange={setSearch} placeholder="Rechercher un plat…" className="w-full sm:w-72" />
        {nPerte > 0 ? (
          <FilterBadge tone="danger" actif={filtre === 'PERTE'} onClick={() => setFiltre(filtre === 'PERTE' ? null : 'PERTE')} label="N'afficher que les plats vendus à perte">
            {nPerte} à perte
          </FilterBadge>
        ) : null}
        {nIncomplet > 0 ? (
          <FilterBadge tone="warn" actif={filtre === 'INCOMPLET'} onClick={() => setFiltre(filtre === 'INCOMPLET' ? null : 'INCOMPLET')} label="N'afficher que les plats dont le prix ou la fiche manque">
            {nIncomplet} incomplet{nIncomplet > 1 ? 's' : ''}
          </FilterBadge>
        ) : null}
        {filtre || search ? <FilterReset total={plats.length} onClick={() => { setFiltre(null); setSearch('') }} /> : null}
      </div>
      <TableWrap minWidth="60rem">
        <thead>
          <tr>
            <Th className="w-[26%] min-w-[15rem]">Plat</Th>
            {global ? <Th>Département</Th> : null}
            <Th className="text-right">Vendu</Th>
            <Th className="text-right">Prix de vente</Th>
            <Th className="text-right">Coût matière / portion</Th>
            <Th className="text-right">Chiffre d’affaires</Th>
            <Th className="text-right">Coût matière</Th>
            <Th className="text-right">Marge</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
          {affiches.map((p) => (
            <tr key={p.salesItemId} className={cn(enPerte(p) && 'bg-danger/[0.06]')}>
              <Td>
                <p className="text-[0.85rem] font-medium leading-snug text-fg">{p.name}</p>
                <p className="flex flex-wrap items-center gap-1 text-[0.7rem] text-fg-subtle">
                  {p.familyName}
                  {!p.hasRecipe ? <Badge tone="warn" icon={<AlertTriangle className="size-3" />}>sans fiche</Badge> : null}
                  {p.hasRecipe && p.incompleteLines > 0 ? <Badge tone="warn" icon={<AlertTriangle className="size-3" />}>{p.incompleteLines} ingrédient(s) sans coût</Badge> : null}
                  {p.revenue === null ? <Badge tone="warn" icon={<AlertTriangle className="size-3" />}>prix inconnu</Badge> : null}
                </p>
              </Td>
              {global ? <Td className="whitespace-nowrap text-[0.8rem] text-fg-muted">{p.departmentId ? departements.get(p.departmentId) ?? '—' : '—'}</Td> : null}
              <Td className="whitespace-nowrap text-right tabular-nums">{formatQty(p.quantity)}</Td>
              <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">{p.unitPrice === null ? '—' : formatMoney(p.unitPrice)}</Td>
              <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">{p.unitCost === null ? '—' : formatMoney(p.unitCost)}</Td>
              <Td className="whitespace-nowrap text-right font-semibold tabular-nums">{p.revenue === null ? '—' : formatMoney(p.revenue)}</Td>
              <Td className="whitespace-nowrap text-right tabular-nums">{p.cost === null ? '—' : formatMoney(p.cost)}</Td>
              <Td className="whitespace-nowrap text-right"><Marge value={p.margin} rate={p.marginRate} /></Td>
            </tr>
          ))}
          {affiches.length === 0 ? (
            <tr><Td colSpan={global ? 8 : 7} className="py-6 text-center text-[0.85rem] text-fg-muted">Aucun plat ne correspond.</Td></tr>
          ) : null}
        </tbody>
      </TableWrap>
    </>
  )
}

function TableArticles({ articles, global }: { articles: ProfitArticle[]; global: boolean }) {
  const [search, setSearch] = React.useState('')
  const [filtre, setFiltre] = React.useState<'PERTE' | 'SANS_COUT' | null>(null)
  // Une perte : on a livré plus que les ventes n'ont consommé, et ça a un prix.
  const enPerte = (a: ProfitArticle) => a.gapValue > 1e-9
  const sansCout = (a: ProfitArticle) => a.unitCost === null
  const nPerte = articles.filter(enPerte).length
  const nSansCout = articles.filter(sansCout).length
  const affiches = articles.filter((a) => {
    if (filtre === 'PERTE' && !enPerte(a)) return false
    if (filtre === 'SANS_COUT' && !sansCout(a)) return false
    return !search.trim() || correspond(search, a.name) || correspond(search, a.categoryName)
  })
  if (articles.length === 0) {
    return <EmptyState icon={<Package className="size-6" />} title="Aucun mouvement sur cette période" description="Les articles apparaissent dès qu'un bon est livré, qu'une entrée est saisie ou qu'un Z est enregistré." />
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
        <SearchField value={search} onChange={setSearch} placeholder="Rechercher un article…" className="w-full sm:w-72" />
        {nPerte > 0 ? (
          <FilterBadge tone="danger" actif={filtre === 'PERTE'} onClick={() => setFiltre(filtre === 'PERTE' ? null : 'PERTE')} label="N'afficher que les articles sortis plus que vendus">
            {nPerte} sortis plus que vendus
          </FilterBadge>
        ) : null}
        {nSansCout > 0 ? (
          <FilterBadge tone="warn" actif={filtre === 'SANS_COUT'} onClick={() => setFiltre(filtre === 'SANS_COUT' ? null : 'SANS_COUT')} label="N'afficher que les articles sans prix d'achat">
            {nSansCout} sans prix d’achat
          </FilterBadge>
        ) : null}
        {filtre || search ? <FilterReset total={articles.length} onClick={() => { setFiltre(null); setSearch('') }} /> : null}
      </div>
      <TableWrap minWidth={global ? '68rem' : '60rem'}>
        <thead>
          <tr>
            <Th className="w-[24%] min-w-[15rem]">Article</Th>
            <Th className="text-right">Prix d’achat</Th>
            {global ? <Th className="text-right">Acheté</Th> : null}
            <Th className="text-right">Livré</Th>
            <Th className="text-right">Vendu (fiches)</Th>
            <Th className="text-right">Écart</Th>
            <Th className="text-right">Rapporté</Th>
            <Th className="text-right">Marge</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
          {affiches.map((a) => (
            <tr key={a.productId} className={cn(enPerte(a) && 'bg-danger/[0.06]')}>
              <Td>
                <p className="text-[0.85rem] font-medium leading-snug text-fg">{a.name}</p>
                <p className="flex flex-wrap items-center gap-1 text-[0.7rem] text-fg-subtle">
                  {a.categoryName}
                  {a.unitCost === null ? <Badge tone="warn" icon={<AlertTriangle className="size-3" />}>sans prix d’achat</Badge> : null}
                </p>
              </Td>
              <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">{a.unitCost === null ? '—' : `${formatMoney(a.unitCost)} / ${a.unitSymbol}`}</Td>
              {global ? <Td className="whitespace-nowrap text-right tabular-nums"><Deux qty={a.purchasedQty} unit={a.unitSymbol} value={a.purchasedValue} /></Td> : null}
              <Td className="whitespace-nowrap text-right tabular-nums"><Deux qty={a.deliveredQty} unit={a.unitSymbol} value={a.deliveredValue} /></Td>
              <Td className="whitespace-nowrap text-right tabular-nums"><Deux qty={a.soldQty} unit={a.unitSymbol} value={a.soldValue} /></Td>
              <Td className={cn('whitespace-nowrap text-right font-semibold tabular-nums', enPerte(a) ? 'text-danger' : a.gapQty < -1e-9 ? 'text-info' : 'text-fg-muted')}>
                <Deux qty={a.gapQty} unit={a.unitSymbol} value={a.gapValue} signe />
              </Td>
              <Td className="whitespace-nowrap text-right tabular-nums">{a.revenue > 0 ? formatMoney(a.revenue) : <span className="text-fg-subtle">—</span>}</Td>
              <Td className="whitespace-nowrap text-right">{a.soldQty > 0 ? <Marge value={a.margin} rate={a.revenue > 0 ? (a.margin / a.revenue) * 100 : null} /> : <span className="text-fg-subtle">—</span>}</Td>
            </tr>
          ))}
          {affiches.length === 0 ? (
            <tr><Td colSpan={global ? 8 : 7} className="py-6 text-center text-[0.85rem] text-fg-muted">Aucun article ne correspond.</Td></tr>
          ) : null}
        </tbody>
      </TableWrap>
    </>
  )
}

/** Une quantité et sa valeur, l'une sous l'autre. */
function Deux({ qty, unit, value, signe }: { qty: number; unit: string; value: number; signe?: boolean }) {
  if (Math.abs(qty) < 1e-9 && Math.abs(value) < 1e-9) return <span className="text-fg-subtle">—</span>
  const plus = signe && qty > 1e-9 ? '+' : ''
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span>{plus}{formatQty(qty)} {unit}</span>
      <span className="text-[0.72rem] font-normal text-fg-muted">{plus}{formatMoney(value)}</span>
    </span>
  )
}
