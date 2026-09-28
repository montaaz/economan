'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { ArrowUpFromLine, Layers } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button, TableWrap, Th, Td } from '@/components/ui/glass'
import { cn, formatLongDate, formatMoney, formatTime } from '@/lib/utils'

export type SortieJour = {
  id: string
  at: string
  label: string
  lineCount: number
  department: { name: string; color: string } | null
  by: string | null
  amount: number
  orderId: string | null
  refillId: string | null
}

/**
 * Les sorties d'une journée, sur une seule ligne du journal.
 *
 * Dix bons partis le même jour faisaient dix lignes vertes à la suite, et
 * la journée ne se lisait plus. Une ligne les résume — combien de bons,
 * vers quels services, pour combien — et s'ouvre sur leur liste, où une
 * pastille par département fait le tri.
 */
export function SortiesJourLigne({ jour, sorties, basePath, admin, retour }: {
  jour: string
  sorties: SortieJour[]
  basePath: string
  admin: boolean
  /** L'adresse du journal : la fiche ouverte d'ici y ramène. */
  retour: string
}) {
  // Un servi complémentaire a sa propre fiche ; le bon n° 1, celle de la commande.
  const lienFiche = (s: SortieJour) =>
    s.refillId ? `${basePath.replace(/\/commandes$/, '')}/servis/${s.refillId}?retour=${encodeURIComponent(retour)}`
      : s.orderId ? `${basePath}/${s.orderId}?retour=${encodeURIComponent(retour)}` : null
  const [ouvert, setOuvert] = React.useState(false)
  const [dep, setDep] = React.useState<string | null>(null)
  const total = sorties.reduce((s, m) => s + m.amount, 0)
  const lignes = sorties.reduce((s, m) => s + m.lineCount, 0)
  const departements = React.useMemo(() => {
    const m = new Map<string, { name: string; color: string; n: number; total: number }>()
    for (const s of sorties) {
      const nom = s.department?.name ?? 'Sans département'
      const d = m.get(nom) ?? { name: nom, color: s.department?.color ?? '#94a3b8', n: 0, total: 0 }
      d.n += 1; d.total += s.amount
      m.set(nom, d)
    }
    return [...m.values()]
  }, [sorties])
  const vues = dep === null ? sorties : sorties.filter((s) => (s.department?.name ?? 'Sans département') === dep)
  const pastille = 'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[0.8rem] font-semibold transition-colors'
  const inactive = 'border-[rgb(var(--glass-edge)/0.34)] bg-white/65 text-fg-muted hover:bg-white hover:text-fg'

  return (
    <>
      <tr
        role="button"
        tabIndex={0}
        onClick={() => setOuvert(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOuvert(true) } }}
        title="Voir les bons de la journée"
        className="cursor-pointer bg-ok/[0.15] shadow-[inset_5px_0_0_0_var(--ok)] transition-colors hover:bg-ok/[0.24]"
      >
        <Td className="whitespace-nowrap capitalize text-fg-muted">{formatLongDate(jour)}</Td>
        <Td>
          <span className="inline-flex items-center gap-1 rounded-full bg-ok px-2.5 py-1 text-[0.72rem] font-bold uppercase tracking-wide text-white">
            <ArrowUpFromLine className="size-3" />
            Sorties
          </span>
        </Td>
        <Td className="max-w-0">
          <p className="truncate text-[0.85rem] font-medium text-fg">{sorties.length} bon{sorties.length > 1 ? 's' : ''} de livraison — cliquer pour les voir</p>
          <p className="text-[0.72rem] text-fg-subtle">{lignes} ligne{lignes > 1 ? 's' : ''} · {departements.length} département{departements.length > 1 ? 's' : ''}</p>
        </Td>
        <Td className="whitespace-nowrap">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium text-fg">
            {departements.map((d) => (
              <span key={d.name} className="inline-flex items-center gap-1 text-[0.8rem]">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
                {d.name}<span className="text-fg-subtle">({d.n})</span>
              </span>
            ))}
          </span>
        </Td>
        <Td className="whitespace-nowrap text-fg-subtle">—</Td>
        <Td className="whitespace-nowrap text-right text-fg-subtle">—</Td>
        {admin ? <Td className="whitespace-nowrap text-right font-semibold tabular-nums text-ok">− {formatMoney(total)}</Td> : null}
      </tr>

      {ouvert ? createPortal(
        <Modal title={`Sorties du ${formatLongDate(jour)}${admin ? ` — ${formatMoney(total)}` : ''}`} onClose={() => { setOuvert(false); setDep(null) }} size="xl"
          footer={<Button variant="ghost" onClick={() => { setOuvert(false); setDep(null) }}>Fermer</Button>}>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setDep(null)} aria-pressed={dep === null} className={cn(pastille, dep === null ? 'border-accent/40 bg-accent/12 text-accent' : inactive)}>
              <Layers className="size-3.5" />
              Tous <span className="text-[0.72rem] font-medium opacity-70">({sorties.length})</span>
            </button>
            {departements.map((d) => (
              <button key={d.name} type="button" onClick={() => setDep(dep === d.name ? null : d.name)} aria-pressed={dep === d.name}
                className={cn(pastille, dep === d.name ? 'text-white' : inactive)}
                style={dep === d.name ? { background: d.color, borderColor: d.color } : undefined}>
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: dep === d.name ? 'rgb(255 255 255 / 0.6)' : d.color }} />
                {d.name} <span className="text-[0.72rem] font-medium opacity-75">({d.n}{admin ? ` · ${formatMoney(d.total)}` : ''})</span>
              </button>
            ))}
          </div>
          <TableWrap minWidth="44rem">
            <thead>
              <tr>
                <Th>Heure</Th>
                <Th className="w-full">Bon de livraison</Th>
                <Th>Département</Th>
                <Th>Par</Th>
                <Th className="text-right">Lignes</Th>
                {admin ? <Th className="text-right">Montant</Th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
              {vues.map((s) => (
                <tr key={s.id} className="bg-ok/[0.08]">
                  <Td className="whitespace-nowrap text-[0.8rem] text-fg-muted">{formatTime(s.at)}</Td>
                  <Td className="max-w-0">
                    {lienFiche(s) ? (
                      <Link href={lienFiche(s)!} className="block truncate text-[0.85rem] font-medium text-fg hover:underline">{s.label}</Link>
                    ) : <p className="truncate text-[0.85rem] font-medium text-fg">{s.label}</p>}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {s.department ? (
                      <span className="flex items-center gap-1.5 font-medium text-fg">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.department.color }} />
                        {s.department.name}
                      </span>
                    ) : <span className="text-fg-subtle">—</span>}
                  </Td>
                  <Td className="whitespace-nowrap text-[0.8rem] text-fg-muted">{s.by ?? '—'}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">{s.lineCount}</Td>
                  {admin ? <Td className="whitespace-nowrap text-right font-semibold tabular-nums text-ok">− {formatMoney(s.amount)}</Td> : null}
                </tr>
              ))}
              {vues.length === 0 ? (
                <tr><Td colSpan={admin ? 6 : 5} className="py-6 text-center text-[0.85rem] text-fg-muted">Aucun bon pour ce département ce jour-là.</Td></tr>
              ) : null}
            </tbody>
          </TableWrap>
        </Modal>,
        document.body,
      ) : null}
    </>
  )
}
