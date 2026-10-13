import type { Metadata } from 'next'
import { prisma } from '@/server/db'
import { requireRole } from '@/server/auth/guards'
import { PageHeader } from '@/components/ui/stat'
import { ChoixNouvelleCommande } from './choix'

export const metadata: Metadata = { title: 'Nouvelle commande' }
export const dynamic = 'force-dynamic'

/** Le menu des départements de la nouvelle commande, comme pour l'urgence. */
export default async function NouvelleCommandePage() {
  await requireRole(['ADMIN'], '/admin/login')
  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, color: true, icon: true },
  })
  return (
    <>
      <PageHeader title="Nouvelle commande" description="Choisissez le département : sa feuille s’ouvre comme pour ses employés (stock compté, quantité calculée). Le ticket porte votre nom." />
      <ChoixNouvelleCommande departments={departments.map((d) => ({ ...d, id: String(d.id) }))} />
    </>
  )
}
