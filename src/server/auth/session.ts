import 'server-only'
import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import type { Role } from '@/generated/prisma/enums'

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
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  })
}

export async function readSession(): Promise<SessionUser | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret())
    return {
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
}

export async function destroySession() {
  const jar = await cookies()
  jar.delete(COOKIE)
}

export function homeForRole(role: Role): string {
  if (role === 'ADMIN') return '/admin'
  if (role === 'ECONOMAN') return '/economat'
  return '/employe'
}
