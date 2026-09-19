import * as React from 'react'
import { cn, formatLongDate, formatQty, formatTime } from '@/lib/utils'

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
  // Seul le bon de livraison connaît ce qui est réellement sorti.
  const livre = variant === 'livraison'
  // Les ruptures gardent leur place. Les sortir du tableau obligeait à
  // chercher un article en bas de page pour comprendre pourquoi il manquait,
  // et la numérotation ne correspondait plus à la feuille de l'employé.
  const retenues = order.lines

  // Les lignes d'une commande sont figées à l'envoi : celles passées avant que
  // les feuilles soient regroupées gardent leurs familles éparpillées. On les
  // rassemble ici, sans toucher au ticket enregistré, en conservant l'ordre
  // d'apparition de chaque famille et celui des articles à l'intérieur.
  const ordreFamilles: string[] = []
  for (const l of retenues) {
    if (!ordreFamilles.includes(l.categoryName)) ordreFamilles.push(l.categoryName)
  }
  const lines = ordreFamilles.flatMap((c) => retenues.filter((l) => l.categoryName === c))
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
            {/* Même intitulé que l'écran de l'économat : la feuille papier et
                la feuille à l'écran doivent nommer la même colonne pareil. */}
            <th className="w-24 px-2 py-1.5 text-right font-semibold">Commande</th>
            {isBon ? <th className="w-24 px-2 py-1.5 text-right font-semibold">Servi</th> : null}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            // Un bandeau ouvre chaque famille : on sort la marchandise rayon
            // par rayon, pas article par article dans le désordre.
            const ouvre = i === 0 || lines[i - 1].categoryName !== l.categoryName

            // Écart entre ce qui est sorti et ce qui était commandé. Nul sur un
            // bon de commande : rien n'est encore servi.
            const ecart = livre && l.status !== 'REJECTED'
              ? (l.quantityServed ?? 0) - l.quantityAsked
              : 0
            return (
              <React.Fragment key={l.id}>
                {ouvre ? (
                  <tr>
                    <td
                      colSpan={livre ? 5 : 4}
                      className="border-y border-[#b9c8e0] bg-[#e8eefa] px-2 py-1 text-[0.76rem] font-bold uppercase tracking-[0.06em]"
                    >
                      {l.categoryName}
                    </td>
                  </tr>
                ) : null}
                <tr
                  className={cn(
                    'border-b border-[#d5dfee]',
                    // Une rupture doit sauter aux yeux sur le papier comme à
                    // l'écran : c'est l'information qu'on cherche en relisant.
                    l.status === 'REJECTED' && 'bg-[#fdeaee]',
                    // Une quantité différente de la commande se signale aussi :
                    // sans marque, un bon servi à moitié se relit comme conforme.
                    ecart !== 0 && 'bg-[#fdf1e3]',
                  )}
                >
                  {/* La numérotation reste continue à travers les bandeaux :
                      c'est elle qui sert à pointer une ligne à voix haute. */}
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
                  {/* Sur un bon de livraison, la quantité sortie est connue :
                      on l'imprime. Sur un bon de commande elle reste à écrire
                      au stylo pendant la distribution. */}
                  {isBon ? (
                    <td className="whitespace-nowrap px-2 py-1 text-right font-semibold tabular-nums">
                      {l.status === 'REJECTED' ? (
                        <span className="font-semibold text-[#d63f5a]">Rupture</span>
                      ) : livre ? (
                        <>
                          {/* Le sens de l'écart d'abord : « ▼ » se voit avant
                              qu'on ait comparé deux nombres de colonne à
                              colonne. */}
                          {ecart !== 0 ? (
                            <span className="mr-1 font-bold text-[#b4630f]">
                              {ecart < 0 ? '▼' : '▲'} {ecart > 0 ? '+' : '−'}
                              {formatQty(Math.abs(ecart))}
                            </span>
                          ) : null}
                          {formatQty(l.quantityServed ?? 0)}
                          <span className="ml-1 text-[0.72rem] font-normal text-[#4a5f7d]">
                            {l.unitSymbol}
                          </span>
                        </>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              </React.Fragment>
            )
          })}
        </tbody>
      </table>

      {/* Légende : le signe seul ne suffit pas à qui reçoit le bon sans
          explication. Affichée uniquement s'il y a un écart à lire. */}
      {livre && lines.some((l) => l.status !== 'REJECTED'
        && (l.quantityServed ?? 0) !== l.quantityAsked) ? (
        <p className="mt-3 text-[0.76rem] text-[#4a5f7d]">
          <span className="font-bold text-[#b4630f]">▼</span> servi en moins que commandé ·{' '}
          <span className="font-bold text-[#b4630f]">▲</span> servi en plus
        </p>
      ) : null}

      {/* Les motifs de rupture, lorsqu'ils ont été saisis. La ligne du tableau
          dit qu'il y a rupture ; ce rappel dit pourquoi, sans alourdir chaque
          ligne d'une colonne de texte. */}
      {isBon && rejected.some((l) => l.rejectReason) ? (
        <p className="mt-3 text-[0.76rem] text-[#4a5f7d]">
          <span className="font-semibold text-[#d63f5a]">Ruptures :</span>{' '}
          {rejected
            .filter((l) => l.rejectReason)
            .map((l) => `${l.productName} (${l.rejectReason})`)
            .join(' · ')}
        </p>
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
