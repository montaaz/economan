import { formatLongDate, formatQty, formatTime } from '@/lib/utils'

export type TicketLine = {
  id: string
  productName: string
  productRef: string
  categoryName: string
  unitSymbol: string
  quantityAsked: number
  quantityServed: number | null
  status: 'PENDING' | 'VALIDATED' | 'ADJUSTED' | 'REJECTED'
  rejectReason: string | null
}

export type TicketOrder = {
  reference: string
  ticketNumber: number
  businessDay: string
  createdAt: string
  note: string | null
  department: { name: string; code: string }
  createdBy: { fullName: string }
  processedBy: { fullName: string } | null
  lines: TicketLine[]
}

/**
 * Rendu papier d'un ticket ou d'un bon de livraison.
 * `variant="bon"` ajoute la colonne « servi » et le bloc de signatures.
 */
export function Ticket({
  order, variant = 'ticket',
}: {
  order: TicketOrder
  variant?: 'ticket' | 'bon'
}) {
  const isBon = variant === 'bon'
  const lines = isBon ? order.lines.filter((l) => l.status !== 'REJECTED') : order.lines
  const rejected = order.lines.filter((l) => l.status === 'REJECTED')

  return (
    <div className="print-page bg-white p-5 text-[#0f1e33]">
      <header className="mb-4 flex items-start justify-between gap-4 border-b-2 border-[#0f1e33] pb-3">
        <div>
          <p className="text-[1.25rem] font-bold leading-tight tracking-tight">
            {isBon ? 'Bon de livraison' : 'Ticket de commande'}
          </p>
          <p className="mt-0.5 font-mono text-[0.85rem] font-semibold">{order.reference}</p>
        </div>
        <div className="text-right">
          <p className="text-[1.5rem] font-bold leading-none tabular-nums">
            N°{order.ticketNumber}
          </p>
          <p className="mt-1 text-[0.8rem] capitalize">{formatLongDate(order.businessDay)}</p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 text-[0.85rem]">
        <p>
          <span className="font-semibold">Département :</span> {order.department.name} (
          {order.department.code})
        </p>
        <p>
          <span className="font-semibold">Demandeur :</span> {order.createdBy.fullName}
        </p>
        <p>
          <span className="font-semibold">Heure :</span> {formatTime(order.createdAt)}
        </p>
        {order.processedBy ? (
          <p>
            <span className="font-semibold">Traité par :</span> {order.processedBy.fullName}
          </p>
        ) : null}
      </div>

      <table className="w-full border-collapse text-[0.82rem]">
        <thead>
          <tr className="border-y border-[#0f1e33] bg-[#f0f4fa]">
            <th className="w-8 px-2 py-1.5 text-right font-semibold">#</th>
            <th className="px-2 py-1.5 text-left font-semibold">Article</th>
            <th className="w-16 px-2 py-1.5 text-left font-semibold">Unité</th>
            <th className="w-20 px-2 py-1.5 text-right font-semibold">Demandé</th>
            {isBon ? <th className="w-20 px-2 py-1.5 text-right font-semibold">Servi</th> : null}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id} className="border-b border-[#d5dfee]">
              <td className="px-2 py-1 text-right tabular-nums text-[#4a5f7d]">{i + 1}</td>
              <td className="px-2 py-1">
                <span className="font-medium">{l.productName}</span>
                <span className="ml-1.5 font-mono text-[0.7rem] text-[#4a5f7d]">{l.productRef}</span>
              </td>
              <td className="px-2 py-1">{l.unitSymbol}</td>
              <td className="px-2 py-1 text-right tabular-nums">{formatQty(l.quantityAsked)}</td>
              {isBon ? (
                <td className="px-2 py-1 text-right font-semibold tabular-nums">
                  {formatQty(l.quantityServed ?? 0)}
                  {l.status === 'ADJUSTED' ? ' *' : ''}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[#0f1e33] font-bold">
            <td colSpan={3} className="px-2 py-1.5 text-right">
              Total ({lines.length} lignes)
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums">
              {formatQty(lines.reduce((s, l) => s + l.quantityAsked, 0))}
            </td>
            {isBon ? (
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatQty(lines.reduce((s, l) => s + (l.quantityServed ?? 0), 0))}
              </td>
            ) : null}
          </tr>
        </tfoot>
      </table>

      {isBon && order.lines.some((l) => l.status === 'ADJUSTED') ? (
        <p className="mt-2 text-[0.74rem] italic text-[#4a5f7d]">
          * quantité servie différente de la quantité demandée.
        </p>
      ) : null}

      {isBon && rejected.length > 0 ? (
        <div className="mt-4 border border-[#d63f5a] p-2.5">
          <p className="mb-1.5 text-[0.82rem] font-bold text-[#d63f5a]">
            Non servi — rupture ({rejected.length})
          </p>
          <ul className="space-y-0.5 text-[0.78rem]">
            {rejected.map((l) => (
              <li key={l.id}>
                {l.productName} — {formatQty(l.quantityAsked)} {l.unitSymbol}
                {l.rejectReason ? ` (${l.rejectReason})` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {order.note ? (
        <p className="mt-3 border-l-2 border-[#7089a8] pl-2.5 text-[0.8rem] italic">
          <span className="font-semibold not-italic">Note :</span> {order.note}
        </p>
      ) : null}

      {isBon ? (
        <div className="mt-8 grid grid-cols-2 gap-8 text-[0.8rem]">
          <div>
            <p className="mb-8 font-semibold">Économat</p>
            <p className="border-t border-[#0f1e33] pt-1">Signature</p>
          </div>
          <div>
            <p className="mb-8 font-semibold">Réception — {order.department.name}</p>
            <p className="border-t border-[#0f1e33] pt-1">Signature</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
