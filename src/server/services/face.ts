import 'server-only'
import { prisma } from '@/server/db'

/**
 * La connexion par le visage.
 *
 * Le navigateur tire du visage une signature de 128 nombres (face-api.js) ;
 * le serveur la compare à celle enregistrée pour l'agent choisi. La
 * comparaison est 1 à 1 — l'agent a choisi son nom — donc une seule ligne
 * lue par sa clé : rapide quel que soit le nombre d'agents.
 *
 * Le seuil est plus strict que celui d'usage (0,6) : mieux vaut repasser
 * par le mot de passe que laisser entrer un collègue qui ressemble.
 */
export const SEUIL = 0.45
export const TAILLE = 128
/** Échecs tolérés sur la fenêtre, avant de renvoyer au mot de passe. */
const ECHECS_MAX = 8
const FENETRE_MS = 10 * 60 * 1000

export function descripteurValide(d: unknown): d is number[] {
  return Array.isArray(d) && d.length === TAILLE && d.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 10)
}

export function distance(a: number[], b: number[]) {
  let s = 0
  for (let i = 0; i < TAILLE; i++) { const e = a[i] - b[i]; s += e * e }
  return Math.sqrt(s)
}

/**
 * Enregistre le visage d'un agent : plusieurs prises, moyennées. Des prises
 * trop différentes entre elles (deux personnes, un visage mal cadré) sont
 * refusées.
 */
export async function enregistrerVisage(userId: number, prises: number[][]) {
  if (prises.length < 3 || prises.length > 10 || !prises.every(descripteurValide)) {
    throw new Error('Prises du visage invalides : recommencez.')
  }
  for (let i = 0; i < prises.length; i++) {
    for (let j = i + 1; j < prises.length; j++) {
      if (distance(prises[i], prises[j]) > 0.55) throw new Error('Les prises ne se ressemblent pas assez : restez seul face à la caméra, bien éclairé, et recommencez.')
    }
  }
  const moyenne = Array.from({ length: TAILLE }, (_, k) => prises.reduce((n, p) => n + p[k], 0) / prises.length)
  await prisma.faceProfile.upsert({
    where: { userId },
    update: { descriptor: moyenne, samples: prises.length },
    create: { userId, descriptor: moyenne, samples: prises.length },
  })
}

export async function supprimerVisage(userId: number) {
  await prisma.faceProfile.deleteMany({ where: { userId } })
}

export type VerdictVisage =
  | { ok: true; user: { id: number; username: string; fullName: string; role: 'EMPLOYEE'; departmentId: number | null; departmentName: string | null } }
  | { ok: false; raison: 'inconnu' | 'non-reconnu' | 'bloque' | 'desactive' }

/** Compare un visage à celui de l'agent choisi, et note la tentative. */
export async function verifierVisage(userId: number, d: number[]): Promise<VerdictVisage> {
  const [user, echecs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, username: true, fullName: true, role: true, isActive: true, departmentId: true,
        department: { select: { name: true } }, faceProfile: { select: { descriptor: true } },
      },
    }),
    prisma.faceLoginAttempt.count({ where: { userId, success: false, createdAt: { gte: new Date(Date.now() - FENETRE_MS) } } }),
  ])
  // Un compte bloqué par l'administration n'entre ni par le visage ni autrement.
  if (user && !user.isActive) return { ok: false, raison: 'desactive' }
  if (!user || user.role !== 'EMPLOYEE' || !user.faceProfile || user.faceProfile.descriptor.length !== TAILLE) {
    return { ok: false, raison: 'inconnu' }
  }
  if (echecs >= ECHECS_MAX) return { ok: false, raison: 'bloque' }
  const dist = distance(user.faceProfile.descriptor, d)
  const ok = dist <= SEUIL
  await prisma.faceLoginAttempt.create({ data: { userId, success: ok, distance: Math.round(dist * 1000) / 1000 } })
  if (!ok) return { ok: false, raison: 'non-reconnu' }
  return {
    ok: true,
    user: { id: user.id, username: user.username, fullName: user.fullName, role: 'EMPLOYEE', departmentId: user.departmentId, departmentName: user.department?.name ?? null },
  }
}
