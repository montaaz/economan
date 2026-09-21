import * as React from 'react'
import { formatLongDate, formatQty, formatTime } from '@/lib/utils'

export type RefillTicket = {
  rank: number
  createdAt: string
  createdBy: { fullName: string } | null
  order: {
    reference: string
    ticketNumber: number
    businessDay: string
    department: { name: string; code: string }
    createdBy: { fullName: string }
  }
  lines: {
    productName: string
    productRef: string
    categoryName: string
    unitSymbol: string
    quantity: number
  }[]
}

const RANGS = ['', '', 'deuxième', 'troisième', 'quatrième', 'cinquième', 'sixième']

/**
 * Bon d'un service complémentaire.
 *
 * Il ne porte que ce qui sort à ce passage : celui qui transporte la
 * marchandise ne lit que ce qu'il a dans les mains, pas les cent articles de
 * la commande d'origine.
 */
export function RefillTicketSheet({ refill }: { refill: RefillTicket }) {
  const o = refill.order
  // Les familles regroupées, comme sur tous les autres bons.
  const ordre: string[] = []
  for (const l of refill.lines) if (!ordre.includes(l.categoryName)) ordre.push(l.categoryName)
  const lines = ordre.flatMap((c) => refill.lines.filter((l) => l.categoryName === c))

  return (
    <div className="mx-auto max-w-[190mm] bg-white p-6 text-[0.86rem] text-[#0f1e33]">
      <header className="flex items-start justify-between gap-4 border-b-2 border-[#0f1e33] pb-2">
        <div>
          <h1 className="text-[1.3rem] font-bold leading-tight">
            Bon de livraison — {RANGS[refill.rank] ?? `${refill.rank}ᵉ`} service
          </h1>
          <p className="font-mono text-[0.9rem] font-semibold">{o.reference}</p>
        </div>
        <div className="text-right">
          <p className="text-[1.5rem] font-bold leading-none">N°{o.ticketNumber}</p>
          <p className="text-[0.8rem] capitalize">{formatLongDate(o.businessDay)}</p>
        </div>
      </header>

      <p className="mt-3 text-center text-[1.6rem] font-bold uppercase tracking-tight">
        {o.department.name}
      </p>
      <p className="text-center text-[1rem] font-bold tabular-nums">
        {formatTime(refill.createdAt)}
      </p>

      <p className="mt-3 flex flex-wrap justify-between gap-x-6 text-[0.85rem]">
        <span><span className="font-semibold">Demandeur :</span> {o.createdBy.fullName}</span>
        {refill.createdBy ? (
          <span><span className="font-semibold">Servi par :</span> {refill.createdBy.fullName}</span>
        ) : null}
      </p>

      {/* Ce complément vient après un premier bon : le rappeler évite qu'on le
          prenne pour la commande entière. */}
      <p className="mt-2 border-l-2 border-[#b4630f] bg-[#fdf1e3] px-2.5 py-1.5 text-[0.82rem]">
        Complément de la commande <span className="font-mono font-semibold">{o.reference}</span> —
        seuls les articles ci-dessous sortent à ce passage.
      </p>

      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr className="border-y border-[#0f1e33] bg-[#f0f4fa]">
            <th className="w-8 px-2 py-1.5 text-right font-semibold">#</th>
            <th className="px-2 py-1.5 text-left font-semibold">
              Article <span className="font-normal">({lines.length})</span>
            </th>
            <th className="w-28 px-2 py-1.5 text-right font-semibold">Servi</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <React.Fragment key={`${l.productRef}-${i}`}>
              {i === 0 || lines[i - 1].categoryName !== l.categoryName ? (
                <tr>
                  <td
                    colSpan={3}
                    className="border-y border-[#b9c8e0] bg-[#e8eefa] px-2 py-1 text-[0.76rem] font-bold uppercase tracking-[0.06em]"
                  >
                    {l.categoryName}
                    <span className="ml-1.5 font-semibold opacity-70">
                      ({lines.filter((x) => x.categoryName === l.categoryName).length})
                    </span>
                  </td>
                </tr>
              ) : null}
              <tr className="border-b border-[#dbe3ef]">
                <td className="px-2 py-1 text-right tabular-nums text-[#4a5f7d]">{i + 1}</td>
                <td className="px-2 py-1 font-medium">{l.productName}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right font-semibold tabular-nums">
                  {formatQty(l.quantity)}
                  <span className="ml-1 text-[0.72rem] font-normal text-[#4a5f7d]">
                    {l.unitSymbol}
                  </span>
                </td>
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>

      <div className="mt-10 flex justify-between gap-8 text-[0.82rem]">
        <div className="flex-1">
          <p className="font-semibold">Économat</p>
          <p className="mt-8 border-t border-[#0f1e33] pt-1">Signature</p>
        </div>
        <div className="flex-1">
          <p className="font-semibold">Réception — {o.department.name}</p>
          <p className="mt-8 border-t border-[#0f1e33] pt-1">Signature</p>
        </div>
      </div>
    </div>
  )
}
