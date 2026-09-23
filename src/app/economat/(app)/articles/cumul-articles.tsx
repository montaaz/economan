'use client'

import * as React from 'react'
import { Layers, PackageSearch, Printer, X } from 'lucide-react'
import { GlassCard, Button, Badge, EmptyState, TableWrap, Th, Td } from '@/components/ui/glass'
import { FamilyBand, countByFamily } from '@/components/ui/family-band'
import { Icon } from '@/components/ui/icon'
import { cn, formatLongDate, formatPeriod, formatQty } from '@/lib/utils'
import { correspond, normaliser } from '@/lib/search'
import { SearchField } from '@/components/ui/search-field'

export type CumulLine = {
  productId: string
  productName: string
  productRef: string
  categoryName: string
  unitSymbol: string
  stockFixe: number
  quantityAsked: number
  quantityServed: number
  ticketCount: number
  status: 'PENDING' | 'VALIDATED' | 'ADJUSTED' | 'REJECTED'
  /** Rang du servi qui a soldé la ligne : 1, 2, 3… */
  servedRank: number
}

type Etat = CumulLine['status']

const BADGES: Record<Etat, { tone: 'neutral' | 'ok' | 'warn' | 'danger'; label: string }> = {
  PENDING: { tone: 'neutral', label: 'En attente' },
  VALIDATED: { tone: 'ok', label: 'Servi' },
  ADJUSTED: { tone: 'warn', label: 'Ajusté' },
  REJECTED: { tone: 'danger', label: 'Rupture' },
}

/**
 * La fiche cumulée d'un département : en-tête, comptes cliquables, tableau.
 *
 * Mêmes colonnes et mêmes couleurs que la fiche d'un ticket, pour qu'on s'y
 * retrouve sans apprendre un second écran. Les comptes filtrent la liste,
 * comme sur le ticket ; l'impression sort la liste telle qu'elle est lue.
 */
