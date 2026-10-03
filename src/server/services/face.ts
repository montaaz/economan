import 'server-only'
import { prisma } from '@/server/db'

/**
 * La connexion par le visage, à la façon de Face ID.
 *
 * À l'enregistrement, l'agent tourne la tête : le navigateur relève sa
 * signature (128 nombres, face-api.js) sous plusieurs angles. Le serveur les
 * garde toutes, avec leur moyenne. À la connexion, trois images successives
 * sont comparées à l'angle le plus proche ; la médiane des trois décide —
 * une image floue ne fait ni entrer ni refuser.
 *
 * La comparaison est 1 à 1 (l'agent a choisi son nom) : une ligne lue par
 * sa clé, quel que soit le nombre d'agents. La signature ne repart jamais
 * vers le navigateur.
 */
export const SEUIL = 0.45
export const TAILLE = 128
/** Échecs tolérés sur la fenêtre, avant de renvoyer au mot de passe. */
const ECHECS_MAX = 8
const FENETRE_MS = 10 * 60 * 1000

export function descripteurValide(d: unknown): d is number[] {
  return Array.isArray(d) && d.length === TAILLE && d.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 10)
}

export function distance(a: number[], b: number[], decalage = 0) {
  let s = 0
  for (let i = 0; i < TAILLE; i++) { const e = a[decalage + i] - b[i]; s += e * e }
  return Math.sqrt(s)
}

/**
 * Enregistre le visage d'un agent : de 5 à 24 prises sous plusieurs angles.
 * Une prise trop éloignée de la moyenne (une autre personne passée devant la
 * caméra, un visage mal détecté) fait refuser l'ensemble.
 */
export async function enregistrerVisage(userId: number, prises: number[][]) {
  if (prises.length < 5 || prises.length > 24 || !prises.every(descripteurValide)) {
    throw new Error('Prises du visage invalides : recommencez.')
  }
  const moyenne = Array.from({ length: TAILLE }, (_, k) => prises.reduce((n, p) => n + p[k], 0) / prises.length)
  if (prises.some((p) => distance(moyenne, p) > 0.6)) {
    throw new Error('Une des prises ne ressemble pas aux autres : une seule personne devant la caméra, bien éclairée, et recommencez.')
  }
  const sampleData = prises.flat()
  await prisma.faceProfile.upsert({
    where: { userId },
    update: { descriptor: moyenne, samples: prises.length, sampleData },
    create: { userId, descriptor: moyenne, samples: prises.length, sampleData },
  })
}

export async function supprimerVisage(userId: number) {
  await prisma.faceProfile.deleteMany({ where: { userId } })
}

export type VerdictVisage =
  | { ok: true; user: { id: number; username: string; fullName: string; role: 'EMPLOYEE'; departmentId: number | null; departmentName: string | null } }
  | { ok: false; raison: 'inconnu' | 'non-reconnu' | 'bloque' | 'desactive' }

/** La distance d'une image au visage enregistré : à l'angle le plus proche, ou à la moyenne. */
function ecart(profil: { descriptor: number[]; sampleData: number[] }, d: number[]) {
  let meilleur = distance(profil.descriptor, d)
  for (let o = 0; o + TAILLE <= profil.sampleData.length; o += TAILLE) meilleur = Math.min(meilleur, distance(profil.sampleData, d, o))
  return meilleur
}

/** Compare des images successives au visage de l'agent choisi, et note la tentative. */
export async function verifierVisage(userId: number, images: number[][]): Promise<VerdictVisage> {
  const [user, echecs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, username: true, fullName: true, role: true, isActive: true, departmentId: true,
        department: { select: { name: true } }, faceProfile: { select: { descriptor: true, sampleData: true } },
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
  const ecarts = images.map((d) => ecart(user.faceProfile!, d)).sort((a, b) => a - b)
  const mediane = ecarts[Math.floor(ecarts.length / 2)]
  const ok = mediane <= SEUIL
  await prisma.faceLoginAttempt.create({ data: { userId, success: ok, distance: Math.round(mediane * 1000) / 1000 } })
  if (!ok) return { ok: false, raison: 'non-reconnu' }
  return {
    ok: true,
    user: { id: user.id, username: user.username, fullName: user.fullName, role: 'EMPLOYEE', departmentId: user.departmentId, departmentName: user.department?.name ?? null },
  }
}
