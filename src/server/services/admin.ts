'use server'

import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/server/db'
import { requireRole } from '@/server/auth/guards'
import type { Role } from '@/generated/prisma/enums'

export type ActionResult = { ok: boolean; error?: string }

const DEPT_COLORS = ['#3b82f6', '#ef4444', '#ec4899', '#22c55e', '#a855f7', '#f59e0b', '#14b8a6']

/* ----------------------------------------------------------- départements */

export async function saveDepartment(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  const id = form.get('id') ? Number(form.get('id')) : null
  const name = String(form.get('name') ?? '').trim()
  const code = String(form.get('code') ?? '').trim().toUpperCase()
  const color = String(form.get('color') ?? '') || DEPT_COLORS[0]
  const icon = String(form.get('icon') ?? '').trim() || 'Building2'

  if (!name) return { ok: false, error: 'Le nom est obligatoire.' }
  if (!/^[A-Z0-9]{2,6}$/.test(code)) {
    return { ok: false, error: 'Le code doit faire 2 à 6 caractères (lettres ou chiffres).' }
  }

  // Le nom et le code sont uniques : on le vérifie pour rendre un message
  // lisible plutôt que de laisser remonter une erreur Postgres.
  const clash = await prisma.department.findFirst({
    where: { OR: [{ name }, { code }], ...(id ? { NOT: { id } } : {}) },
    select: { name: true, code: true },
  })
  if (clash) {
    return {
      ok: false,
      error: clash.name === name ? 'Ce nom existe déjà.' : 'Ce code existe déjà.',
    }
  }

  if (id) {
    await prisma.department.update({ where: { id }, data: { name, code, color, icon } })
  } else {
    const last = await prisma.department.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })
    await prisma.department.create({
      data: { name, code, color, icon, sortOrder: (last?.sortOrder ?? 0) + 10 },
    })
  }

  revalidatePath('/admin/departements')
  revalidatePath('/')
  return { ok: true }
}

export async function toggleDepartment(id: number, isActive: boolean): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')
  await prisma.department.update({ where: { id }, data: { isActive } })
  revalidatePath('/admin/departements')
  revalidatePath('/')
  return { ok: true }
}

export async function deleteDepartment(id: number): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  // Les commandes référencent le département en RESTRICT : une suppression
  // effacerait l'historique si elle passait. On propose la désactivation.
  const orders = await prisma.order.count({ where: { departmentId: id } })
  if (orders > 0) {
    return {
      ok: false,
      error: `Ce département porte ${orders} commande(s). Désactivez-le plutôt que de le supprimer.`,
    }
  }

  await prisma.user.updateMany({ where: { departmentId: id }, data: { departmentId: null } })
  await prisma.department.delete({ where: { id } })

  revalidatePath('/admin/departements')
  revalidatePath('/')
  return { ok: true }
}

/* ----------------------------------------------------------- affectations */

export async function setDepartmentCategories(
  departmentId: number,
  categoryIds: number[],
): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  await prisma.$transaction([
    prisma.departmentCategory.deleteMany({ where: { departmentId } }),
    prisma.departmentCategory.createMany({
      data: categoryIds.map((categoryId, i) => ({ departmentId, categoryId, sortOrder: i * 10 })),
      skipDuplicates: true,
    }),
  ])

  revalidatePath('/admin/affectations')
  revalidatePath('/')
  return { ok: true }
}

/* ------------------------------------------------------------ utilisateurs */

export async function saveUser(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  const id = form.get('id') ? Number(form.get('id')) : null
  const fullName = String(form.get('fullName') ?? '').trim()
  const username = String(form.get('username') ?? '').trim().toLowerCase()
  const role = String(form.get('role') ?? 'EMPLOYEE') as Role
  const departmentRaw = String(form.get('departmentId') ?? '')
  const departmentId = departmentRaw ? Number(departmentRaw) : null
  const password = String(form.get('password') ?? '')

  if (!fullName) return { ok: false, error: 'Le nom complet est obligatoire.' }
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return { ok: false, error: 'Identifiant : 3 à 32 caractères, minuscules, chiffres, . _ -' }
  }
  if (role === 'EMPLOYEE' && !departmentId) {
    return { ok: false, error: 'Un employé doit être rattaché à un département.' }
  }
  if (!id && password.length < 8) {
    return { ok: false, error: 'Le mot de passe doit faire au moins 8 caractères.' }
  }
  if (id && password && password.length < 8) {
    return { ok: false, error: 'Le nouveau mot de passe doit faire au moins 8 caractères.' }
  }

  const clash = await prisma.user.findFirst({
    where: { username, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  })
  if (clash) return { ok: false, error: 'Cet identifiant est déjà pris.' }

  // Un économe ou un admin n'appartient à aucun département.
  const deptForRole = role === 'EMPLOYEE' ? departmentId : null

  if (id) {
    await prisma.user.update({
      where: { id },
      data: {
        fullName, username, role, departmentId: deptForRole,
        ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
      },
    })
  } else {
    await prisma.user.create({
      data: {
        fullName, username, role, departmentId: deptForRole,
        passwordHash: await bcrypt.hash(password, 10),
        avatarColor: DEPT_COLORS[Math.floor(Math.random() * DEPT_COLORS.length)],
      },
    })
  }

  revalidatePath('/admin/utilisateurs')
  revalidatePath('/')
  return { ok: true }
}

export async function toggleUser(id: number, isActive: boolean): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')
  await prisma.user.update({ where: { id }, data: { isActive } })
  revalidatePath('/admin/utilisateurs')
  return { ok: true }
}

export async function deleteUser(id: number): Promise<ActionResult> {
  const actor = await requireRole(['ADMIN'], '/admin/login')
  if (actor.id === id) return { ok: false, error: 'Vous ne pouvez pas supprimer votre propre compte.' }

  const orders = await prisma.order.count({ where: { createdById: id } })
  if (orders > 0) {
    return {
      ok: false,
      error: `Ce compte porte ${orders} commande(s). Désactivez-le plutôt que de le supprimer.`,
    }
  }

  await prisma.user.delete({ where: { id } })
  revalidatePath('/admin/utilisateurs')
  return { ok: true }
}
