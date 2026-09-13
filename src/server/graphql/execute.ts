import 'server-only'
import { execute, parse, validate } from 'graphql'
import { schema, type Ctx } from './schema'
import { readSession } from '@/server/auth/session'

/**
 * Exécute une requête GraphQL en process, pour les Server Components : mêmes
 * resolvers et mêmes gardes que l'endpoint HTTP, sans aller-retour réseau.
 */
export async function executeGraphQL<T>(
  source: string,
  variableValues?: Record<string, unknown>,
): Promise<T> {
  const document = parse(source)
  const errors = validate(schema, document)
  if (errors.length) throw new Error(errors.map((e) => e.message).join('\n'))

  const contextValue: Ctx = { user: await readSession() }
  const result = await execute({ schema, document, variableValues, contextValue })

  if (result.errors?.length) throw new Error(result.errors[0].message)
  // Les Decimal/Date traversent la frontière serveur→client : on repasse par
  // JSON pour n'envoyer que des valeurs sérialisables.
  return JSON.parse(JSON.stringify(result.data)) as T
}
