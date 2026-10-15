import { NextResponse } from 'next/server'
import { readSession } from '@/server/auth/session'
import { prisma } from '@/server/db'
import { clesPush } from '@/server/push'

export const dynamic = 'force-dynamic'

/** La clé publique, pour que l'appareil s'abonne. */
export async function GET() {
  const k = await clesPush().catch(() => null)
  return NextResponse.json({ key: k?.pub ?? null })
}

/** Abonne l'appareil de l'économat aux notifications des nouvelles commandes. */
export async function POST(request: Request) {
  const u = await readSession()
  if (!u || u.role !== 'ECONOMAN') return NextResponse.json({ error: 'Réservé à l’économat.' }, { status: 403 })
  const b = (await request.json().catch(() => null)) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null
  if (!b?.endpoint || !b.keys?.p256dh || !b.keys.auth) return NextResponse.json({ error: 'Abonnement illisible.' }, { status: 400 })
  await prisma.pushSubscription.upsert({
    where: { endpoint: b.endpoint },
    create: { endpoint: b.endpoint, p256dh: b.keys.p256dh, auth: b.keys.auth, userId: u.id },
    update: { p256dh: b.keys.p256dh, auth: b.keys.auth, userId: u.id },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const u = await readSession()
  if (!u) return NextResponse.json({ ok: false }, { status: 401 })
  const b = (await request.json().catch(() => null)) as { endpoint?: string } | null
  if (b?.endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint: b.endpoint, userId: u.id } })
  return NextResponse.json({ ok: true })
}
