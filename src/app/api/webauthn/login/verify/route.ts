import { NextResponse } from 'next/server'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { prisma } from '@/server/db'
import { createSession, homeForRole } from '@/server/auth/session'
import { rpID, origin, consumeChallenge } from '@/server/auth/webauthn'

export async function POST(req: Request) {
  const { userId, response } = await req.json()
  const id = Number(userId)
  if (!id || !response) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })

  const expectedChallenge = await consumeChallenge(`auth:${id}`)
  if (!expectedChallenge) {
    return NextResponse.json({ error: 'Demande expirée, recommencez.' }, { status: 400 })
  }

  const stored = await prisma.credential.findUnique({ where: { credentialId: response.id } })
  // Le credential doit exister ET appartenir au compte choisi à l'écran :
  // sans ce second test, l'empreinte d'un collègue ouvrirait ce compte.
  if (!stored || stored.userId !== id) {
    return NextResponse.json({ error: 'Empreinte inconnue.' }, { status: 404 })
  }

  try {
    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(stored.publicKey),
        counter: Number(stored.counter),
        transports: stored.transports?.split(',').filter(Boolean) as never,
      },
    })
    if (!verified) return NextResponse.json({ error: 'Empreinte refusée.' }, { status: 401 })

    await prisma.credential.update({
      where: { id: stored.id },
      data: { counter: BigInt(authenticationInfo.newCounter), lastUsedAt: new Date() },
    })

    const user = await prisma.user.findUniqueOrThrow({
      where: { id },
      include: { department: true },
    })
    if (!user.isActive) return NextResponse.json({ error: 'Compte désactivé.' }, { status: 403 })

    await prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } })
    await createSession({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      departmentId: user.departmentId,
      departmentName: user.department?.name ?? null,
    })
    return NextResponse.json({ ok: true, redirect: homeForRole(user.role) })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Vérification impossible.' },
      { status: 400 },
    )
  }
}
