'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/server/db'
import { requireRole } from '@/server/auth/guards'

/** Coche ou décoche « Peut dépasser » : l'économat peut servir cet article au-delà de la commande. */
export async function basculerDepassement(departmentId: number, productId: number, peut: boolean): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['ADMIN'], '/admin/login')
  const r = await prisma.departmentProduct.updateMany({ where: { departmentId, productId }, data: { canExceed: peut } })
  if (r.count === 0) return { ok: false, error: 'Cet article n’est pas sur la feuille du département.' }
  revalidatePath('/admin/stock-fixe')
  return { ok: true }
}
