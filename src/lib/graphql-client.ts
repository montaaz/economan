/**
 * Client GraphQL navigateur : POST vers /api/graphql.
 *
 * Une action (mutation) annonce son travail : la barre du haut de l'écran
 * s'allume si elle dépasse un instant — un bouton n'a jamais l'air mort.
 * Une requête bloquée s'arrête au bout de 30 s avec un message clair, et un
 * serveur injoignable ou en redémarrage se dit en français, pas en erreur
 * technique.
 */
const DELAI_MS = 30_000

export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const action = /^\s*mutation\b/.test(query)
  const annonce = action && typeof window !== 'undefined'
  if (annonce) window.dispatchEvent(new CustomEvent('economan:activite', { detail: 1 }))
  const arret = new AbortController()
  const minuteur = setTimeout(() => arret.abort(), DELAI_MS)
  try {
    let res: Response
    try {
      res = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: arret.signal,
      })
    } catch (e) {
      if (arret.signal.aborted) throw new Error('Le serveur ne répond pas : réessayez dans un instant.')
      throw new Error(e instanceof TypeError ? 'Connexion au serveur perdue : vérifiez le réseau et réessayez.' : 'Requête impossible.')
    }
    let json: { data?: T; errors?: { message: string }[] }
    try { json = await res.json() } catch {
      // Une page d'erreur du serveur web (redémarrage, 502) au lieu de la réponse.
      throw new Error(res.status >= 500 ? 'Le serveur redémarre : réessayez dans quelques secondes.' : `Réponse illisible du serveur (${res.status}).`)
    }
    if (json.errors?.length) throw new Error(json.errors[0].message)
    return json.data as T
  } finally {
    clearTimeout(minuteur)
    if (annonce) window.dispatchEvent(new CustomEvent('economan:activite', { detail: -1 }))
  }
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Une erreur est survenue.'
}
