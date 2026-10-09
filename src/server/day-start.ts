import 'server-only'
import { prisma } from '@/server/db'
import { businessDay, fixerDebutJournee, toDateKey } from '@/lib/utils'

/** L'heure de début de la journée de travail, lue en base et posée pour tout le serveur. */
export async function chargerDebutJournee(): Promise<string> {
  // Seule l'heure réglée dans « Journée de travail » fait foi : l'horaire des
  // commandes dit quand on commande, pas quand la journée change.
  const rows = await prisma.$queryRaw<{ dayStartsAt: string }[]>`SELECT "dayStartsAt" FROM "order_schedule" WHERE "id" = 1`
  const h = rows[0]?.dayStartsAt ?? '00:00'
  fixerDebutJournee(h)
  return h
}

/**
 * Range chaque commande récente dans la journée de travail de son heure de
 * création. Une commande passée à 01 h 06 le 8, avec une journée qui commence
 * à 05:00, appartient au 7 : elle y prend le ticket suivant et la référence
 * de ce jour (PAT-20261007-00x). Ne touche que ce qui est mal rangé.
 */
export async function redaterCommandes(jours = 14): Promise<number> {
  const commandes = await prisma.order.findMany({
    where: { createdAt: { gte: new Date(Date.now() - jours * 86_400_000) } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, createdAt: true, businessDay: true, departmentId: true, department: { select: { code: true } } },
  })
  let n = 0
  for (const o of commandes) {
    const cible = businessDay(o.createdAt)
    if (toDateKey(cible) === toDateKey(o.businessDay)) continue
    await prisma.$transaction(async (tx) => {
      const max = await tx.order.aggregate({ where: { departmentId: o.departmentId, businessDay: cible }, _max: { ticketNumber: true } })
      let numero = (max._max.ticketNumber ?? 0) + 1
      const ref = (k: number) => `${o.department.code}-${toDateKey(cible).replace(/-/g, '')}-${String(k).padStart(3, '0')}`
      while (await tx.order.findUnique({ where: { reference: ref(numero) }, select: { id: true } })) numero += 1
      await tx.order.update({ where: { id: o.id }, data: { businessDay: cible, ticketNumber: numero, reference: ref(numero) } })
      await tx.$executeRaw`
        INSERT INTO "ticket_counters" ("businessDay", "departmentId", "lastNumber") VALUES (${cible}::date, ${o.departmentId}, ${numero})
        ON CONFLICT ("businessDay", "departmentId") DO UPDATE SET "lastNumber" = GREATEST(ticket_counters."lastNumber", EXCLUDED."lastNumber")`
    })
    n += 1
  }
  return n
}

/** Règle l'heure de début de la journée (administration), puis range les commandes récentes en conséquence. */
export async function reglerDebutJournee(hhmm: string): Promise<number> {
  await prisma.$executeRaw`
    INSERT INTO "order_schedule" ("id", "dayStartsAt", "updatedAt") VALUES (1, ${hhmm}, now())
    ON CONFLICT ("id") DO UPDATE SET "dayStartsAt" = EXCLUDED."dayStartsAt", "updatedAt" = now()`
  fixerDebutJournee(hhmm)
  return redaterCommandes()
}
