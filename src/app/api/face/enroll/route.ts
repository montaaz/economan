import { NextResponse } from 'next/server'
import { readSession } from '@/server/auth/session'
import { prisma } from '@/server/db'
import { enregistrerVisage, supprimerVisage } from '@/server/services/face'

export const dynamic = 'force-dynamic'

/** Seule l'administration enregistre ou retire le visage d'un agent. */
async function admin() {
  const user = await readSession()
  if (!user) return { erreur: NextResponse.json({ error: 'Non authentifié.' }, { status: 401 }) }
  if (user.role !== 'ADMIN') return { erreur: NextResponse.json({ error: 'Réservé à l’administration.' }, { status: 403 }) }
  return { user }
}

async function agent(id: number) {
  if (!Number.isInteger(id)) return null
  return prisma.user.findFirst({ where: { id }, select: { id: true } })
}

/** `{ userId, descriptors: number[][] }` : 3 à 10 prises du visage de l'agent. */
export async function POST(request: Request) {
  const a = await admin()
  if (a.erreur) return a.erreur
  let body: { userId?: unknown; descriptors?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Requête illisible.' }, { status: 400 }) }
  const cible = await agent(Number(body.userId))
  if (!cible) return NextResponse.json({ error: 'Agent introuvable.' }, { status: 404 })
  if (!Array.isArray(body.descriptors)) return NextResponse.json({ error: 'Prises manquantes.' }, { status: 400 })
  try {
    await enregistrerVisage(cible.id, body.descriptors as number[][])
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Enregistrement impossible.' }, { status: 400 })
  }
}

/** `?userId=` : retire le visage de l'agent. */
export async function DELETE(request: Request) {
  const a = await admin()
  if (a.erreur) return a.erreur
  const cible = await agent(Number(new URL(request.url).searchParams.get('userId')))
  if (!cible) return NextResponse.json({ error: 'Agent introuvable.' }, { status: 404 })
  await supprimerVisage(cible.id)
  return NextResponse.json({ ok: true })
}
