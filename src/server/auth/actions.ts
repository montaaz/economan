'use server'

import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { prisma } from '@/server/db'
import { createSession, destroySession, homeForRole } from './session'
import { chiffrerMotDePasse, dechiffrerMotDePasse } from './password-vault'

export type LoginState = { error?: string }

/**
 * Le mot de passe vient d'être vérifié : on garde la copie chiffrée que
 * l'administration peut relire, si elle manque ou n'est plus à jour.
 */
async function garderMotDePasse(user: { id: number; passwordEnc: string | null }, password: string) {
  if (dechiffrerMotDePasse(user.passwordEnc) === password) return
  await prisma.user.update({ where: { id: user.id }, data: { passwordEnc: chiffrerMotDePasse(password) } })
}

/** Connexion employé : il a déjà choisi son département puis son nom. */
export async function loginEmployee(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const userId = Number(formData.get('userId'))
  const password = String(formData.get('password') ?? '')
  if (!userId || !password) return { error: 'Saisissez votre mot de passe.' }

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { department: true } })
  if (!user || !user.isActive || user.role !== 'EMPLOYEE') {
    return { error: 'Compte introuvable.' }
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    return { error: 'Mot de passe incorrect.' }
  }

  await garderMotDePasse(user, password)
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await createSession({
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    departmentId: user.departmentId,
    departmentName: user.department?.name ?? null,
  })
  redirect('/employe')
}

/** Connexion du personnel : admin et économat, par identifiant. */
export async function loginStaff(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get('username') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const expected = String(formData.get('role') ?? '')
  if (!username || !password) return { error: 'Identifiant et mot de passe requis.' }

  const user = await prisma.user.findUnique({ where: { username }, include: { department: true } })
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: 'Identifiant ou mot de passe incorrect.' }
  }
  // Un économe ne se connecte pas par la porte de l'admin, et inversement.
  if (expected === 'ADMIN' && user.role !== 'ADMIN') {
    return { error: 'Ce compte n’a pas accès à l’espace administrateur.' }
  }
  if (expected === 'ECONOMAN' && user.role !== 'ECONOMAN' && user.role !== 'ADMIN') {
    return { error: 'Ce compte n’a pas accès à l’espace économat.' }
  }
  if (expected === 'CONTROLEUR' && user.role !== 'CONTROLEUR' && user.role !== 'ADMIN') {
    return { error: 'Ce compte n’a pas accès à l’espace contrôle de gestion.' }
  }

  await garderMotDePasse(user, password)
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await createSession({
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    departmentId: user.departmentId,
    departmentName: user.department?.name ?? null,
  })
  redirect(homeForRole(user.role))
}

export async function logout() {
  await destroySession()
  redirect('/')
}
