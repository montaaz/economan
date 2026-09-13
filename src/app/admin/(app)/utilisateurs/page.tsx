import type { Metadata } from 'next'
import { prisma } from '@/server/db'
import { PageHeader } from '@/components/ui/stat'
import { UserManager } from './user-manager'

export const metadata: Metadata = { title: 'Utilisateurs' }
export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const [users, departments] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
      select: {
        id: true, fullName: true, username: true, role: true, isActive: true,
        avatarColor: true, lastLoginAt: true, departmentId: true,
        department: { select: { name: true, color: true } },
        _count: { select: { credentials: true, ordersCreated: true } },
      },
    }),
    prisma.department.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
  ])

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        description="Les comptes employés, économat et administration."
      />
      <UserManager
        users={users.map((u) => ({
          ...u,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        }))}
        departments={departments}
      />
    </>
  )
}
