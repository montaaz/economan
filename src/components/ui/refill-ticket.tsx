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
    /** Numéro de la ligne sur son ticket : le même qu'à l'écran. */
    rang?: number
    /**
     * Le détail par passage, quand le bon en couvre plusieurs.
     *
     * Un bon émis après deux passages doit dire lequel a sorti quoi : « 1 kg
     * au 2ᵉ, rien au 3ᵉ » ne se lit pas dans un total. Absent sur un bon à
     * un seul rang, qui garde sa colonne unique.
     */
    parRang?: Record<number, number>
    /** Ce que les passages d'avant ce bon ont déjà sorti, rang par rang. */
    precedents?: Record<number, number>
  }[]
  /**
   * Les passages antérieurs à ce bon qui ont sorti quelque chose : une
   * colonne chacun, grise comme le 1ᵉʳ servi. Le porteur du 3ᵉ servi lit
   * ainsi ce que le 2ᵉ a déjà apporté, et le reste s'explique.
   */
  previousRanks?: number[]
  /**
   * Les rangs couverts par ce bon, dans l'ordre.
   *
   * Un seul rang : le bon garde sa colonne unique. Plusieurs : une colonne
   * par passage, et le titre les nomme tous.
   */
  ranks?: number[]
}


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
  // L'ordre arrive déjà fait : le regrouper ici par famille fusionnerait les
  // blocs qu'un appelant a pu construire — une famille présente à la fois en
  // ajustées et en ruptures verrait toutes ses lignes remontées dans le
  // premier bloc, et le papier ne suivrait plus l'écran.
  const lines = refill.lines
  // Les rangs couverts : celui du passage par défaut, plusieurs quand le bon
  // rattrape des servis enregistrés mais pas encore imprimés.
  const rangs = refill.ranks?.length ? refill.ranks : [refill.rank]
  const multi = rangs.length > 1
  // Le même libellé que l'écran : « 2ᵉ servi », jamais « deuxième ».
  const nommer = (r: number) => `${r}ᵉ`
  // « 2ᵉ et 3ᵉ servi » plutôt que deux titres : c'est un seul papier.
  const titreRangs = multi
    ? `${rangs.slice(0, -1).map((r) => `${r}ᵉ`).join(', ')} et ${rangs[rangs.length - 1]}ᵉ servi`
    : `${nommer(refill.rank)} servi`
  const anterieurs = refill.previousRanks ?? []
  const colonnes = 7 + (multi ? rangs.length - 1 : 0) + anterieurs.length

  return (
    <div className="mx-auto max-w-[190mm] bg-white px-6 py-4 text-[0.86rem] text-[#0f1e33]">
      <header className="flex items-start justify-between gap-4 border-b-2 border-[#0f1e33] pb-2">
        <div>
          <h1 className="text-[1.3rem] font-bold leading-tight">
            {blank ? 'Feuille de servi' : 'Bon de livraison'} — {titreRangs}
          </h1>
          <p className="font-mono text-[0.9rem] font-semibold">{o.reference}</p>
        </div>
        <div className="text-right">
          <p className="text-[1.5rem] font-bold leading-none">N°{o.ticketNumber}</p>
          <p className="text-[0.8rem] capitalize">{formatLongDate(o.businessDay)}</p>
        </div>
      </header>

      {/* Le rayon et l'heure tenaient sur deux lignes centrées, hautes de
          trois centimètres à elles seules. Sur une feuille qu'on remplit
          debout au magasin, cette place revient au tableau. */}
      <p className="mt-2 flex items-baseline justify-center gap-3">
        <span className="text-[1.3rem] font-bold uppercase tracking-tight">
          {o.department.name}
        </span>
        <span className="text-[0.95rem] font-bold tabular-nums">
          {formatTime(refill.createdAt)}
        </span>
      </p>

      <p className="mt-1.5 flex flex-wrap justify-between gap-x-6 text-[0.82rem]">
        <span><span className="font-semibold">Demandeur :</span> {o.createdBy.fullName}</span>
        {refill.createdBy ? (
          <span><span className="font-semibold">Servi par :</span> {refill.createdBy.fullName}</span>
        ) : null}
      </p>

      {/* Le bandeau qui rappelait les commandes a disparu : le titre dit déjà
          quel service c'est, et les références sont juste sous lui. Il
          repoussait le tableau d'un tiers de page. */}
      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr className="border-y border-[#0f1e33] bg-[#f0f4fa]">
            <th className="w-8 px-2 py-1.5 text-right font-semibold">#</th>
            {/* L'article garde sa place : ce sont les colonnes de chiffres
                qui se serrent, pas les noms qui se cassent sur trois lignes. */}
            <th className="min-w-[9rem] px-2 py-1.5 text-left font-semibold">
              Article <span className="font-normal">({lines.length})</span>
            </th>
            {/* Toute la chaîne : ce que le rayon vise, ce qui a été demandé,
                ce qui est déjà sorti, ce qui sort ici, ce qui manquera. */}
            <th className="w-12 px-2 py-1.5 text-right font-semibold">Fixe</th>
            <th className="w-16 px-2 py-1.5 text-right font-semibold">Commande</th>
            <th className="w-14 whitespace-nowrap px-2 py-1.5 text-right font-semibold">1ᵉʳ servi</th>
            {anterieurs.map((r) => (
              <th key={`p${r}`} className="w-14 whitespace-nowrap px-2 py-1.5 text-right font-semibold">{r}ᵉ servi</th>
            ))}
            {/* Une colonne par passage couvert : le porteur doit savoir ce
                que chacun a sorti, pas seulement le cumul. */}
            {multi ? rangs.map((r) => (
              <th key={r} className="w-16 whitespace-nowrap px-2 py-1.5 text-right font-semibold">
                {r}ᵉ servi
              </th>
            )) : (
              <th className="w-20 whitespace-nowrap px-2 py-1.5 text-right font-semibold">
                {nommer(refill.rank)} servi
              </th>
            )}
            <th className="w-14 px-2 py-1.5 text-right font-semibold">Reste</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            // Ce qu'il fallait pour solder la ligne à ce passage. Si ce qui
            // sort est en deçà, le rayon repart incomplet : c'est le même
            // écart que sur un bon de livraison, et il porte la même marque.
            const du = l.quantityAsked - l.firstServed
            const ecart = l.quantity === null ? 0 : l.quantity - du

            // Le bandeau compte son propre groupe, pas toutes les lignes de
            // la famille : une même famille peut ouvrir deux blocs — ajustées
            // puis ruptures — et chacun doit annoncer ce qu'il contient.
            const ouvre = i === 0 || lines[i - 1].categoryName !== l.categoryName
            let groupe = 0
            if (ouvre) {
              while (i + groupe < lines.length
                && lines[i + groupe].categoryName === l.categoryName) groupe++
            }
            return (
            <React.Fragment key={`${l.productRef}-${i}`}>
              {ouvre ? (
                <tr>
                  <td
                    colSpan={colonnes}
                    className="border-y border-[#b9c8e0] bg-[#e8eefa] px-2 py-1 text-[0.76rem] font-bold uppercase tracking-[0.06em]"
                  >
                    {l.categoryName}
                    <span className="ml-1.5 font-semibold opacity-70">
                      ({groupe})
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
                <td className="px-2 py-0.5 text-right tabular-nums text-[#4a5f7d]">{l.rang ?? i + 1}</td>
                <td className="px-2 py-0.5 font-medium">
                  {l.productName}
                  {/* Plusieurs commandes sur un même bon : sans sa référence,
                      une ligne ne dirait pas de laquelle elle vient. Sur sa
                      propre ligne, sans quoi elle coupait le nom en deux. */}
                  {l.orderRef ? (
                    <span className="block whitespace-nowrap font-mono text-[0.66rem] font-normal leading-tight text-[#4a5f7d]">
                      {l.orderRef}
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-0.5 text-right tabular-nums text-[#4a5f7d]">
                  {formatQty(l.stockFixe)}
                </td>
                <td className="whitespace-nowrap px-2 py-0.5 text-right tabular-nums">
                  {formatQty(l.quantityAsked)}
                  <span className="ml-1 text-[0.72rem] text-[#4a5f7d]">{l.unitSymbol}</span>
                </td>
                <td className="whitespace-nowrap px-2 py-0.5 text-right tabular-nums text-[#4a5f7d]">
                  {formatQty(l.firstServed)}
                </td>
                {anterieurs.map((r) => {
                  const q = l.precedents?.[r] ?? 0
                  return (
                    <td key={`p${r}`} className="whitespace-nowrap px-2 py-0.5 text-right tabular-nums text-[#4a5f7d]">
                      {q > 0 ? formatQty(q) : '—'}
                    </td>
                  )
                })}
                {/* Plusieurs passages sur un même bon : chacun sa colonne,
                    et un tiret là où le passage n'a rien sorti pour la
                    ligne. Un total les réunirait sans dire lequel a servi. */}
                {multi ? rangs.map((r, k) => {
                  const q = l.parRang?.[r] ?? 0
                  // Ce qu'il restait à servir avant ce passage : la commande,
                  // moins le premier servi, moins les passages d'avant le bon,
                  // moins les colonnes précédentes du bon. La marque dit si ce
                  // passage a soldé la ligne ou l'a laissée incomplète — la
                  // même flèche que sur un bon à un seul passage.
                  const avant = anterieurs.reduce((n, a) => n + (l.precedents?.[a] ?? 0), 0)
                    + rangs.slice(0, k).reduce((n, x) => n + (l.parRang?.[x] ?? 0), 0)
                  const duIci = l.quantityAsked - l.firstServed - avant
                  const ecartIci = q > 0 ? q - duIci : 0
                  return (
                    <td
                      key={r}
                      className="whitespace-nowrap border-x border-[#b9c8e0] px-2 py-0.5 text-right font-bold tabular-nums"
                    >
                      {q > 0 ? (
                        <>
                          {ecartIci !== 0 ? (
                            <span className="mr-1 font-bold text-[#b4630f]">
                              {ecartIci < 0 ? '▼' : '▲'}
                            </span>
                          ) : null}
                          {formatQty(q)}
                          <span className="ml-1 text-[0.72rem] font-normal text-[#4a5f7d]">
                            {l.unitSymbol}
                          </span>
                        </>
                      ) : (
                        <span className="font-normal text-[#4a5f7d]">—</span>
                      )}
                    </td>
                  )
                }) : (
                  /* Sur une feuille de tournée, la case reste vide : c'est au
                     stylo qu'on y note ce qui sort du magasin. */
                  <td className="whitespace-nowrap border-x border-[#b9c8e0] px-2 py-0.5 text-right font-bold tabular-nums">
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
                )}
                {/* Ce qui manquera encore : le département saura s'il doit
                    attendre un passage de plus. */}
                <td className="whitespace-nowrap px-2 py-0.5 text-right tabular-nums">
                  {l.remaining > 0 ? (
                    <span className="font-semibold text-[#b4630f]">
                      {formatQty(l.remaining)}
                    </span>
                  ) : blank ? (
                    // Sur une feuille à remplir, rien n'est encore sorti : une
                    // coche annoncerait un solde qui n'a pas eu lieu.
                    <span className="text-[#4a5f7d]">—</span>
                  ) : (
                    // Soldé : un tiret ne disait pas si la ligne était close ou
                    // si l'information manquait. La coche le dit.
                    <span className="font-bold text-[#1a7f4f]">✔</span>
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

      <div className="mt-6 flex justify-between gap-8 text-[0.82rem]">
        <div className="flex-1">
          <p className="font-semibold">Économat</p>
          <p className="mt-6 border-t border-[#0f1e33] pt-1">Signature</p>
        </div>
        <div className="flex-1">
          <p className="font-semibold">Réception — {o.department.name}</p>
          <p className="mt-6 border-t border-[#0f1e33] pt-1">Signature</p>
        </div>
      </div>
    </div>
  )
}
