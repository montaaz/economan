'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/server/db'
import { requireRole } from '@/server/auth/guards'
import type { ActionResult } from '@/server/services/admin'

/* ------------------------------------------------------------ fournisseurs */

/** Un champ facultatif : vide devient nul, et la longueur reste raisonnable. */
function texte(form: FormData, cle: string, max: number) {
  const v = String(form.get(cle) ?? '').trim().replace(/[ \t]+/g, ' ')
  return v ? v.slice(0, max) : null
}

/**
 * Crée ou corrige un fournisseur, avec toutes ses coordonnées. Le nom est
 * unique sans égard à la casse : c'est par lui que la facture retrouve son
 * fournisseur.
 */
export async function saveSupplier(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  const id = form.get('id') ? Number(form.get('id')) : null
  if (id !== null && !Number.isInteger(id)) return { ok: false, error: 'Fournisseur introuvable.' }
  const name = String(form.get('name') ?? '').trim().replace(/\s+/g, ' ')
  if (!name) return { ok: false, error: 'Le nom du fournisseur est obligatoire.' }
  if (name.length > 120) return { ok: false, error: 'Le nom tient en 120 caractères au plus.' }

  const email = texte(form, 'email', 160)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Adresse e-mail invalide.' }
  const bankAccount = texte(form, 'bankAccount', 40)
  if (bankAccount && !/^[0-9A-Za-z ]{8,40}$/.test(bankAccount)) {
    return { ok: false, error: 'RIB invalide : des chiffres (et lettres pour un IBAN), sans autre signe.' }
  }

  const data = {
    name,
    contactName: texte(form, 'contactName', 120),
    phone: texte(form, 'phone', 40),
    email,
    address: texte(form, 'address', 300),
    taxId: texte(form, 'taxId', 40),
    commerceRegister: texte(form, 'commerceRegister', 40),
    bankAccount,
    notes: String(form.get('notes') ?? '').trim().slice(0, 1000) || null,
  }

  const clash = await prisma.supplier.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, ...(id ? { NOT: { id } } : {}) },
    select: { name: true },
  })
  if (clash) return { ok: false, error: `Le fournisseur « ${clash.name} » existe déjà.` }

  if (id) {
    const { count } = await prisma.supplier.updateMany({ where: { id }, data })
    if (count === 0) return { ok: false, error: 'Fournisseur introuvable : rechargez la page.' }
  } else {
    await prisma.supplier.create({ data })
  }
  revalidatePath('/admin/fournisseurs')
  return { ok: true }
}

/** Masque ou réaffiche un fournisseur sur les factures. */
export async function toggleSupplier(id: number, isActive: boolean): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')
  const { count } = await prisma.supplier.updateMany({ where: { id }, data: { isActive } })
  if (count === 0) return { ok: false, error: 'Fournisseur introuvable : rechargez la page.' }
  revalidatePath('/admin/fournisseurs')
  return { ok: true }
}

/**
 * Supprime un fournisseur — seulement s'il ne porte ni facture ni photo :
 * sans quoi ses factures perdraient leur fournisseur, et le stock son
 * historique d'achat. On le masque alors.
 */
export async function deleteSupplier(id: number): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')
  const [entrees, photos] = await Promise.all([
    prisma.stockEntry.count({ where: { supplierId: id } }),
    prisma.invoicePhoto.count({ where: { supplierId: id } }),
  ])
  if (entrees > 0 || photos > 0) {
    return {
      ok: false,
      error: `Ce fournisseur porte ${entrees} ligne(s) de facture${photos > 0 ? ` et ${photos} photo(s)` : ''}. Masquez-le plutôt : ses factures le gardent, et il ne se propose plus.`,
    }
  }
  const { count } = await prisma.supplier.deleteMany({ where: { id } })
  if (count === 0) return { ok: false, error: 'Fournisseur introuvable : rechargez la page.' }
  revalidatePath('/admin/fournisseurs')
  return { ok: true }
}
