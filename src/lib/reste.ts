/**
 * Ce qu'il reste à servir sur une ligne.
 *
 * Partagé par le serveur (la garde du servi complémentaire) et l'API (la
 * colonne « Reste ») : une seule règle, sinon l'écran proposerait de servir
 * ce que le serveur refuse.
 */

type DecimalLike = number | string | { toString(): string } | null | undefined

const n = (v: DecimalLike): number => (v === null || v === undefined ? 0 : Number(v))

export type LigneReste = {
  quantityAsked: DecimalLike
  quantityServed: DecimalLike
  refills?: { quantity: DecimalLike }[]
}

/**
 * Commandé, moins tout ce qui est sorti — premier servi et compléments
 * confondus. C'est la règle « on ne sert jamais plus que commandé ».
 */
export function resteAServir(l: LigneReste): number {
  const sorti = n(l.quantityServed) + (l.refills ?? []).reduce((s, r) => s + n(r.quantity), 0)
  return Math.max(n(l.quantityAsked) - sorti, 0)
}
