import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Package, ShieldCheck, Warehouse } from 'lucide-react'
import { prisma } from '@/server/db'
import { readSession, homeForRole } from '@/server/auth/session'
import { Logo } from '@/components/layout/logo'
import { Icon } from '@/components/ui/icon'
import { EmptyState } from '@/components/ui/glass'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  // Déjà connecté : on n'oblige personne à repasser par le choix du département.
  const session = await readSession()
  if (session) redirect(homeForRole(session.role))

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true, name: true, code: true, color: true, icon: true,
      _count: { select: { users: true } },
    },
  })

  // Le nombre d'articles visibles passe par les catégories affectées.
  const counts = await prisma.$queryRaw<{ departmentId: number; n: bigint }[]>`
    SELECT dc."departmentId", count(p.id) AS n
    FROM department_categories dc
    JOIN products p ON p."categoryId" = dc."categoryId" AND p."isActive"
    GROUP BY dc."departmentId"
  `
  const articlesBy = new Map(counts.map((c) => [c.departmentId, Number(c.n)]))

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1.5">
          <Link
            href="/economat/login"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[rgb(var(--glass-edge)/0.3)] bg-white/60 px-3 py-2 text-[0.8rem] font-medium text-fg-muted backdrop-blur-md transition-colors hover:bg-white/85 hover:text-fg"
          >
            <Warehouse className="size-4" />
            <span className="hidden sm:inline">Économat</span>
          </Link>
          <Link
            href="/admin/login"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[rgb(var(--glass-edge)/0.3)] bg-white/60 px-3 py-2 text-[0.8rem] font-medium text-fg-muted backdrop-blur-md transition-colors hover:bg-white/85 hover:text-fg"
          >
            <ShieldCheck className="size-4" />
            <span className="hidden sm:inline">Administration</span>
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-6">
        <div className="animate-rise mb-7 mt-4 text-center sm:mb-9 sm:mt-8">
          <h1 className="text-[1.6rem] font-bold leading-tight tracking-tight text-fg sm:text-[2.1rem]">
            Choisissez votre département
          </h1>
          <p className="mx-auto mt-2 max-w-lg text-[0.9rem] leading-relaxed text-fg-muted sm:text-[0.98rem]">
            Sélectionnez votre service pour vous connecter et passer votre commande du jour.
          </p>
        </div>

        {departments.length === 0 ? (
          <EmptyState
            icon={<Package className="size-6" />}
            title="Aucun département"
            description="L’administrateur doit d’abord créer les départements."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {departments.map((d, i) => (
              <Link
                key={d.id}
                href={`/login/${d.id}`}
                style={{ animationDelay: `${i * 45}ms` }}
                className="glass glass-specular glass-hover animate-rise group relative flex items-center gap-4 overflow-hidden p-5 text-left"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full blur-2xl transition-opacity duration-300 group-hover:opacity-90"
                  style={{ background: `${d.color}40`, opacity: 0.55 }}
                />
                <span
                  className="relative z-[1] grid size-14 shrink-0 place-items-center rounded-2xl text-white shadow-lg"
                  style={{ background: `linear-gradient(140deg, ${d.color}, ${d.color}bb)` }}
                >
                  <Icon name={d.icon ?? 'Building2'} className="size-7" />
                </span>
                <span className="relative z-[1] min-w-0 flex-1">
                  <span className="block truncate text-[1.05rem] font-bold leading-tight tracking-tight text-fg">
                    {d.name}
                  </span>
                  <span className="mt-1 block text-[0.78rem] tabular-nums text-fg-muted">
                    {articlesBy.get(d.id) ?? 0} articles · {d._count.users} agent
                    {d._count.users > 1 ? 's' : ''}
                  </span>
                </span>
                <span className="relative z-[1] shrink-0 rounded-full border border-[rgb(var(--glass-edge)/0.3)] bg-white/70 px-2.5 py-1 font-mono text-[0.72rem] font-semibold text-fg-muted">
                  {d.code}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
