import type { Metadata } from 'next'
import { prisma } from '@/server/db'
import { requireRole } from '@/server/auth/guards'
import { PageHeader } from '@/components/ui/stat'
import { SupplierManager, type Fournisseur } from './supplier-manager'

export const metadata: Metadata = { title: 'Fournisseurs' }
export const dynamic = 'force-dynamic'

/**
 * Les fournisseurs du stock général : leurs coordonnées complètes, et ce
 * qu'on leur a acheté. Les factures les créent au passage ; l'administration
 * les complète, les corrige, les masque ou les supprime ici.
 */
export default async function FournisseursPage() {
  await requireRole(['ADMIN'], '/admin/login')
  // Une ligne par fournisseur, avec ses factures comptées en une requête.
  const lignes = await prisma.$queryRaw<{
    id: number; name: string; contactName: string | null; phone: string | null; email: string | null
    address: string | null; taxId: string | null; commerceRegister: string | null; bankAccount: string | null
    notes: string | null; isActive: boolean; createdAt: Date
    factures: bigint; achats: unknown; derniere: Date | null; photos: bigint
  }[]>`
    SELECT s."id", s."name", s."contactName", s."phone", s."email", s."address", s."taxId",
           s."commerceRegister", s."bankAccount", s."notes", s."isActive", s."createdAt",
           COUNT(DISTINCT COALESCE(e."reference", '') || '|' || e."businessDay"::text) FILTER (WHERE e."id" IS NOT NULL) AS "factures",
           COALESCE(SUM(e."quantity" * e."unitPrice"), 0) AS "achats",
           MAX(e."businessDay") AS "derniere",
           (SELECT COUNT(*) FROM "invoice_photos" p WHERE p."supplierId" = s."id") AS "photos"
    FROM "suppliers" s
    LEFT JOIN "stock_entries" e ON e."supplierId" = s."id" AND e."type" = 'ARRIVAGE'
    GROUP BY s."id"
    ORDER BY s."isActive" DESC, LOWER(s."name") ASC`

  const fournisseurs: Fournisseur[] = lignes.map((l) => ({
    id: l.id, name: l.name, contactName: l.contactName, phone: l.phone, email: l.email, address: l.address,
    taxId: l.taxId, commerceRegister: l.commerceRegister, bankAccount: l.bankAccount, notes: l.notes,
    isActive: l.isActive, createdAt: l.createdAt.toISOString(),
    factures: Number(l.factures), achats: Number(l.achats), photos: Number(l.photos),
    derniere: l.derniere ? l.derniere.toISOString() : null,
  }))

  return (
    <>
      <PageHeader
        title="Fournisseurs"
        description="Les sociétés qui livrent le stock général : coordonnées, matricule fiscal, registre de commerce, RIB. Les factures s’y rattachent par le nom du fournisseur."
      />
      <SupplierManager fournisseurs={fournisseurs} />
    </>
  )
}
