import { NextResponse } from 'next/server'
import { generateRegistrationOptions } from '@simplewebauthn/server'
import { prisma } from '@/server/db'
import { readSession } from '@/server/auth/session'
import { rpID, rpName, storeChallenge, purgeExpired } from '@/server/auth/webauthn'

/** L'enrôlement d'une empreinte se fait depuis une session déjà ouverte. */
export async function POST() {
  const session = await readSession()
  if (!session) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 })

  await purgeExpired()
  const existing = await prisma.credential.findMany({
    where: { userId: session.id },
    select: { credentialId: true },
  })

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: session.username,
    userDisplayName: session.fullName,
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.credentialId })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
      // Le capteur de l'appareil, pas une clé USB : c'est le doigt du salarié.
      authenticatorAttachment: 'platform',
    },
  })

  await storeChallenge(`reg:${session.id}`, options.challenge, session.id)
  return NextResponse.json(options)
}
