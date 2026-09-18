import { formatLongDate, formatQty, formatTime } from '@/lib/utils'

export type TicketLine = {
  id: string
  productName: string
  productRef: string
  categoryName: string
  unitSymbol: string
  stockFixe: number
  quantityOnHand: number
  quantityAsked: number
  quantityServed: number | null
  /** Compté à la réception ; nul tant que l'employé n'a pas vérifié. */
  quantityReceived?: number | null
  /** Écart reçu − servi. 0 si conforme ou non vérifié. */
  receiptGap?: number
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

      {/* Le département est ce qu'on lit en premier à la distribution : il
          passe au centre, en grand, avant le reste des informations. */}
      <p className="mb-3 text-center text-[1.6rem] font-bold uppercase leading-tight tracking-wide">
        {order.department.name}
        <span className="ml-2 text-[1rem] font-semibold text-[#4a5f7d]">
          ({order.department.code})
        </span>
      </p>

      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 text-[0.85rem]">
        <p>
          <span className="font-semibold">Demandeur :</span> {order.createdBy.fullName}
        </p>
        {order.processedBy ? (
          <p>
            <span className="font-semibold">Traité par :</span> {order.processedBy.fullName}
          </p>
        ) : null}
        <p>
          <span className="font-semibold">Heure :</span> {formatTime(order.createdAt)}
        </p>
      </div>

      <table className="w-full border-collapse text-[0.82rem]">
        <thead>
          <tr className="border-y border-[#0f1e33] bg-[#f0f4fa]">
            <th className="w-8 px-2 py-1.5 text-right font-semibold">#</th>
            <th className="px-2 py-1.5 text-left font-semibold">Article</th>
            <th className="w-16 px-2 py-1.5 text-right font-semibold">Fixe</th>
            {/* L'unité rejoint la quantité qu'elle qualifie : « 5 u » se lit
                d'un bloc, et la colonne « En rayon » disparaît — le stock
                compté par l'employé ne sert pas à celui qui distribue. */}
            <th className="w-24 px-2 py-1.5 text-right font-semibold">Demandé</th>
            {isBon ? <th className="w-24 px-2 py-1.5 text-right font-semibold">Servi</th> : null}
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
              <td className="px-2 py-1 text-right tabular-nums text-[#4a5f7d]">
                {formatQty(l.stockFixe)}
              </td>
              <td className="px-2 py-1 text-right font-semibold tabular-nums">
                {formatQty(l.quantityAsked)}
                <span className="ml-1 text-[0.72rem] font-normal text-[#4a5f7d]">
                  {l.unitSymbol}
                </span>
              </td>
              {/* Case laissée vide : la quantité servie s'écrit au stylo au
                  moment de la distribution. */}
              {isBon ? <td className="px-2 py-1" /> : null}
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
            {/* Le total servi se calcule à la main, une fois les cases
                remplies : l'imprimer à 0 serait faux. */}
            {isBon ? <td className="px-2 py-1.5" /> : null}
          </tr>
        </tfoot>
      </table>

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
