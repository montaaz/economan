import type { Metadata } from 'next'
import { prisma } from '@/server/db'
import { PageHeader } from '@/components/ui/stat'
import { DepartmentManager } from './department-manager'

export const metadata: Metadata = { title: 'Départements' }
export const dynamic = 'force-dynamic'

export default async function DepartmentsPage() {
  const departments = await prisma.department.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true, name: true, code: true, color: true, icon: true, isActive: true,
      _count: { select: { users: true, orders: true, categories: true } },
    },
  })

  return (
    <>
      <PageHeader
        title="Départements"
        description="Les services qui passent commande. Ils apparaissent en cartes sur la page d’accueil."
      />
      <DepartmentManager departments={departments} />
    </>
  )
}
