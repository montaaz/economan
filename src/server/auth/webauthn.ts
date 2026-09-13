import 'server-only'
import { prisma } from '@/server/db'

export const rpID = process.env.WEBAUTHN_RP_ID ?? 'localhost'
export const rpName = process.env.WEBAUTHN_RP_NAME ?? 'Economan'
export const origin = process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:3000'

const TTL_MS = 5 * 60 * 1000

export async function storeChallenge(key: string, challenge: string, userId?: number) {
  const expiresAt = new Date(Date.now() + TTL_MS)
  await prisma.webAuthnChallenge.upsert({
    where: { key },
    update: { challenge, userId, expiresAt },
    create: { key, challenge, userId, expiresAt },
  })
}

/**
 * Consomme un challenge : il est supprimé à la lecture, pour qu'une même
 * valeur ne puisse jamais servir deux fois (anti-rejeu).
 */
export async function consumeChallenge(key: string): Promise<string | null> {
  const row = await prisma.webAuthnChallenge.findUnique({ where: { key } })
  if (!row) return null
  await prisma.webAuthnChallenge.delete({ where: { key } }).catch(() => {})
  if (row.expiresAt < new Date()) return null
  return row.challenge
}

/** Ménage opportuniste des challenges expirés. */
export async function purgeExpired() {
  await prisma.webAuthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } })
}
