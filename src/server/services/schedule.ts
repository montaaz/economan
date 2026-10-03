import 'server-only'
import { prisma } from '@/server/db'
import { BUSINESS_TZ } from '@/lib/utils'

/**
 * L'horaire des commandes.
 *
 * L'établissement ne commande pas aux mêmes heures toute l'année : le
 * ramadan décale la journée, l'été aussi. L'administration règle donc une
 * plage — de telle heure à telle heure — pendant laquelle les départements
 * peuvent commander. Un utilisateur peut avoir la sienne, qui prime sur la
 * plage générale : le service du petit déjeuner ne commande pas à l'heure
 * de la cuisine.
 *
 * Les heures s'écrivent « HH:MM » et se lisent dans le fuseau de
 * l'établissement. Une plage peut passer minuit : de 20:00 à 02:00.
 */

export type Plage = { opensAt: string; closesAt: string }
export type Fenetre = {
  /** Peut-on commander maintenant ? */
  open: boolean
  /** Une plage s'applique-t-elle ? Sinon, on commande à toute heure. */
  restricted: boolean
  /** La plage est celle de l'utilisateur, pas la générale. */
  personal: boolean
  opensAt: string | null
  closesAt: string | null
  /** L'heure qu'il est, dans le fuseau de l'établissement. */
  now: string
  label: string | null
}

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/

export function heureValide(v: string | null | undefined): v is string {
  return typeof v === 'string' && HEURE.test(v)
}

/** L'heure qu'il est dans l'établissement, « HH:MM ». */
export function maintenant(date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: BUSINESS_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
}

/** L'heure tombe-t-elle dans la plage ? Deux bornes égales : toute la journée. */
export function dansLaPlage(heure: string, plage: Plage): boolean {
  const { opensAt, closesAt } = plage
  if (opensAt === closesAt) return true
  if (opensAt < closesAt) return heure >= opensAt && heure < closesAt
  // La plage passe minuit : ouverte le soir, et encore au petit matin.
  return heure >= opensAt || heure < closesAt
}

type General = { enabled: boolean; opensAt: string; closesAt: string; label: string | null }

async function general(): Promise<General> {
  const rows = await prisma.$queryRaw<General[]>`SELECT "enabled", "opensAt", "closesAt", "label" FROM "order_schedule" WHERE "id" = 1`
  return rows[0] ?? { enabled: false, opensAt: '08:00', closesAt: '12:00', label: null }
}

/** La fenêtre de commande d'un utilisateur, à l'instant. */
export async function fenetreDe(userId: number): Promise<Fenetre> {
  const [g, perso] = await Promise.all([
    general(),
    prisma.$queryRaw<{ orderOpensAt: string | null; orderClosesAt: string | null }[]>`
      SELECT "orderOpensAt", "orderClosesAt" FROM "users" WHERE "id" = ${userId}`,
  ])
  const now = maintenant()
  const u = perso[0]
  if (u && heureValide(u.orderOpensAt) && heureValide(u.orderClosesAt)) {
    const plage = { opensAt: u.orderOpensAt, closesAt: u.orderClosesAt }
    return { open: dansLaPlage(now, plage), restricted: true, personal: true, ...plage, now, label: null }
  }
  if (g.enabled && heureValide(g.opensAt) && heureValide(g.closesAt)) {
    return { open: dansLaPlage(now, g), restricted: true, personal: false, opensAt: g.opensAt, closesAt: g.closesAt, now, label: g.label }
  }
  return { open: true, restricted: false, personal: false, opensAt: null, closesAt: null, now, label: null }
}

/** Le refus, en une phrase : ce qu'on dit à qui commande hors de sa plage. */
export function refusHoraire(f: Fenetre): string {
  return `Les commandes sont ouvertes de ${f.opensAt} à ${f.closesAt}${f.personal ? ' pour votre compte' : ''}. Il est ${f.now} : revenez à l’ouverture, ou demandez une commande urgente à l’administration.`
}

/** Tout l'horaire, pour l'écran de l'administration. */
export async function horaires() {
  const [g, users] = await Promise.all([
    general(),
    prisma.$queryRaw<{
      id: number; fullName: string; username: string; isActive: boolean
      orderOpensAt: string | null; orderClosesAt: string | null
      departmentId: number | null; departmentName: string | null; departmentColor: string | null
    }[]>`
      SELECT u."id", u."fullName", u."username", u."isActive", u."orderOpensAt", u."orderClosesAt",
             d."id" AS "departmentId", d."name" AS "departmentName", d."color" AS "departmentColor"
      FROM "users" u LEFT JOIN "departments" d ON d."id" = u."departmentId"
      WHERE u."role" = 'EMPLOYEE' AND u."isActive" = true
      ORDER BY d."sortOrder" NULLS LAST, d."name", u."fullName"`,
  ])
  return {
    ...g,
    now: maintenant(),
    users: users.map((u) => ({
      userId: String(u.id), fullName: u.fullName, username: u.username,
      departmentId: u.departmentId === null ? null : String(u.departmentId),
      departmentName: u.departmentName, departmentColor: u.departmentColor,
      opensAt: heureValide(u.orderOpensAt) ? u.orderOpensAt : null,
      closesAt: heureValide(u.orderClosesAt) ? u.orderClosesAt : null,
    })),
  }
}

export async function reglerHoraireGeneral(p: { enabled: boolean; opensAt: string; closesAt: string; label?: string | null }) {
  if (!heureValide(p.opensAt) || !heureValide(p.closesAt)) throw new Error('HEURE')
  const label = p.label?.trim().slice(0, 60) || null
  await prisma.$executeRaw`
    INSERT INTO "order_schedule" ("id", "enabled", "opensAt", "closesAt", "label", "updatedAt")
    VALUES (1, ${p.enabled}, ${p.opensAt}, ${p.closesAt}, ${label}, now())
    ON CONFLICT ("id") DO UPDATE SET
      "enabled" = EXCLUDED."enabled", "opensAt" = EXCLUDED."opensAt", "closesAt" = EXCLUDED."closesAt",
      "label" = EXCLUDED."label", "updatedAt" = now()`
}

/** Pose — ou retire, avec deux nuls — la plage propre à des utilisateurs. */
export async function reglerHoraireUtilisateurs(userIds: number[], opensAt: string | null, closesAt: string | null) {
  if (userIds.length === 0) return 0
  const retire = opensAt === null && closesAt === null
  if (!retire && (!heureValide(opensAt) || !heureValide(closesAt))) throw new Error('HEURE')
  return prisma.$executeRaw`
    UPDATE "users" SET "orderOpensAt" = ${retire ? null : opensAt}, "orderClosesAt" = ${retire ? null : closesAt}, "updatedAt" = now()
    WHERE "role" = 'EMPLOYEE' AND "id" = ANY(${userIds}::int[])`
}
