import type { Metadata } from 'next'
import { prisma } from '@/server/db'
import { PageHeader } from '@/components/ui/stat'
import { AssignmentMatrix } from './assignment-matrix'
import { NewCategoryButton } from './new-category-button'

export const metadata: Metadata = { title: 'Affectations' }
export const dynamic = 'force-dynamic'

export default async function AssignmentsPage() {
  const [departments, categories, links] = await Promise.all([
    prisma.department.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, code: true, color: true, icon: true },
    }),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, icon: true, _count: { select: { products: true } } },
    }),
    prisma.departmentCategory.findMany({ select: { departmentId: true, categoryId: true } }),
  ])

  // Les formulaires de création et de modification ont besoin des unités.
  const units = await prisma.unit.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, symbol: true },
  })

  return (
    <>
      <PageHeader
        title="Affectations"
        description="Choisissez les catégories d’articles que chaque département peut commander. Un département ne voit que les articles des catégories cochées."
        actions={<NewCategoryButton />}
      />
      <AssignmentMatrix
        departments={departments}
        categories={categories}
        links={links}
        units={units.map((u) => ({ id: String(u.id), name: u.name, symbol: u.symbol }))}
      />
    </>
  )
}
