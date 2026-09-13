import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { readSession } from '@/server/auth/session'

/** Retire une empreinte — uniquement celles du compte connecté. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSession()
  if (!session) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 })

  const { id } = await params
  const credential = await prisma.credential.findUnique({ where: { id: Number(id) } })
  if (!credential || credential.userId !== session.id) {
    return NextResponse.json({ error: 'Empreinte introuvable.' }, { status: 404 })
  }

  await prisma.credential.delete({ where: { id: credential.id } })
  return NextResponse.json({ ok: true })
}