export function CumulArticles({
  department, day, dayTo, tickets, lines,
}: {
  department: { id: number; name: string; color: string; icon: string | null }
  day: string
  dayTo: string | null
  tickets: number
  lines: CumulLine[]
}) {
  const [filtre, setFiltre] = React.useState<Etat | null>(null)
  // Le passage qui a soldé la ligne : « Servi 1 », « Servi 2 »… Sans rang
  // choisi, tous les passages se lisent ensemble.
  const [rang, setRang] = React.useState<number | null>(null)
  const [recherche, setRecherche] = React.useState('')

  const counts = React.useMemo(() => ({
    validated: lines.filter((l) => l.status === 'VALIDATED').length,
    adjusted: lines.filter((l) => l.status === 'ADJUSTED').length,
    rejected: lines.filter((l) => l.status === 'REJECTED').length,
    pending: lines.filter((l) => l.status === 'PENDING').length,
  }), [lines])

  // Les rangs présents sur la période, dans l'ordre : un bouton par passage
  // qui a réellement soldé quelque chose.
  const rangs = React.useMemo(
    () => [...new Set(lines.filter((l) => l.status === 'VALIDATED' && l.servedRank > 0).map((l) => l.servedRank))]
      .sort((a, b) => a - b),
    [lines],
  )
  const parRang = React.useMemo(() => {
    const m = new Map<number, number>()
    for (const l of lines) if (l.status === 'VALIDATED') m.set(l.servedRank, (m.get(l.servedRank) ?? 0) + 1)
    return m
  }, [lines])

  const mot = normaliser(recherche)
  const affichees = lines.filter((l) =>
    (filtre === null || l.status === filtre)
    && (rang === null || (l.status === 'VALIDATED' && l.servedRank === rang))
    && correspond(mot, l.productName, l.productRef),
  )
  const parFamille = countByFamily(affichees)
  const filtree = filtre !== null || rang !== null || mot !== ''

  const bascule = (etat: Etat) => setFiltre((f) => (f === etat ? null : etat))

  return (
    <div className="space-y-4">
      <GlassCard>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid size-12 shrink-0 place-items-center rounded-xl text-white shadow-md"
              style={{ background: `linear-gradient(140deg, ${department.color}, ${department.color}bb)` }}
            >
              <Icon name={department.icon ?? 'Building2'} className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[1rem] font-bold leading-tight text-fg">
                {department.name}
              </p>
              <p className="truncate text-[0.8rem] text-fg-muted">
                Articles cumulés
                <span className="mx-1.5">·</span>
                {tickets} ticket{tickets > 1 ? 's' : ''}
                <span className="mx-1.5">·</span>
                {formatPeriod(day, dayTo)}
              </p>
            </div>
          </div>
          <Badge tone="accent" icon={<Layers className="size-3.5" />}>
            {lines.length} article{lines.length > 1 ? 's' : ''}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 sm:px-5">
          <Badge tone="neutral" className="capitalize">
            {dayTo ? formatPeriod(day, dayTo) : formatLongDate(day)}
          </Badge>
          <Badge tone="neutral">{lines.length} article{lines.length > 1 ? 's' : ''}</Badge>

          {/* Cliquables, comme sur un ticket : le compte mène aux lignes
              qu'il désigne, un second clic rend la liste entière. */}
          {counts.rejected > 0 ? (
            <FilterBadge tone="danger" actif={filtre === 'REJECTED'} onClick={() => bascule('REJECTED')}>
              {counts.rejected} rupture{counts.rejected > 1 ? 's' : ''}
            </FilterBadge>
          ) : null}
          {counts.validated > 0 ? (
            <FilterBadge tone="ok" actif={filtre === 'VALIDATED'} onClick={() => bascule('VALIDATED')}>
              {counts.validated} conforme{counts.validated > 1 ? 's' : ''}
            </FilterBadge>
          ) : null}
          {counts.adjusted > 0 ? (
            <FilterBadge tone="warn" actif={filtre === 'ADJUSTED'} onClick={() => bascule('ADJUSTED')}>
              {counts.adjusted} ajustée{counts.adjusted > 1 ? 's' : ''}
            </FilterBadge>
          ) : null}
          {counts.pending > 0 ? (
            <FilterBadge tone="neutral" actif={filtre === 'PENDING'} onClick={() => bascule('PENDING')}>
              {counts.pending} en attente
            </FilterBadge>
          ) : null}
        </div>

        {/* Recherche et passage : on cherche un article par son nom, ou on ne
            garde que ce qui a été soldé au 1ᵉʳ, 2ᵉ, 3ᵉ servi. Les deux se
            cumulent avec les comptes du dessus. */}
        <div className="no-print flex flex-wrap items-center gap-2 border-t border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
          <SearchField value={recherche} onChange={setRecherche} className="flex-1 basis-56" />
          {rangs.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par servi">
              <Pill actif={rang === null} onClick={() => setRang(null)}>
                Tous les servis
              </Pill>
              {rangs.map((r) => (
                <Pill key={r} actif={rang === r} onClick={() => setRang((v) => (v === r ? null : r))}>
                  Servi {r}
                  <span className="ml-1 text-[0.72rem] font-medium opacity-70">({parRang.get(r) ?? 0})</span>
                </Pill>
              ))}
            </div>
          ) : null}
          {filtree ? (
            <button
              type="button"
              onClick={() => { setFiltre(null); setRang(null); setRecherche('') }}
              className="inline-flex items-center gap-1 text-[0.78rem] font-semibold text-accent underline-offset-2 hover:underline"
            >
              <X className="size-3.5" />
              Afficher les {lines.length} lignes
            </button>
          ) : null}
        </div>

        <div className="no-print flex flex-wrap items-center gap-2 border-t border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
          <Button type="button" variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" />
            Imprimer les articles cumulés
          </Button>
        </div>
      </GlassCard>

      {affichees.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<PackageSearch className="size-6" />}
            title="Aucun article"
            description={lines.length === 0
              ? 'Ce département n’a rien commandé sur cette période.'
              : 'Aucune ligne ne répond à ce filtre.'}
          />
        </GlassCard>
      ) : (
        <GlassCard overflowVisible>
          <TableWrap minWidth="44rem">
            <thead>
              <tr>
                <Th className="w-10 text-right">#</Th>
                <Th className="w-full">Article</Th>
                <Th className="text-right">Tickets</Th>
                <Th className="text-right">Stock fixe</Th>
                <Th className="text-right">Commande</Th>
                <Th className="w-32 text-right">Servi</Th>
                <Th className="w-32">État</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
              {affichees.map((l, i) => {
                const ouvreFamille = i === 0 || affichees[i - 1].categoryName !== l.categoryName
                const b = BADGES[l.status]
                return (
                  <React.Fragment key={l.productId}>
                    {ouvreFamille ? (
                      <FamilyBand
                        name={l.categoryName}
                        count={parFamille.get(l.categoryName) ?? 0}
                        colSpan={7}
                      />
                    ) : null}
                    <tr
                      className={cn(
                        l.status === 'VALIDATED' && 'bg-ok/[0.16] shadow-[inset_3px_0_0_0_var(--ok)]',
                        l.status === 'ADJUSTED' && 'bg-warn/[0.2] shadow-[inset_3px_0_0_0_var(--warn)]',
                        l.status === 'REJECTED' && 'bg-danger/[0.16] shadow-[inset_3px_0_0_0_var(--danger)]',
                      )}
                    >
                      <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{i + 1}</Td>
                      <Td className="max-w-0">
                        <p className="truncate text-[0.85rem] font-medium text-fg">{l.productName}</p>
                        <p className="truncate font-mono text-[0.7rem] text-fg-subtle">{l.productRef}</p>
                      </Td>
                      <Td className="text-right tabular-nums text-fg-muted">
                        {/* Un article revenu sur plusieurs tickets mérite d'être repéré. */}
                        <span className={cn(l.ticketCount > 1 && 'font-bold text-warn')}>{l.ticketCount}</span>
                      </Td>
                      <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">
                        {formatQty(l.stockFixe)} {l.unitSymbol}
                      </Td>
                      <Td className="whitespace-nowrap text-right font-medium tabular-nums text-fg">
                        {formatQty(l.quantityAsked)} {l.unitSymbol}
                      </Td>
                      <Td className="text-right">
                        <span
                          className={cn(
                            'whitespace-nowrap text-[0.85rem] font-semibold tabular-nums',
                            l.status === 'VALIDATED' && 'text-ok',
                            l.status === 'ADJUSTED' && 'text-warn',
                            l.status === 'REJECTED' && 'text-danger',
                          )}
                        >
                          {l.status === 'PENDING'
                            ? ''
                            : l.status === 'REJECTED'
                              ? 'Rupture'
                              : `${formatQty(l.quantityServed)} ${l.unitSymbol}`}
                        </span>
                      </Td>
                      <Td>
                        {/* Une ligne soldée dit par quel passage : « Servi 1 »
                            au premier coup, « Servi 2 » ou « Servi 3 » quand il
                            a fallu un complément. */}
                        <Badge tone={b.tone}>
                          {l.status === 'VALIDATED' && l.servedRank > 0 ? `Servi ${l.servedRank}` : b.label}
                        </Badge>
                      </Td>
                    </tr>
                  </React.Fragment>
                )
              })}
            </tbody>
          </TableWrap>
        </GlassCard>
      )}
    </div>
  )
}

function Pill({
  actif, onClick, children,
}: {
  actif: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={cn(
        'inline-flex h-9 items-center rounded-full border px-3 text-[0.8rem] font-semibold transition-colors',
        actif
          ? 'border-accent/40 bg-accent/12 text-accent'
          : 'border-[rgb(var(--glass-edge)/0.34)] bg-white/65 text-fg-muted hover:bg-white hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

function FilterBadge({
  tone, actif, onClick, children,
}: {
  tone: 'neutral' | 'ok' | 'warn' | 'danger'
  actif: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={cn('rounded-full transition-shadow', actif && 'ring-2 ring-accent/40')}
    >
      <Badge tone={tone}>{children}</Badge>
    </button>
  )
}
