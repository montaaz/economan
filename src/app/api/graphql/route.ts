import { createYoga } from 'graphql-yoga'
import { schema, type Ctx } from '@/server/graphql/schema'
import { readSession } from '@/server/auth/session'

const yoga = createYoga<Ctx>({
  schema,
  graphqlEndpoint: '/api/graphql',
  fetchAPI: { Response },
  context: async () => ({ user: await readSession() }),
  // L'IDE n'a pas sa place en production.
  graphiql: process.env.NODE_ENV === 'development',
})

// Le schéma se charge avec ce module : une erreur de schéma se corrige dans
// `schema.ts`, et la route se recharge avec lui.
// Yoga attend son propre contexte en 2e argument ; les handlers de route Next
// reçoivent `{ params }`. On n'expose que la requête, le contexte est bâti
// par la fabrique ci-dessus.
const handler = (request: Request) => yoga.handleRequest(request, {} as Ctx)

export { handler as GET, handler as POST, handler as OPTIONS }
