/**
 * Les unités dans lesquelles un article peut s'entrer au stock.
 *
 * Le stock compte dans l'unité de base de l'article (kg, L, u…) ; la
 * facture, elle, parle parfois en grammes ou en centilitres. On laisse
 * choisir l'unité de saisie parmi celles qui se convertissent sans
 * ambiguïté, et on ramène la quantité à l'unité de base avant d'écrire.
 */
const FAMILLES: string[][] = [
  ['kg', 'g'],
  ['L', 'cl', 'ml'],
]
const EN_BASE: Record<string, number> = { kg: 1000, g: 1, L: 1000, cl: 10, ml: 1 }

/** Les unités proposées pour un article, la sienne en premier. */
export function unitesCompatibles(base: string): string[] {
  const famille = FAMILLES.find((f) => f.some((u) => u.toLowerCase() === base.toLowerCase()))
  if (!famille) return [base]
  return [base, ...famille.filter((u) => u.toLowerCase() !== base.toLowerCase())]
}

/** Une quantité saisie dans `unite`, ramenée à l'unité `base` de l'article. Nulle si incompatible. */
export function versBase(quantite: number, unite: string, base: string): number | null {
  if (unite.toLowerCase() === base.toLowerCase()) return quantite
  const a = EN_BASE[unite], b = EN_BASE[base]
  if (a === undefined || b === undefined) return null
  const famille = FAMILLES.find((f) => f.includes(unite))
  if (!famille || !famille.includes(base)) return null
  return (quantite * a) / b
}
