import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import type { Role } from '@/generated/prisma/enums'
import { prisma } from '@/server/db'

const COOKIE = 'economan_session'
const MAX_AGE = 60 * 60 * 12 // 12 h — une journée de service

export type SessionUser = {
  id: number
  username: string
  fullName: string
  role: Role
  departmentId: number | null
  departmentName: string | null
}

function secret() {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error('AUTH_SECRET manquant.')
  return new TextEncoder().encode(s)
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret())

  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // En production le cookie exige HTTPS. Sur un serveur interne servi en
    // HTTP simple, le navigateur le refuserait et personne ne pourrait se
    // connecter : SESSION_COOKIE_SECURE=0 lève l'exigence, en connaissance
    // de cause.
    secure: process.env.NODE_ENV === 'production' && process.env.SESSION_COOKIE_SECURE !== '0',
    path: '/',
    maxAge: MAX_AGE,
  })
}

/**
 * La session : le jeton, puis l'état réel du compte.
 *
 * Le jeton seul faisait foi pendant douze heures : un compte désactivé ou
 * rétrogradé gardait tous ses droits jusqu'à l'expiration. On relit donc le
 * compte en base — une lecture par clé, mémorisée le temps de la requête —
 * et l'on suit le rôle et le département qu'il porte aujourd'hui.
 */
export const readSession = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null
  let session: SessionUser
  try {
    const { payload } = await jwtVerify(token, secret())
    session = {
      id: payload.id as number,
      username: payload.username as string,
      fullName: payload.fullName as string,
      role: payload.role as Role,
      departmentId: (payload.departmentId as number | null) ?? null,
      departmentName: (payload.departmentName as string | null) ?? null,
    }
  } catch {
    return null
  }
  // Une panne de la base n'est pas une déconnexion : elle remonte telle
  // quelle, plutôt que de renvoyer l'utilisateur à l'écran de connexion.
  const compte = await prisma.user.findUnique({
    where: { id: session.id },
    select: { isActive: true, role: true, fullName: true, departmentId: true, department: { select: { name: true } } },
  })
  if (!compte || !compte.isActive) return null
  return {
    ...session,
    fullName: compte.fullName,
    role: compte.role,
    departmentId: compte.departmentId,
    departmentName: compte.department?.name ?? null,
  }
})

export async function destroySession() {
  const jar = await cookies()
  jar.delete(COOKIE)
}

export function homeForRole(role: Role): string {
  if (role === 'ADMIN') return '/admin'
  if (role === 'ECONOMAN') return '/economat'
  if (role === 'CONTROLEUR') return '/controle/z'
  return '/employe'
}
