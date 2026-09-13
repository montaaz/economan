import 'server-only'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

// Un pool unique par processus, y compris en production : en développement Next
// recharge les modules à chaque édition, et sur une plateforme serverless une
// lambda tiède réévalue ce module — sans ce cache on ouvrirait un pool de plus
// à chaque fois, jusqu'à épuiser les connexions Postgres.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

/**
 * Taille du pool, par instance.
 *
 * En serverless, chaque lambda a son propre pool et il peut y en avoir des
 * dizaines en parallèle : un pool large par instance épuise la limite du
 * serveur (100 connexions par défaut). Un serveur unique de longue durée, lui,
 * a tout intérêt à un pool généreux.
 * Réglable via DATABASE_POOL_MAX, notamment derrière un pooler (PgBouncer,
 * Supabase, Neon) où la limite réelle est celle du pooler.
 */
function poolSize(): number {
  const fromEnv = Number(process.env.DATABASE_POOL_MAX)
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv
  // Vercel, AWS Lambda et consorts exposent ces variables.
  const serverless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
  return serverless ? 3 : 20
}

function create(): PrismaClient {
  const adapter = new PrismaPg({
    // La connexion n'est pas ouverte ici : l'adaptateur la crée à la première
    // requête. Une URL absente au build ne fait donc rien échouer — l'erreur
    // survient à l'exécution, là où elle est lisible.
    connectionString: process.env.DATABASE_URL ?? '',
    max: poolSize(),
    idleTimeoutMillis: 30_000,
    // Une lambda gelée pendant une requête laisse une connexion pendante :
    // ce délai évite qu'elle bloque le pool indéfiniment.
    connectionTimeoutMillis: 10_000,
  })

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

/**
 * Le client est construit à la première utilisation, pas à l'import.
 *
 * `next build` charge ce module pour analyser les pages, sans que
 * DATABASE_URL soit nécessairement définie : instancier ici ferait échouer le
 * build au lieu de la requête. Le Proxy diffère la création jusqu'au premier
 * accès réel, en conservant le cache global.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = (globalForPrisma.prisma ??= create())
    const value = Reflect.get(client, prop, receiver)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
