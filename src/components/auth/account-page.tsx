import { prisma } from '@/server/db'
import { requireUser } from '@/server/auth/guards'
import { PageHeader } from '@/components/ui/stat'
import { PasskeyManager } from '@/components/auth/passkey-manager'
import { GlassCard, CardHeader, Badge } from '@/components/ui/glass'
import { ROLE_LABEL } from '@/lib/nav'
import { UserRound } from 'lucide-react'
import { formatDateTime, initials } from '@/lib/utils'

/** Écran « mon compte », partagé par les employés et l'économat. */
export async function AccountPage({ loginPath }: { loginPath: string }) {
  const session = await requireUser(loginPath)
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
    select: {
      fullName: true, username: true, role: true, avatarColor: true, lastLoginAt: true,
      department: { select: { name: true } },
      credentials: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, deviceLabel: true, createdAt: true, lastUsedAt: true },
      },
    },
  })

  return (
    <>
      <PageHeader title="Mon compte" description="Vos informations et vos moyens de connexion." />

      <div className="space-y-4">
        <GlassCard>
          <CardHeader title="Profil" icon={<UserRound className="size-5" />} />
          <div className="flex items-center gap-4 p-4 sm:p-5">
            <span
              className="grid size-14 shrink-0 place-items-center rounded-full text-[1.05rem] font-bold text-white shadow-md"
              style={{ background: `linear-gradient(140deg, ${user.avatarColor}, ${user.avatarColor}bb)` }}
            >
              {initials(user.fullName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[1.05rem] font-bold leading-tight text-fg">{user.fullName}</p>
              <p className="truncate font-mono text-[0.8rem] text-fg-subtle">{user.username}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone="accent">{ROLE_LABEL[user.role]}</Badge>
                {user.department ? <Badge tone="neutral">{user.department.name}</Badge> : null}
                {user.lastLoginAt ? (
                  <Badge tone="neutral">Dernière connexion {formatDateTime(user.lastLoginAt)}</Badge>
                ) : null}
              </div>
            </div>
          </div>
        </GlassCard>

        <PasskeyManager
          passkeys={user.credentials.map((c) => ({
            id: c.id,
            deviceLabel: c.deviceLabel,
            createdAt: c.createdAt.toISOString(),
            lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
          }))}
        />
      </div>
    </>
  )
}
