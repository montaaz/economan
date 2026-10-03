/**
 * Les unités dans lesquelles un article peut s'entrer au stock.
 *
 * Le stock compte dans l'unité de base de l'article (kg, L, u…) ; la
 * facture, elle, parle parfois en grammes ou en centilitres. On laisse
 * choisir l'unité de saisie parmi celles qui se convertissent sans
 * ambiguïté, et on ramène la quantité à l'unité de base avant d'écrire.
 */
const FAMILLES: string[][] = [
  ['kg', 'gr'],
  ['L', 'cl', 'ml'],
]
const EN_BASE: Record<string, number> = { kg: 1000, gr: 1, l: 1000, cl: 10, ml: 1 }

/**
 * Le symbole tel que les tables le connaissent : en minuscules, et « g »
 * ramené à « gr ». Le gramme s'écrit « gr » à l'écran ; l'ancien « g » des
 * fiches et des saisies reste compris.
 */
function cle(unite: string): string {
  const u = unite.trim().toLowerCase()
  return u === 'g' ? 'gr' : u
}

/** Les unités proposées pour un article, la sienne en premier. */
export function unitesCompatibles(base: string): string[] {
  const famille = FAMILLES.find((f) => f.some((u) => cle(u) === cle(base)))
  if (!famille) return [base]
  return [base, ...famille.filter((u) => cle(u) !== cle(base))]
}

/** Une unité se convertit-elle vers l'unité `base` de l'article ? */
export function convertible(unite: string, base: string): boolean {
  return versBase(1, unite, base) !== null
}

/** Une quantité saisie dans `unite`, ramenée à l'unité `base` de l'article. Nulle si incompatible. */
export function versBase(quantite: number, unite: string, base: string): number | null {
  const u = cle(unite), b = cle(base)
  if (u === b) return quantite
  const x = EN_BASE[u], y = EN_BASE[b]
  if (x === undefined || y === undefined) return null
  const famille = FAMILLES.find((f) => f.some((v) => cle(v) === u))
  if (!famille || !famille.some((v) => cle(v) === b)) return null
  return (quantite * x) / y
}
