import 'server-only'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

// Un pool unique par processus : en dev, Next recharge les modules à chaque
// édition et sans ce cache on épuiserait les connexions Postgres.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function create() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: 20,
    idleTimeoutMillis: 30_000,
  })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? create()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
