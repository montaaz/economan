import 'server-only'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

// Un pool unique par processus, y compris en production : en développement Next
// recharge les modules à chaque édition, et sur une plateforme serverless une
// lambda tiède réévalue ce module — sans ce cache on ouvrirait un pool de plus
// à chaque fois, jusqu'à épuiser les connexions Postgres.
type Entree = { client: PrismaClient; vu: number }
const globalForPrisma = globalThis as unknown as { prismaClients?: Map<unknown, Entree> }

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

/** Combien de clients on garde ouverts à la fois, en développement. */
const MAX_CLIENTS = 3
/** Le délai laissé aux requêtes en cours avant de fermer un client écarté. */
const SURSIS_MS = 60_000

/**
 * Le client de la classe importée ici, construit à la première utilisation.
 *
 * `next build` charge ce module pour analyser les pages, sans que
 * DATABASE_URL soit nécessairement définie : instancier à l'import ferait
 * échouer le build au lieu de la requête. Le Proxy diffère la création
 * jusqu'au premier accès réel.
 *
 * Un client par classe, jamais fermé sous une requête. En développement,
 * Next charge le client généré en plusieurs exemplaires — les pages d'un
 * côté, la route GraphQL de l'autre — et le recharge après `prisma
 * generate`. L'ancienne garde comparait la classe à celle du dernier
 * client construit et fermait celui-ci dès qu'elle différait : les deux
 * exemplaires se fermaient donc l'un l'autre à chaque appel, et les requêtes
 * en cours tombaient sur « Cannot use a pool after calling end on the
 * pool ». Chaque classe garde désormais son client ; un client périmé n'est
 * fermé que lorsqu'il y en a trop, le plus ancien d'abord, et après un
 * sursis qui laisse finir ce qui tourne. En production il n'y a qu'une
 * classe, donc un seul client, jamais fermé.
 */
function clientCourant(): PrismaClient {
  const clients = (globalForPrisma.prismaClients ??= new Map<unknown, Entree>())
  const connu = clients.get(PrismaClient)
  if (connu) {
    connu.vu = Date.now()
    return connu.client
  }
  const entree: Entree = { client: create(), vu: Date.now() }
  clients.set(PrismaClient, entree)
  if (clients.size > MAX_CLIENTS) {
    const [cle, ancien] = [...clients.entries()]
      .filter(([k]) => k !== PrismaClient)
      .sort((x, y) => x[1].vu - y[1].vu)[0]
    clients.delete(cle)
    // Plus personne ne peut l'obtenir ; on laisse finir ses requêtes.
    const t = setTimeout(() => { void ancien.client.$disconnect().catch(() => undefined) }, SURSIS_MS)
    t.unref?.()
  }
  return entree.client
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = clientCourant()
    const value = Reflect.get(client, prop, receiver)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
