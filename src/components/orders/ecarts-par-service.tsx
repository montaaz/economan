import * as React from 'react'
import Link from 'next/link'
import { ChevronRight, MessageSquareWarning } from 'lucide-react'
import { GlassCard, Badge, TableWrap, Th, Td } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { FamilyBand, countByFamily } from '@/components/ui/family-band'
import { cn, formatQty, formatTime } from '@/lib/utils'
import type { ProcessOrder } from '@/lib/order-types'

/**
 * Les lignes en écart d'une journée, un bloc par service.
 *
 * Empiler les fiches entières répétait l'en-tête du Bar autant de fois qu'il
 * avait passé de commandes : trois blocs pour dire trois fois « Bar ». Le
 * service ouvre donc son bloc une seule fois, et chaque ligne porte le ticket
 * dont elle vient.
 */
export function EcartsParService({
  orders, status,
}: {
  orders: ProcessOrder[]
  status: 'REJECTED' | 'ADJUSTED'
}) {
  const rupture = status === 'REJECTED'

  // Les commandes arrivent déjà dans l'ordre de la journée : on les regroupe
  // sans les réordonner, pour que les services gardent leur rang habituel.
  const services: { id: string; nom: string; couleur: string; icone: string | null;
    lignes: (ProcessOrder['lines'][number] & { ref: string; heure: string; id: string })[] }[] = []

  for (const o of orders) {
    const concernees = o.lines.filter((l) => l.status === status)
    if (concernees.length === 0) continue
    let bloc = services.find((s) => s.id === o.department.id)
    if (!bloc) {
      bloc = {
        id: o.department.id, nom: o.department.name,
        couleur: o.department.color, icone: o.department.icon, lignes: [],
      }
      services.push(bloc)
    }
    for (const l of concernees) {
      bloc.lignes.push({ ...l, ref: o.reference, heure: o.createdAt, id: o.id })
    }
  }

  // Les lignes viennent de plusieurs tickets : sans ce regroupement, la même
  // famille ouvrait un bandeau par commande. On garde l'ordre d'apparition
  // des familles, et celui des articles à l'intérieur.
  for (const s of services) {
    const ordre: string[] = []
    for (const l of s.lignes) if (!ordre.includes(l.categoryName)) ordre.push(l.categoryName)
    s.lignes = ordre.flatMap((c) => s.lignes.filter((l) => l.categoryName === c))
  }

  return (
    <div className="space-y-5">
      {services.map((s) => {
        const parFamille = countByFamily(s.lignes)
        // Les tickets du service, pour les rappeler en tête de bloc.
        const tickets = [...new Set(s.lignes.map((l) => l.ref))]
        return (
          <GlassCard key={s.id} overflowVisible>
            {/* Le service, une seule fois. */}
            <header
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-3 sm:px-5"
              style={{
                borderColor: `${s.couleur}26`,
                background: `linear-gradient(120deg, ${s.couleur}1f, ${s.couleur}0a 70%, transparent)`,
              }}
            >
              <h2 className="flex min-w-0 items-center gap-2.5">
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-sm"
                  style={{ background: `linear-gradient(140deg, ${s.couleur}, ${s.couleur}bb)` }}
                >
                  <Icon name={s.icone ?? 'Building2'} className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[1.15rem] font-bold leading-tight text-fg sm:text-[1.05rem]">
                    {s.nom}
                  </span>
                  <span className="block text-[0.85rem] font-medium text-fg sm:text-[0.78rem]">
                    {s.lignes.length} ligne{s.lignes.length > 1 ? 's' : ''} ·{' '}
                    {tickets.length} ticket{tickets.length > 1 ? 's' : ''}
                  </span>
                </span>
              </h2>

              {/* Chaque ticket reste atteignable : on vient ici pour agir. */}
              <span className="flex flex-wrap items-center gap-1.5">
                {tickets.map((ref) => {
                  const id = s.lignes.find((l) => l.ref === ref)!.id
                  return (
                    <Link
                      key={ref}
                      href={`/economat/commandes/${id}`}
                      className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--glass-edge)/0.3)] bg-white/60 px-2 py-0.5 font-mono text-[0.75rem] font-bold text-fg transition-colors hover:bg-white"
                    >
                      {ref}
                      <ChevronRight className="size-3.5" />
                    </Link>
                  )
                })}
              </span>
            </header>

            <TableWrap minWidth="46rem">
              <thead>
                <tr>
                  <Th className="w-10 text-right">#</Th>
                  <Th className="w-full">Article</Th>
                  <Th className="text-right">Stock fixe</Th>
                  <Th className="text-right">Commande</Th>
                  <Th className="text-right">Servi</Th>
                  <Th>État</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
                {s.lignes.map((l, i) => (
                  <React.Fragment key={`${l.ref}-${l.id}-${i}`}>
                    {i === 0 || s.lignes[i - 1].categoryName !== l.categoryName ? (
                      <FamilyBand
                        name={l.categoryName}
                        count={parFamille.get(l.categoryName) ?? 0}
                        colSpan={6}
                      />
                    ) : null}
                    <tr className={cn(rupture ? 'bg-danger/[0.06]' : 'bg-warn/[0.07]')}>
                      <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">
                        {i + 1}
                      </Td>
                      <Td className="max-w-0">
                        <p className="truncate text-[0.85rem] font-medium text-fg">
                          {l.productName}
                        </p>
                        <p className="truncate font-mono text-[0.7rem] text-fg-subtle">
                          {l.productRef}
                          {/* Plusieurs tickets cohabitent : sans sa référence,
                              une ligne ne dirait pas d'où elle vient. */}
                          <span className="ml-2">{l.ref}</span>
                          <span className="ml-2 font-sans">{formatTime(l.heure)}</span>
                        </p>
                        {l.rejectReason ? (
                          <p className="mt-0.5 flex items-start gap-1 text-[0.75rem] font-medium leading-snug text-danger">
                            <MessageSquareWarning className="mt-px size-3.5 shrink-0" />
                            {l.rejectReason}
                          </p>
                        ) : null}
                      </Td>
                      <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">
                        {formatQty(l.stockFixe)} {l.unitSymbol}
                      </Td>
                      <Td className="whitespace-nowrap text-right font-semibold tabular-nums text-fg">
                        {formatQty(l.quantityAsked)} {l.unitSymbol}
                      </Td>
                      <Td className="whitespace-nowrap text-right font-bold tabular-nums">
                        {rupture ? (
                          <span className="text-danger">Rupture</span>
                        ) : (
                          <span className="text-warn">
                            {formatQty(l.quantityServed ?? 0)} {l.unitSymbol}
                          </span>
                        )}
                      </Td>
                      <Td>
                        <Badge tone={rupture ? 'danger' : 'warn'}>
                          {rupture ? 'Rupture' : 'Ajusté'}
                        </Badge>
                      </Td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </TableWrap>
          </GlassCard>
        )
      })}
    </div>
  )
}
