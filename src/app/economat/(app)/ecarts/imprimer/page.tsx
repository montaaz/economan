import type { Metadata } from 'next'
import { Fragment } from 'react'
import { executeGraphQL } from '@/server/graphql/execute'
import { requireRole } from '@/server/auth/guards'
import { DAY_BOARD_QUERY, ORDERS_QUERY } from '@/lib/queries'
import type { ProcessOrder } from '@/lib/order-types'
import type { Board } from '@/components/orders/day-board'
import { formatJourneeTravail, formatPeriod, formatQty } from '@/lib/utils'

export const metadata: Metadata = { title: 'Écarts de la journée' }
export const dynamic = 'force-dynamic'

type Vue = 'rupture' | 'ajuste' | 'tous'
const TITRES: Record<Vue, string> = { rupture: 'Ruptures', ajuste: 'Quantités ajustées', tous: 'Écarts' }

/**
 * Les écarts de la journée sur papier : ruptures, ajustées, ou les deux —
 * ce que montre l'écran. Un document pour tous les départements, chacun sur
 * sa page ; ou un seul, si l'écran est filtré. C'est cette page que le
 * serveur rend en PDF.
 */
export default async function EcartsImprimerPage({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string; jusquau?: string; dep?: string; type?: string }>
}) {
  await requireRole(['ECONOMAN', 'ADMIN'], '/economat/login')
  const { jour, jusquau, dep, type } = await searchParams
  const vue: Vue = type === 'ajuste' ? 'ajuste' : type === 'tous' ? 'tous' : 'rupture'
  const garde = (s: string) => (vue === 'rupture' ? s === 'REJECTED' : vue === 'ajuste' ? s === 'ADJUSTED' : s === 'REJECTED' || s === 'ADJUSTED')

  const { dayBoard: board } = await executeGraphQL<{ dayBoard: Board }>(DAY_BOARD_QUERY, { day: jour ?? null, dayTo: jusquau ?? null })
  const groupes = dep ? board.departments.filter((g) => g.department.id === dep) : board.departments
  const ids = groupes.flatMap((g) => g.orders.map((o) => o.id))
  const orders = ids.length === 0 ? [] : (await executeGraphQL<{ orders: ProcessOrder[] }>(ORDERS_QUERY, { ids })).orders

  // Par département : les lignes de la nature demandée — l'état d'origine
  // compte, une rupture complétée depuis reste une rupture sur ce papier.
  const parRayon = new Map<string, { nom: string; lignes: (ProcessOrder['lines'][number] & { ref: string })[] }>()
  for (const o of orders) {
    for (const l of o.lines) {
      if (!garde(l.initialStatus ?? l.status) && !garde(l.status)) continue
      const r = parRayon.get(o.department.id) ?? { nom: o.department.name, lignes: [] }
      r.lignes.push({ ...l, ref: o.reference })
      parRayon.set(o.department.id, r)
    }
  }
  const rayons = groupes.map((g) => parRayon.get(g.department.id)).filter((r): r is NonNullable<typeof r> => !!r && r.lignes.length > 0)
  for (const r of rayons) r.lignes.sort((a, b) => a.ref.localeCompare(b.ref) || a.rang - b.rang)
  const jourTexte = board.isRange ? formatPeriod(board.day, board.dayTo) : formatJourneeTravail(board.day)

  if (rayons.length === 0) {
    return (
      <div className="bg-white p-4 text-[0.85rem] text-[#0f1e33]">
        <h1 className="text-[1.05rem] font-bold">{TITRES[vue]} — {jourTexte}</h1>
        <p className="mt-2 text-[#4a5f7d]">Aucune ligne sur cette journée.</p>
      </div>
    )
  }

  return (
    <>
      {rayons.map((r, i) => {
        const ruptures = r.lignes.filter((l) => (l.initialStatus ?? l.status) === 'REJECTED').length
        const ajustees = r.lignes.length - ruptures
        return (
          <div key={r.nom} className="bg-white px-1 py-1 text-[0.74rem] leading-tight text-[#0f1e33]" style={i > 0 ? { breakBefore: 'page' } : undefined}>
            <header className="flex items-end justify-between gap-4 border-b-2 border-[#0f1e33] pb-1">
              <div>
                <h1 className="text-[1.05rem] font-bold leading-tight">{TITRES[vue]} — {r.nom}</h1>
                <p className="text-[0.76rem] first-letter:uppercase">{jourTexte}</p>
              </div>
              <div className="text-right">
                <p className="text-[0.95rem] font-bold leading-none">{r.lignes.length} ligne{r.lignes.length > 1 ? 's' : ''}</p>
                <p className="text-[0.72rem]">
                  {ruptures > 0 ? <span className="text-[#d63f5a]">{ruptures} rupture{ruptures > 1 ? 's' : ''}</span> : null}
                  {ruptures > 0 && ajustees > 0 ? ' · ' : null}
                  {ajustees > 0 ? <span className="text-[#b4630f]">{ajustees} ajustée{ajustees > 1 ? 's' : ''}</span> : null}
                </p>
              </div>
            </header>
            <table className="mt-1 w-full table-fixed border-collapse">
              <thead>
                <tr className="border-y border-[#0f1e33] bg-[#f0f4fa]">
                  <th className="w-6 px-1 py-0.5 text-right font-semibold">#</th>
                  <th className="px-1 py-0.5 text-left font-semibold">Article</th>
                  <th className="w-28 px-1 py-0.5 text-left font-semibold">Ticket</th>
                  <th className="w-20 px-1 py-0.5 text-right font-semibold">Commande</th>
                  <th className="w-16 px-1 py-0.5 text-right font-semibold">Servi</th>
                  <th className="w-16 px-1 py-0.5 text-right font-semibold">Reste</th>
                  <th className="w-16 px-1 py-0.5 text-left font-semibold">État</th>
                </tr>
              </thead>
              <tbody>
                {r.lignes.map((l, k) => {
                  const rupture = (l.initialStatus ?? l.status) === 'REJECTED'
                  const servi = Number(l.quantityServed ?? 0) + Number(l.quantityRefilled ?? 0)
                  const ouvre = k === 0 || r.lignes[k - 1].categoryName !== l.categoryName
                  return (
                    <Fragment key={l.id}>
                      {ouvre ? (
                        <tr className="border-y border-[#b9c8e0] bg-[#e8eefa]">
                          <td colSpan={7} className="px-1 py-px text-[0.68rem] font-bold uppercase tracking-[0.05em]">{l.categoryName}</td>
                        </tr>
                      ) : null}
                      <tr className="border-b border-[#e3e9f3]" style={{ background: rupture ? '#fdeaee' : '#fdf1e3' }}>
                        <td className="px-1 py-px text-right tabular-nums text-[#4a5f7d]">{l.rang}</td>
                        <td className="max-w-0 truncate whitespace-nowrap px-1 py-px">
                          <span className="font-medium">{l.productName}</span>
                          <span className="ml-1 font-mono text-[0.62rem] text-[#4a5f7d]">{l.productRef}</span>
                        </td>
                        <td className="whitespace-nowrap px-1 py-px font-mono text-[0.64rem]">{l.ref}</td>
                        <td className="whitespace-nowrap px-1 py-px text-right font-semibold tabular-nums">{formatQty(l.quantityAsked)} <span className="text-[0.64rem] font-normal text-[#4a5f7d]">{l.unitSymbol}</span></td>
                        <td className="whitespace-nowrap px-1 py-px text-right tabular-nums">{formatQty(servi)} <span className="text-[0.64rem] text-[#4a5f7d]">{l.unitSymbol}</span></td>
                        <td className="whitespace-nowrap px-1 py-px text-right font-bold tabular-nums" style={{ color: Number(l.remaining) > 0 ? '#d63f5a' : '#0b7a55' }}>
                          {Number(l.remaining) > 0 ? `${formatQty(l.remaining)} ${l.unitSymbol}` : 'soldé'}
                        </td>
                        <td className="whitespace-nowrap px-1 py-px font-semibold" style={{ color: rupture ? '#d63f5a' : '#b4630f' }}>{rupture ? 'Rupture' : 'Ajusté'}</td>
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </>
  )
}

