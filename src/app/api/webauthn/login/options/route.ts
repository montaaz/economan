import { NextResponse } from 'next/server'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { prisma } from '@/server/db'
import { rpID, storeChallenge, purgeExpired } from '@/server/auth/webauthn'

/** Options d'authentification pour un employé précis (déjà choisi à l'écran). */
export async function POST(req: Request) {
  const { userId } = await req.json()
  const id = Number(userId)
  if (!id) return NextResponse.json({ error: 'Utilisateur manquant.' }, { status: 400 })

  await purgeExpired()
  const creds = await prisma.credential.findMany({
    where: { userId: id },
    select: { credentialId: true, transports: true },
  })
  if (creds.length === 0) {
    return NextResponse.json({ error: 'Aucune empreinte enregistrée sur ce compte.' }, { status: 404 })
  }

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials: creds.map((c) => ({
      id: c.credentialId,
      transports: c.transports?.split(',').filter(Boolean) as AuthenticatorTransport[] | undefined,
    })),
  })

  await storeChallenge(`auth:${id}`, options.challenge, id)
  return NextResponse.json(options)
}

type AuthenticatorTransport = 'ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb'
