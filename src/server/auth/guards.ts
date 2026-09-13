import 'server-only'
import { redirect } from 'next/navigation'
import { readSession, type SessionUser } from './session'
import type { Role } from '@/generated/prisma/enums'

export async function requireUser(loginPath = '/'): Promise<SessionUser> {
  const user = await readSession()
  if (!user) redirect(loginPath)
  return user
}

export async function requireRole(roles: Role[], loginPath = '/'): Promise<SessionUser> {
  const user = await requireUser(loginPath)
  if (!roles.includes(user.role)) redirect(loginPath)
  return user
}

/** Employé rattaché à un département — le seul profil qui passe commande. */
export async function requireEmployeeDepartment(): Promise<SessionUser & { departmentId: number }> {
  const user = await requireUser('/')
  if (user.role !== 'EMPLOYEE' || !user.departmentId) redirect('/')
  return user as SessionUser & { departmentId: number }
}
