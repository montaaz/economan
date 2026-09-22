'use client'

import * as React from 'react'
import { Search } from 'lucide-react'
import { GlassCard, Badge, TableWrap, Th, Td } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { FamilyBand } from '@/components/ui/family-band'
import { FilterBadge, FilterReset } from '@/components/ui/filter-badge'
import { cn, formatQty } from '@/lib/utils'

export type ControlLine = {
  productId: string
  productName: string
  productRef: string
  categoryName: string
  unitSymbol: string
  stockFixe: number
  countedStock: number | null
  quantityAsked: number | null
  quantityServed: number | null
  gap: number
}

export type ControlGroup = {
  department: { id: string; name: string; code: string; color: string; icon: string | null }
  lineCount: number
  uncountedCount: number
  lines: ControlLine[]
}

/**
 * La feuille d'un service, vue du contrôle.
 *
 * Mêmes colonnes et mêmes familles que l'écran de l'économat : le contrôle
 * doit pouvoir lire la même ligne que le magasin sans la retrouver ailleurs.
 */
export function ControlTable({ group }: { group: ControlGroup }) {
  const [search, setSearch] = React.useState('')
  const [etat, setEtat] = React.useState<'ECART' | 'NON_COMPTE' | null>(null)

  const counts = React.useMemo(() => ({
    ecarts: group.lines.filter((l) => l.countedStock !== null && l.gap > 0).length,
    nonComptes: group.lines.filter((l) => l.countedStock === null).length,
  }), [group.lines])

  // Le rang est celui de la feuille, figé avant tout filtrage : renuméroter
  // une liste filtrée ferait que « l'article 16 » changerait de sens.
  const numerotees = React.useMemo(
    () => group.lines.map((l, i) => ({ ...l, rang: i + 1 })),
    [group.lines],
  )

  const affichees = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return numerotees.filter((l) => {
      if (etat === 'ECART' && !(l.countedStock !== null && l.gap > 0)) return false
      if (etat === 'NON_COMPTE' && l.countedStock !== null) return false
      if (!q) return true
      return l.productName.toLowerCase().includes(q) || l.productRef.toLowerCase().includes(q)
    })
  }, [numerotees, search, etat])

  const parFamille = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const l of affichees) m.set(l.categoryName, (m.get(l.categoryName) ?? 0) + 1)
    return m
  }, [affichees])

  const c = group.department.color

  return (
    <section
      className="overflow-hidden rounded-[calc(var(--radius)+4px)] border border-[rgb(var(--glass-edge)/0.26)] bg-white/45 backdrop-blur-xl"
    >
      <header
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-3 sm:px-5"
        style={{
          borderColor: `${c}26`,
          background: `linear-gradient(120deg, ${c}1f, ${c}0a 70%, transparent)`,
        }}
      >
        <h2 className="flex min-w-0 items-center gap-2.5">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-sm"
            style={{ background: `linear-gradient(140deg, ${c}, ${c}bb)` }}
          >
            <Icon name={group.department.icon ?? 'Building2'} className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[1.15rem] font-bold leading-tight text-fg sm:text-[1.05rem]">
              {group.department.name}
            </span>
            <span className="block text-[0.85rem] font-medium text-fg sm:text-[0.78rem]">
              {group.lineCount} article{group.lineCount > 1 ? 's' : ''} sur sa feuille
            </span>
          </span>
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          {counts.ecarts > 0 ? (
            <FilterBadge
              tone="warn"
              actif={etat === 'ECART'}
              onClick={() => setEtat(etat === 'ECART' ? null : 'ECART')}
              label={etat === 'ECART'
                ? 'Afficher de nouveau tous les articles'
                : `N’afficher que les ${counts.ecarts} article(s) sous leur cible`}
            >
              {counts.ecarts} sous la cible
            </FilterBadge>
          ) : null}
          {counts.nonComptes > 0 ? (
            <FilterBadge
              tone="warn"
              actif={etat === 'NON_COMPTE'}
              onClick={() => setEtat(etat === 'NON_COMPTE' ? null : 'NON_COMPTE')}
              label={etat === 'NON_COMPTE'
                ? 'Afficher de nouveau tous les articles'
                : `N’afficher que les ${counts.nonComptes} article(s) non comptés`}
            >
              {counts.nonComptes} non compté{counts.nonComptes > 1 ? 's' : ''}
            </FilterBadge>
          ) : null}
          {etat !== null ? (
            <FilterReset total={group.lineCount} onClick={() => setEtat(null)} />
          ) : null}
        </div>
      </header>

      <div className="p-3 sm:p-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un article ou une référence…"
            aria-label={`Rechercher un article — ${group.department.name}`}
            className="field w-full py-2.5 pl-9 pr-3 text-[0.9rem]"
          />
        </label>
      </div>

      <TableWrap minWidth="46rem">
        <thead>
          <tr>
            <Th className="w-10 text-right">#</Th>
            <Th className="w-full">Article</Th>
            {/* La même chaîne que partout ailleurs : la cible, ce que le
                service a compté, ce qu'il a demandé, ce qu'il a reçu. */}
            <Th className="text-right">Stock fixe</Th>
            <Th className="text-right">Son stock</Th>
            <Th className="text-right">Écart</Th>
            <Th className="text-right">Commande</Th>
            <Th className="text-right">Servi</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
          {affichees.map((l, i) => {
            const nonCompte = l.countedStock === null
            const ouvre = i === 0 || affichees[i - 1].categoryName !== l.categoryName
            return (
              <React.Fragment key={l.productId}>
                {ouvre ? (
                  <FamilyBand
                    name={l.categoryName}
                    count={parFamille.get(l.categoryName) ?? 0}
                    colSpan={7}
                  />
                ) : null}
                <tr className={cn(!nonCompte && l.gap > 0 && 'bg-warn/[0.08]')}>
                  <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{l.rang}</Td>
                  <Td className="max-w-0">
                    <p className="truncate text-[0.85rem] font-medium text-fg">{l.productName}</p>
                    <p className="truncate font-mono text-[0.7rem] text-fg-subtle">{l.productRef}</p>
                  </Td>
                  <Td className="whitespace-nowrap text-right tabular-nums text-fg-subtle">
                    {formatQty(l.stockFixe)} {l.unitSymbol}
                  </Td>
                  <Td className="whitespace-nowrap text-right font-medium tabular-nums">
                    {/* Sans commande ce jour-là, le rayon n'a pas été déclaré :
                        un zéro laisserait croire à un rayon vide. */}
                    {nonCompte ? (
                      <span className="text-fg-subtle">—</span>
                    ) : (
                      <span className="text-fg">{formatQty(l.countedStock!)} {l.unitSymbol}</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-right font-bold tabular-nums">
                    {nonCompte || l.gap === 0 ? (
                      <span className="text-fg-subtle">—</span>
                    ) : (
                      <span className="text-warn">−{formatQty(l.gap)} {l.unitSymbol}</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">
                    {l.quantityAsked === null ? '—' : `${formatQty(l.quantityAsked)} ${l.unitSymbol}`}
                  </Td>
                  <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">
                    {l.quantityServed === null ? '—' : `${formatQty(l.quantityServed)} ${l.unitSymbol}`}
                  </Td>
                </tr>
              </React.Fragment>
            )
          })}
        </tbody>
      </TableWrap>

      {affichees.length === 0 ? (
        <p className="px-4 py-6 text-center text-[0.85rem] text-fg-muted">
          Aucun article ne correspond à ce filtre.
        </p>
      ) : null}
    </section>
  )
}
