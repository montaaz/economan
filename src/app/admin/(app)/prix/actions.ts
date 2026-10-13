'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/server/db'
import { requireRole } from '@/server/auth/guards'

/** Enregistre des prix unitaires (dinars) sur la feuille d'un département ; null efface. */
export async function enregistrerPrix(departmentId: number, lignes: { productId: number; prix: number | null }[]): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['ADMIN'], '/admin/login')
  for (const l of lignes) {
    if (l.prix !== null && (!Number.isFinite(l.prix) || l.prix < 0)) return { ok: false, error: 'Prix invalide.' }
  }
  await prisma.$transaction(lignes.map((l) => prisma.departmentProduct.updateMany({
    where: { departmentId, productId: l.productId },
    data: { unitPrice: l.prix },
  })))
  revalidatePath('/admin/prix')
  revalidatePath('/admin/valorisation', 'layout')
  return { ok: true }
}
