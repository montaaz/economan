import { NextResponse } from 'next/server'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import { prisma } from '@/server/db'
import { readSession } from '@/server/auth/session'
import { rpID, origin, consumeChallenge } from '@/server/auth/webauthn'

export async function POST(req: Request) {
  const session = await readSession()
  if (!session) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 })

  const body = await req.json()
  const expectedChallenge = await consumeChallenge(`reg:${session.id}`)
  if (!expectedChallenge) {
    return NextResponse.json({ error: 'Demande expirée, recommencez.' }, { status: 400 })
  }

  try {
    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    })
    if (!verified || !registrationInfo) {
      return NextResponse.json({ error: 'Empreinte non vérifiée.' }, { status: 400 })
    }

    const { credential } = registrationInfo
    await prisma.credential.create({
      data: {
        userId: session.id,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        transports: credential.transports?.join(',') ?? null,
        deviceLabel: body.deviceLabel ?? null,
      },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Enrôlement impossible.' },
      { status: 400 },
    )
  }
}
