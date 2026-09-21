/**
 * Ce qu'il reste à servir sur une ligne, et ce qui manque au rayon.
 *
 * Partagé par le serveur (la garde du servi complémentaire) et l'API (les
 * colonnes « Reste » et « Manquant ») : une seule règle, sinon l'écran
 * proposerait de servir ce que le serveur refuse.
 */

type DecimalLike = number | string | { toString(): string } | null | undefined

const n = (v: DecimalLike): number => (v === null || v === undefined ? 0 : Number(v))

export type LigneReste = {
  quantityAsked: DecimalLike
  quantityServed: DecimalLike
  /** Compté par le département à la réception ; nul tant qu'il n'a pas signé. */
  quantityReceived: DecimalLike
  refills?: { quantity: DecimalLike; refill?: { receivedAt?: Date | string | null } | null }[]
}

function complements(l: LigneReste) {
  let recus = 0
  let enRoute = 0
  for (const r of l.refills ?? []) {
    if (r.refill?.receivedAt) recus += n(r.quantity)
    else enRoute += n(r.quantity)
  }
  return { recus, enRoute, tous: recus + enRoute }
}

/**
 * Le reste selon les registres du magasin : commandé, moins tout ce qui est
 * sorti, premier servi et compléments confondus. C'est la règle « on ne sert
 * jamais plus que commandé ».
 */
export function resteRegistre(l: LigneReste): number {
  return Math.max(n(l.quantityAsked) - n(l.quantityServed) - complements(l).tous, 0)
}

/**
 * Le reste réel : ce qu'il faut encore servir pour que le rayon atteigne sa
 * commande.
 *
 * Tant que le département n'a pas compté, c'est le reste des registres. Une
 * fois qu'il a signé, on part de ce qu'il a réellement reçu — le compté, qui
 * intègre déjà les compléments signés — plus ce qui est en route. Deux litres
 * partis du magasin mais jamais arrivés au bar restent dus : la commande
 * n'est servie que quand le rayon les a.
 */
export function resteAServir(l: LigneReste): number {
  if (l.quantityReceived === null || l.quantityReceived === undefined) return resteRegistre(l)
  return Math.max(n(l.quantityAsked) - n(l.quantityReceived) - complements(l).enRoute, 0)
}

/**
 * Ce qui manque au rayon par rapport aux registres : la part du reste réel
 * que le magasin croit déjà servie. Nul tant que rien n'a été compté, et
 * retombe à zéro dès qu'un servi de remplacement est parti.
 */
export function manquant(l: LigneReste): number {
  return Math.max(resteAServir(l) - resteRegistre(l), 0)
}
