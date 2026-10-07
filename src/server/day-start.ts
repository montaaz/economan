import 'server-only'
import { prisma } from '@/server/db'
import { fixerDebutJournee } from '@/lib/utils'

/** L'heure de début de la journée de travail, lue en base et posée pour tout le serveur. */
export async function chargerDebutJournee(): Promise<string> {
  const rows = await prisma.$queryRaw<{ dayStartsAt: string }[]>`SELECT "dayStartsAt" FROM "order_schedule" WHERE "id" = 1`
  const h = rows[0]?.dayStartsAt ?? '00:00'
  fixerDebutJournee(h)
  return h
}

/** Règle l'heure de début de la journée (administration). */
export async function reglerDebutJournee(hhmm: string) {
  await prisma.$executeRaw`
    INSERT INTO "order_schedule" ("id", "dayStartsAt", "updatedAt") VALUES (1, ${hhmm}, now())
    ON CONFLICT ("id") DO UPDATE SET "dayStartsAt" = EXCLUDED."dayStartsAt", "updatedAt" = now()`
  fixerDebutJournee(hhmm)
}
