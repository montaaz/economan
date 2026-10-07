import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Check, LogOut } from 'lucide-react'
import { prisma } from '@/server/db'
import { requireRole } from '@/server/auth/guards'
import { PageHeader } from '@/components/ui/stat'
import { GlassCard } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { entrerDepartement, quitterDepartement } from './actions'

export const metadata: Metadata = { title: 'Commander pour un service' }
export const dynamic = 'force-dynamic'

/**
 * Le contrôle de gestion choisit le département pour lequel il commande.
 * Ensuite : Nouvelle commande, Commandes du service, Commande urgente — les
 * écrans de l'employé, sous le nom du contrôleur.
 */
export default async function DepartementPage() {
  const u = await requireRole(['CONTROLEUR', 'ADMIN'], '/controle/login')
  // L'administration commande déjà depuis son tableau de bord.
  if (u.role === 'ADMIN') redirect('/admin')
  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, color: true, icon: true, _count: { select: { products: true } } },
  })

  return (
    <>
      <PageHeader
        title="Commander pour un service"
        description="Choisissez le département : vous passez ses commandes, normales ou urgentes, et suivez ses commandes du service. Chaque ticket porte votre nom."
      />
      {u.departmentName ? (
        <GlassCard className="mb-4 flex flex-wrap items-center gap-3 p-4">
          <p className="min-w-0 flex-1 text-[0.92rem] text-fg">
            Vous commandez actuellement pour <strong>{u.departmentName}</strong>.
          </p>
          <form action={quitterDepartement}>
            <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[rgb(var(--glass-edge)/0.35)] bg-white/70 px-3 text-[0.82rem] font-semibold text-fg-muted hover:text-fg">
              <LogOut className="size-4" /> Quitter ce département
            </button>
          </form>
        </GlassCard>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {departments.map((d) => {
          const actif = d.id === u.departmentId
          return (
            <form key={d.id} action={entrerDepartement.bind(null, d.id)}>
              <button
                type="submit"
                className={cn(
                  'flex w-full items-center gap-3 rounded-2xl border bg-white/70 p-4 text-left shadow-sm transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-md',
                  actif ? 'border-transparent ring-2' : 'border-[rgb(var(--glass-edge)/0.28)]',
                )}
                style={actif ? { ['--tw-ring-color' as string]: d.color } : undefined}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: d.color }}>
                  <Icon name={d.icon ?? 'Building2'} className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.98rem] font-bold text-fg">{d.name}</span>
                  <span className="block text-[0.78rem] text-fg-muted">{d._count.products} article(s) sur sa feuille</span>
                </span>
                {actif ? <Check className="size-5 shrink-0" style={{ color: d.color }} /> : null}
              </button>
            </form>
          )
        })}
      </div>
    </>
  )
}
