/**
 * Recherche d'article, la même partout.
 *
 * Sans accents ni casse : « pate » trouve « PÂTE NOISETTE », « 0231 » trouve
 * la référence. Chaque tableau du projet filtre avec cette règle-ci, pour
 * qu'une recherche qui marche sur un écran marche sur tous.
 */
export function normaliser(v: string): string {
  return v.replace(/œ/g, 'oe').replace(/Œ/g, 'OE').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Vrai si la requête (déjà normalisée) apparaît dans l'un des champs. */
export function correspond(requete: string, ...champs: (string | null | undefined)[]): boolean {
  if (requete === '') return true
  return champs.some((c) => c && normaliser(c).includes(requete))
}
