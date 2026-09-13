import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { prisma } from '@/server/db'
import { Icon } from '@/components/ui/icon'
import { EmptyState } from '@/components/ui/glass'
import { DepartmentLogin } from './department-login'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  params,
}: {
  params: Promise<{ departmentId: string }>
}) {
  const { departmentId } = await params
  const id = Number(departmentId)
  if (!Number.isInteger(id)) notFound()

  const department = await prisma.department.findFirst({
    where: { id, isActive: true },
    select: { id: true, name: true, code: true, color: true, icon: true },
  })
  if (!department) notFound()

  const users = await prisma.user.findMany({
    where: { departmentId: id, isActive: true, role: 'EMPLOYEE' },
    orderBy: { fullName: 'asc' },
    select: {
      id: true, fullName: true, username: true, avatarColor: true,
      _count: { select: { credentials: true } },
    },
  })

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-6 sm:py-10">
      <Link
        href="/"
        className="mb-6 inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1.5 text-[0.83rem] font-medium text-fg-muted transition-colors hover:bg-[rgb(var(--glass-edge)/0.14)] hover:text-fg"
      >
        <ArrowLeft className="size-4" />
        Tous les départements
      </Link>

      <div className="mb-6 flex items-center gap-3.5">
        <span
          className="grid size-13 shrink-0 place-items-center rounded-2xl p-3 text-white shadow-lg"
          style={{ background: `linear-gradient(140deg, ${department.color}, ${department.color}bb)` }}
        >
          <Icon name={department.icon ?? 'Building2'} className="size-7" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[1.3rem] font-bold leading-tight tracking-tight text-fg">
            {department.name}
          </h1>
          <p className="text-[0.82rem] text-fg-muted">Sélectionnez votre nom pour vous connecter.</p>
        </div>
      </div>

      {users.length === 0 ? (
        <EmptyState
          title="Aucun agent"
          description="Aucun compte n’est rattaché à ce département. Contactez l’administrateur."
        />
      ) : (
        <DepartmentLogin
          users={users.map((u) => ({
            id: u.id,
            fullName: u.fullName,
            username: u.username,
            avatarColor: u.avatarColor,
            hasPasskey: u._count.credentials > 0,
          }))}
        />
      )}
    </div>
  )
}
