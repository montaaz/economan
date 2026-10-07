'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/server/db'
import { requireRole } from '@/server/auth/guards'
import { createSession } from '@/server/auth/session'

/**
 * Le contrôle de gestion entre dans un département pour y commander : la
 * session porte ce département, les écrans de l'employé s'ouvrent, et chaque
 * ticket portera le nom du contrôleur.
 */
export async function entrerDepartement(departmentId: number) {
  const u = await requireRole(['CONTROLEUR'], '/controle/login')
  const dep = await prisma.department.findFirst({ where: { id: departmentId, isActive: true }, select: { id: true, name: true } })
  if (!dep) redirect('/controle/departement')
  await createSession({ ...u, departmentId: dep.id, departmentName: dep.name, actingDepartmentId: dep.id })
  redirect('/employe/commande')
}

/** Revient au seul contrôle de gestion. */
export async function quitterDepartement() {
  const u = await requireRole(['CONTROLEUR'], '/controle/login')
  await createSession({ ...u, departmentId: null, departmentName: null, actingDepartmentId: null })
  redirect('/controle/departement')
}

/**
 * La commande urgente : le menu des départements choisit le rayon, on y
 * entre, et sa feuille urgente s'ouvre — comme pour l'administration.
 */
export async function urgenceDepartement(departmentId: number) {
  const u = await requireRole(['CONTROLEUR'], '/controle/login')
  const dep = await prisma.department.findFirst({ where: { id: departmentId, isActive: true }, select: { id: true, name: true } })
  if (!dep) redirect('/controle/commande-urgente')
  await createSession({ ...u, departmentId: dep.id, departmentName: dep.name, actingDepartmentId: dep.id })
  redirect(`/controle/commande-urgente/${dep.id}`)
}
