/** Client GraphQL navigateur : POST vers /api/graphql. */
export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json.data as T
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Une erreur est survenue.'
}
