import Link from 'next/link'
import { Warehouse, ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, RotateCcw } from 'lucide-react'
import { GlassCard, EmptyState, TableWrap, Th, Td } from '@/components/ui/glass'
import { DateRangeFilter } from '@/components/orders/date-range-filter'
import { stockMovements } from '@/server/services/stock'
import { businessDay, cn, formatLongDate, formatMoney, formatQty, formatTime, toDateKey } from '@/lib/utils'

function borne(v: string | undefined): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Le journal du stock général : une ligne par arrivage (entrée, en rouge) et
 * par bon émis (sortie, en vert), valorisés au coût moyen, la plus récente
 * d'abord. Rendu en base directement, comme l'historique des tickets.
 */
export async function StockHistory({
  selfPath, basePath, from, to, type, tout, admin = false,
}: {
  selfPath: string
  basePath: string
  from?: string
  to?: string
  type?: string
  /** « Tout l'historique » : l'utilisateur a levé la journée par défaut. */
  tout?: string
  /** L'argent ne se lit qu'en administration : l'économat voit les mouvements, pas leur valeur. */
  admin?: boolean
}) {
  // Sans période choisie, la journée de service en cours : c'est elle qu'on
  // vient relire. Une période explicite remonte aussi loin qu'on veut.
  const jourCourant = toDateKey(businessDay())
  const parDefaut = !from && !to && tout !== '1'
  const fromEff = parDefaut ? jourCourant : from
  const toEff = parDefaut ? jourCourant : to
  let a = borne(fromEff)
  let b = borne(toEff)
  if (a && b && a > b) [a, b] = [b, a]
  const t = type === 'entree' ? 'ENTREE' : type === 'sortie' ? 'SORTIE' : null
  // Les totaux portent sur la période entière, quel que soit le filtre :
  // la carte « Sorties » doit garder son chiffre quand on regarde les entrées.
  const [mouvements, tous] = await Promise.all([
    stockMovements({ from: a, to: b, type: t }),
    t === null ? null : stockMovements({ from: a, to: b, type: null }),
  ])
  const base = tous ?? mouvements
  const entrees = base.filter((m) => m.type === 'ENTREE').reduce((s, m) => s + m.amount, 0)
  const sorties = base.filter((m) => m.type === 'SORTIE').reduce((s, m) => s + m.amount, 0)
  const nbEntrees = base.filter((m) => m.type === 'ENTREE').length
  const nbSorties = base.filter((m) => m.type === 'SORTIE').length
  // Le filtre garde la vue et le type : on ne retombe pas sur les tickets.
  // Effacer les dates veut dire « tout l'historique », pas « aujourd'hui ».
  const filtre = (
    <div className="mb-1 flex flex-wrap items-center gap-x-3">
      <DateRangeFilter from={fromEff ?? null} to={toEff ?? null} basePath={selfPath} keep={{ vue: 'stock', type }} clearParams={{ tout: '1' }} />
      {parDefaut ? <p className="mb-4 text-[0.78rem] text-fg-muted">Aujourd’hui par défaut — choisissez une période pour remonter plus loin.</p> : null}
    </div>
  )
  // Les cartes sont le filtre : cliquer « Entrées » ne garde que les entrées,
  // « Sorties » les sorties, « Réinitialiser » rend tout.
  const lienType = (v: 'entree' | 'sortie' | null) => {
    const q = new URLSearchParams({ vue: 'stock' })
    if (from) q.set('du', from)
    if (to) q.set('au', to)
    if (tout === '1') q.set('tout', '1')
    if (v) q.set('type', v)
    return `${selfPath}?${q}`
  }
  const cartes = (
    <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
      {/* Rouge franc pour ce qui entre, vert franc pour ce qui sort : la carte
          choisie se remplit de sa couleur, l'autre garde sa teinte. */}
      <Link href={lienType(t === 'ENTREE' ? null : 'entree')} aria-pressed={t === 'ENTREE'} className="block">
        <div className={cn('h-full rounded-2xl border-2 p-4 transition-[box-shadow,transform] hover:-translate-y-0.5',
          t === 'ENTREE'
            ? 'border-danger bg-danger text-white shadow-[0_12px_28px_-12px_rgb(220_38_38/0.6)]'
            : 'border-danger/50 bg-gradient-to-br from-danger/25 to-danger/[0.08] text-fg')}>
          <p className={cn('flex items-center gap-2 text-[0.78rem] font-bold uppercase tracking-wide', t === 'ENTREE' ? 'text-white' : 'text-danger')}><ArrowDownToLine className="size-4" /> Entrées</p>
          <p className="mt-1 text-[1.6rem] font-bold tabular-nums">{admin ? formatMoney(entrees) : `${nbEntrees} entrée${nbEntrees > 1 ? 's' : ''}`}</p>
          <p className={cn('text-[0.78rem]', t === 'ENTREE' ? 'text-white/85' : 'text-danger/80')}>{t === 'ENTREE' ? 'Seules les entrées sont affichées · cliquer pour tout revoir' : 'Cliquer pour ne voir que les entrées'}</p>
        </div>
      </Link>
      <Link href={lienType(t === 'SORTIE' ? null : 'sortie')} aria-pressed={t === 'SORTIE'} className="block">
        <div className={cn('h-full rounded-2xl border-2 p-4 transition-[box-shadow,transform] hover:-translate-y-0.5',
          t === 'SORTIE'
            ? 'border-ok bg-ok text-white shadow-[0_12px_28px_-12px_rgb(22_163_74/0.6)]'
            : 'border-ok/50 bg-gradient-to-br from-ok/25 to-ok/[0.08] text-fg')}>
          <p className={cn('flex items-center gap-2 text-[0.78rem] font-bold uppercase tracking-wide', t === 'SORTIE' ? 'text-white' : 'text-ok')}><ArrowUpFromLine className="size-4" /> Sorties</p>
          <p className="mt-1 text-[1.6rem] font-bold tabular-nums">{admin ? formatMoney(sorties) : `${nbSorties} sortie${nbSorties > 1 ? 's' : ''}`}</p>
          <p className={cn('text-[0.78rem]', t === 'SORTIE' ? 'text-white/85' : 'text-ok/80')}>{t === 'SORTIE' ? 'Seules les sorties sont affichées · cliquer pour tout revoir' : 'Cliquer pour ne voir que les sorties'}</p>
        </div>
      </Link>
      {t !== null ? (
        <Link href={lienType(null)} className="inline-flex h-11 items-center gap-2 self-center rounded-xl border border-[rgb(var(--glass-edge)/0.34)] bg-white/70 px-4 text-[0.85rem] font-semibold text-fg transition-colors hover:bg-white">
          <RotateCcw className="size-4" />
          Réinitialiser
        </Link>
      ) : null}
    </div>
  )

  if (mouvements.length === 0) {
    return (
      <>
        {filtre}
        {cartes}
        <GlassCard>
          <EmptyState icon={<Warehouse className="size-6" />} title={t === 'ENTREE' ? 'Aucune entrée' : t === 'SORTIE' ? 'Aucune sortie' : 'Aucun mouvement'}
            description={a || b ? 'Rien sur cette période.' : 'Rien d’enregistré pour l’instant.'} />
        </GlassCard>
      </>
    )
  }

  return (
    <>
      {filtre}
      {cartes}
      <GlassCard>
        <TableWrap minWidth="52rem">
          <thead>
            <tr>
              <Th>Journée</Th>
              <Th>Mouvement</Th>
              <Th className="w-full">Détail</Th>
              <Th>Département</Th>
              <Th>Par</Th>
              <Th className="text-right">Quantité</Th>
              {admin ? <Th className="text-right">Montant</Th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
            {mouvements.map((m) => {
              const entree = m.type === 'ENTREE'
              const inventaire = m.type === 'INVENTAIRE'
              const cell = (
                <>
                  <p className="truncate text-[0.85rem] font-medium text-fg">{m.label}</p>
                  {m.detail ? <p className="truncate text-[0.72rem] text-fg-subtle">{m.detail}</p> : entree ? null : (
                    <p className="text-[0.72rem] text-fg-subtle">{m.lineCount} ligne{m.lineCount > 1 ? 's' : ''}</p>
                  )}
                </>
              )
              return (
                <tr key={m.id} className={cn('transition-colors', inventaire ? 'bg-accent/[0.10] shadow-[inset_5px_0_0_0_var(--accent)]' : entree ? 'bg-danger/[0.13] shadow-[inset_5px_0_0_0_var(--danger)]' : 'bg-ok/[0.15] shadow-[inset_5px_0_0_0_var(--ok)]')}>
                  <Td className="whitespace-nowrap capitalize text-fg-muted">
                    {formatLongDate(m.businessDay)}
                    <span className="ml-1.5 text-[0.75rem] text-fg-subtle">{formatTime(m.at)}</span>
                  </Td>
                  <Td>
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.72rem] font-bold uppercase tracking-wide text-white',
                      inventaire ? 'bg-accent' : entree ? 'bg-danger' : 'bg-ok')}>
                      {inventaire ? <ClipboardCheck className="size-3" /> : entree ? <ArrowDownToLine className="size-3" /> : <ArrowUpFromLine className="size-3" />}
                      {inventaire ? 'Inventaire' : entree ? 'Entrée' : 'Sortie'}
                    </span>
                  </Td>
                  <Td className="max-w-0">
                    {m.orderId ? <Link href={`${basePath}/${m.orderId}`} className="block hover:underline">{cell}</Link> : cell}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {m.department ? (
                      <span className="flex items-center gap-1.5 font-medium text-fg">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: m.department.color }} />
                        {m.department.name}
                      </span>
                    ) : <span className="text-fg-subtle">Stock général</span>}
                  </Td>
                  <Td className="whitespace-nowrap text-fg-muted">{m.by ?? <span className="text-fg-subtle">—</span>}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">
                    {m.quantity !== null ? `${formatQty(m.quantity)} ${m.unitSymbol ?? ''}` : <span className="text-fg-subtle">—</span>}
                  </Td>
                  {admin ? (
                    <Td className={cn('whitespace-nowrap text-right font-semibold tabular-nums', inventaire ? 'text-accent' : entree ? 'text-danger' : 'text-ok')}>
                      {inventaire ? '=' : entree ? '+' : '−'} {formatMoney(m.amount)}
                    </Td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </TableWrap>
      </GlassCard>
    </>
  )
}
