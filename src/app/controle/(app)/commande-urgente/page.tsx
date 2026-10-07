import type { Metadata } from 'next'
import { prisma } from '@/server/db'
import { requireRole } from '@/server/auth/guards'
import { PageHeader } from '@/components/ui/stat'
import { ChoixUrgence } from './choix-urgence'

export const metadata: Metadata = { title: 'Commande urgente' }
export const dynamic = 'force-dynamic'

/** Le menu des départements de la commande urgente, comme pour l'administration. */
export default async function ControleUrgentChoixPage() {
  await requireRole(['CONTROLEUR'], '/controle/login')
  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, color: true, icon: true },
  })
  return (
    <>
      <PageHeader title="Commande urgente" description="Choisissez le département : sa feuille s’ouvre, vous tapez les quantités, le ticket porte votre nom." />
      <ChoixUrgence departments={departments.map((d) => ({ ...d, id: String(d.id) }))} />
    </>
  )
}
