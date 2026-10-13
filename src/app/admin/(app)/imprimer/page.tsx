import type { Metadata } from 'next'
import { prisma } from '@/server/db'
import { requireRole } from '@/server/auth/guards'
import { PageHeader } from '@/components/ui/stat'
import { ChoixImpression } from './choix-impression'

export const metadata: Metadata = { title: 'Imprimer départements' }
export const dynamic = 'force-dynamic'

/**
 * Les feuilles de commande vierges, à imprimer : tous les départements dans
 * un seul PDF, ou un seul. Toujours à jour : articles, noms et ordre de la
 * feuille sont relus au moment de l'impression.
 */
export default async function ImprimerDepartementsPage() {
  await requireRole(['ADMIN'], '/admin/login')
  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, color: true, icon: true, _count: { select: { products: { where: { product: { isActive: true, kind: { not: 'MERE' } } } } } } },
  })
  return (
    <>
      <PageHeader
        title="Imprimer départements"
        description="Les feuilles de commande vierges : chaque département avec ses articles, dans l’ordre de sa feuille, et une colonne Commande à remplir à la main. Toujours à jour."
      />
      <ChoixImpression departments={departments.map((d) => ({ id: String(d.id), name: d.name, color: d.color, icon: d.icon, articles: d._count.products }))} />
    </>
  )
}
