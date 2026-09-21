import * as React from 'react'
import { cn, formatLongDate, formatQty, formatTime } from '@/lib/utils'

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
    /** La cible du rayon, figée à l'envoi de la commande. */
    stockFixe: number
    quantityAsked: number
    /** Ce qui est sorti au premier service. */
    firstServed: number
    /** Ce qui sort à ce passage ; nul sur une feuille à remplir. */
    quantity: number | null
    /** Ce qui manquera encore après ce passage. */
    remaining: number
    /** Le ticket dont vient la ligne : un bon réunit plusieurs commandes. */
    orderRef?: string
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
export function RefillTicketSheet({
  refill, blank,
}: {
  refill: RefillTicket
  /** Feuille de tournée : la colonne du service reste vide pour le stylo. */
  blank?: boolean
}) {
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
            {blank ? 'Feuille de service' : 'Bon de livraison'} —{' '}
            {RANGS[refill.rank] ?? `${refill.rank}ᵉ`} service
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
        {/* Un bon peut réunir plusieurs tickets du même rayon. */}
        {blank ? (
          <>
            À servir sur {o.reference.includes('·') ? 'les commandes' : 'la commande'}{' '}
            <span className="font-mono font-semibold">{o.reference}</span> — notez ce qui sort
            dans la colonne de droite, puis saisissez-le à l’écran.
          </>
        ) : (
          <>
            Complément {o.reference.includes('·') ? 'des commandes' : 'de la commande'}{' '}
            <span className="font-mono font-semibold">{o.reference}</span> — seuls les articles
            ci-dessous sortent à ce passage.
          </>
        )}
      </p>

      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr className="border-y border-[#0f1e33] bg-[#f0f4fa]">
            <th className="w-8 px-2 py-1.5 text-right font-semibold">#</th>
            <th className="px-2 py-1.5 text-left font-semibold">
              Article <span className="font-normal">({lines.length})</span>
            </th>
            {/* Toute la chaîne : ce que le rayon vise, ce qui a été demandé,
                ce qui est déjà sorti, ce qui sort ici, ce qui manquera. */}
            <th className="w-16 px-2 py-1.5 text-right font-semibold">Fixe</th>
            <th className="w-20 px-2 py-1.5 text-right font-semibold">Commande</th>
            <th className="w-20 px-2 py-1.5 text-right font-semibold">1ᵉʳ servi</th>
            <th className="w-24 px-2 py-1.5 text-right font-semibold">
              {RANGS[refill.rank] ?? `${refill.rank}ᵉ`} service
            </th>
            <th className="w-20 px-2 py-1.5 text-right font-semibold">Reste</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            // Ce qu'il fallait pour solder la ligne à ce passage. Si ce qui
            // sort est en deçà, le rayon repart incomplet : c'est le même
            // écart que sur un bon de livraison, et il porte la même marque.
            const du = l.quantityAsked - l.firstServed
            const ecart = l.quantity === null ? 0 : l.quantity - du
            return (
            <React.Fragment key={`${l.productRef}-${i}`}>
              {i === 0 || lines[i - 1].categoryName !== l.categoryName ? (
                <tr>
                  <td
                    colSpan={7}
                    className="border-y border-[#b9c8e0] bg-[#e8eefa] px-2 py-1 text-[0.76rem] font-bold uppercase tracking-[0.06em]"
                  >
                    {l.categoryName}
                    <span className="ml-1.5 font-semibold opacity-70">
                      ({lines.filter((x) => x.categoryName === l.categoryName).length})
                    </span>
                  </td>
                </tr>
              ) : null}
              <tr
                className={cn(
                  'border-b border-[#dbe3ef]',
                  // Une ligne qui ne se solde pas à ce passage se signale,
                  // comme sur le bon de commande : sans marque, un bon servi à
                  // moitié se relit comme conforme.
                  ecart !== 0 && 'bg-[#fdf1e3]',
                )}
              >
                <td className="px-2 py-1 text-right tabular-nums text-[#4a5f7d]">{i + 1}</td>
                <td className="px-2 py-1 font-medium">
                  {l.productName}
                  {/* Plusieurs commandes sur un même bon : sans sa référence,
                      une ligne ne dirait pas de laquelle elle vient. Sur sa
                      propre ligne, sans quoi elle coupait le nom en deux. */}
                  {l.orderRef ? (
                    <span className="block font-mono text-[0.68rem] font-normal text-[#4a5f7d]">
                      {l.orderRef}
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-1 text-right tabular-nums text-[#4a5f7d]">
                  {formatQty(l.stockFixe)}
                </td>
                <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                  {formatQty(l.quantityAsked)}
                  <span className="ml-1 text-[0.72rem] text-[#4a5f7d]">{l.unitSymbol}</span>
                </td>
                <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-[#4a5f7d]">
                  {formatQty(l.firstServed)}
                </td>
                {/* Sur une feuille de tournée, la case reste vide : c'est au
                    stylo qu'on y note ce qui sort du magasin. */}
                <td className="whitespace-nowrap border-x border-[#b9c8e0] px-2 py-1 text-right font-bold tabular-nums">
                  {l.quantity === null ? (
                    <span className="text-[#4a5f7d]">{l.unitSymbol}</span>
                  ) : (
                    <>
                      {/* Le symbole seul, comme sur le bon de commande :
                          accoler l'écart à la quantité mettrait deux nombres
                          côte à côte et on ne saurait plus lequel est sorti. */}
                      {ecart !== 0 ? (
                        <span className="mr-1.5 font-bold text-[#b4630f]">
                          {ecart < 0 ? '▼' : '▲'}
                        </span>
                      ) : null}
                      {formatQty(l.quantity)}
                      <span className="ml-1 text-[0.72rem] font-normal text-[#4a5f7d]">
                        {l.unitSymbol}
                      </span>
                    </>
                  )}
                </td>
                {/* Ce qui manquera encore : le département saura s'il doit
                    attendre un passage de plus. */}
                <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                  {l.remaining > 0 ? (
                    <span className="font-semibold text-[#b4630f]">
                      {formatQty(l.remaining)}
                    </span>
                  ) : (
                    <span className="text-[#4a5f7d]">—</span>
                  )}
                </td>
              </tr>
            </React.Fragment>
            )
          })}
        </tbody>
      </table>

      {/* Légende : le signe seul ne suffit pas à qui reçoit le bon sans
          explication. Affichée uniquement s'il y a un écart à lire, et jamais
          sur une feuille à remplir où rien n'est encore sorti. */}
      {!blank && lines.some((l) => (l.quantity ?? 0) !== l.quantityAsked - l.firstServed) ? (
        <p className="mt-3 text-[0.76rem] text-[#4a5f7d]">
          <span className="font-bold text-[#b4630f]">▼</span> servi en moins qu’il ne restait ·{' '}
          <span className="font-bold text-[#b4630f]">▲</span> servi en plus
        </p>
      ) : null}

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
