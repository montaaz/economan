import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { createSession } from '@/server/auth/session'
import { descripteurValide, verifierVisage } from '@/server/services/face'

export const dynamic = 'force-dynamic'

/**
 * Connexion d'un agent par son visage : `{ userId, descriptor }`. Le visage
 * se compare sur le serveur à celui que l'agent a enregistré ; reconnu, la
 * session s'ouvre comme avec le mot de passe.
 */
export async function POST(request: Request) {
  let body: { userId?: unknown; descriptor?: unknown; descriptors?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Requête illisible.' }, { status: 400 }) }
  const userId = Number(body.userId)
  // Trois images successives (ou une seule, pour les anciens écrans).
  const images = Array.isArray(body.descriptors) ? body.descriptors : [body.descriptor]
  if (!Number.isInteger(userId) || images.length < 1 || images.length > 5 || !images.every(descripteurValide)) {
    return NextResponse.json({ error: 'Visage illisible.' }, { status: 400 })
  }
  const v = await verifierVisage(userId, images)
  if (!v.ok) {
    const messages = {
      inconnu: 'Aucun visage enregistré pour ce compte : connectez-vous avec votre mot de passe.',
      'non-reconnu': 'Visage non reconnu.',
      bloque: 'Trop d’essais : connectez-vous avec votre mot de passe.',
      desactive: 'Compte bloqué par l’administration.',
    }
    return NextResponse.json({ error: messages[v.raison], raison: v.raison }, { status: v.raison === 'non-reconnu' ? 401 : 403 })
  }
  await prisma.user.update({ where: { id: v.user.id }, data: { lastLoginAt: new Date() } })
  await createSession(v.user)
  return NextResponse.json({ redirect: '/employe' })
}
