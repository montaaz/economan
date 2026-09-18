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
 * Forme papier correspondant à l'état d'une commande.
 *
 * Centralisé ici : les trois écrans qui impriment doivent nommer la feuille
 * de la même façon, sinon l'économat émettrait un « bon de livraison » que
 * l'employé verrait comme un « bon de commande ».
 */
export function ticketVariant(
  status: 'PENDING' | 'ACCEPTED' | 'DELIVERED' | 'RECEIVED' | 'CANCELLED',
): 'ticket' | 'commande' | 'livraison' {
  if (status === 'PENDING') return 'ticket'
  // La livraison n'existe qu'une fois le bon émis ; avant, c'est encore une
  // commande à préparer.
  return status === 'ACCEPTED' ? 'commande' : 'livraison'
}

/**
 * Rendu papier d'une commande, sous trois formes.
 *
 * - `ticket` : la demande brute, avant prise en charge.
 * - `commande` : le bon de préparation, une fois la commande acceptée. La
 *   colonne « servi » est vide, à remplir au stylo pendant la distribution.
 * - `livraison` : le bon signé, émis une fois la distribution terminée.
 *
 * Le titre suit l'état réel : appeler « bon de livraison » une feuille dont
 * rien n'est encore sorti ferait signer une livraison qui n'a pas eu lieu.
 */
export function Ticket({
  order, variant = 'ticket',
}: {
  order: TicketOrder
  variant?: 'ticket' | 'commande' | 'livraison'
}) {
  const isBon = variant !== 'ticket'
  const lines = isBon ? order.lines.filter((l) => l.status !== 'REJECTED') : order.lines
  const rejected = order.lines.filter((l) => l.status === 'REJECTED')

  return (
    <div className="print-page bg-white p-5 text-[#0f1e33]">
      <header className="mb-4 flex items-start justify-between gap-4 border-b-2 border-[#0f1e33] pb-3">
        <div>
          <p className="text-[1.25rem] font-bold leading-tight tracking-tight">
            {variant === 'livraison'
              ? 'Bon de livraison'
              : variant === 'commande'
                ? 'Bon de commande'
                : 'Ticket de commande'}
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

      {/* Département puis heure de la commande : les deux repères qu'on
          cherche en prenant une feuille dans une pile. Le code entre
          parenthèses n'apportait rien que le nom ne dise déjà. */}
      <div className="mb-4 text-center">
        <p className="text-[1.8rem] font-bold uppercase leading-none tracking-wide">
          {order.department.name}
        </p>
        <p className="mt-1 text-[1.15rem] font-semibold tabular-nums">
          {formatTime(order.createdAt)}
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 text-[0.85rem]">
        <p>
          <span className="font-semibold">Demandeur :</span> {order.createdBy.fullName}
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
              {/* La référence catalogue n'aide pas à sortir la marchandise :
                  le nom suffit, et la ligne reste lisible en rayon. */}
              <td className="px-2 py-1 font-medium">{l.productName}</td>
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
