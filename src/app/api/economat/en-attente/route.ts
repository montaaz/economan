import { NextResponse } from 'next/server'
import { readSession } from '@/server/auth/session'
import { prisma } from '@/server/db'

export const dynamic = 'force-dynamic'

/** Le nom d'un département en nom de fichier : « Petit Déjeuner » → « petit-dejeuner ». */
function slug(nom: string) {
  return nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/**
 * Les commandes qui attendent l'économat (en attente d'acceptation), pour
 * l'annonce sonore. Réservé à l'économat. Les deux dernières journées
 * suffisent : une commande plus ancienne restée en attente est un oubli,
 * pas une alerte.
 */
export async function GET() {
  const u = await readSession()
  if (!u || u.role !== 'ECONOMAN') return NextResponse.json({ commandes: [] }, { status: u ? 403 : 401 })
  const depuis = new Date(Date.now() - 2 * 86_400_000)
  const rows = await prisma.order.findMany({
    where: { status: 'PENDING', createdAt: { gte: depuis } },
    orderBy: [{ isUrgent: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, reference: true, isUrgent: true, department: { select: { name: true } } },
  })
  return NextResponse.json({
    commandes: rows.map((o) => ({ id: o.id, reference: o.reference, urgent: o.isUrgent, departement: o.department.name, son: slug(o.department.name) })),
  }, { headers: { 'cache-control': 'no-store' } })
}
