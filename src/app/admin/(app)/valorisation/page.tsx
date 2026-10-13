import type { Metadata } from 'next'
import { prisma } from '@/server/db'
import { requireRole } from '@/server/auth/guards'
import { PageHeader } from '@/components/ui/stat'
import { MenuValorisation } from './menu'

export const metadata: Metadata = { title: 'Commandes valorisées' }
export const dynamic = 'force-dynamic'

export default async function ValorisationPage() {
  await requireRole(['ADMIN'], '/admin/login')
  const departments = await prisma.department.findMany({
    where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, color: true, icon: true },
  })
  return (
    <>
      <PageHeader title="Commandes valorisées" description="Ce qui a été servi aux départements, au prix unitaire : Prix U × Servi, ligne par ligne, et le total en dinars." />
      <MenuValorisation departments={departments.map((d) => ({ ...d, id: String(d.id) }))} />
    </>
  )
}
