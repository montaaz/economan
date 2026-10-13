import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/server/db'
import { requireRole } from '@/server/auth/guards'
import { PageHeader } from '@/components/ui/stat'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { PrixEditor } from './prix-editor'
import { ImprimerPrix } from './imprimer-prix'

export const metadata: Metadata = { title: 'Prix U' }
export const dynamic = 'force-dynamic'

/** Les prix unitaires des articles, département par département, comme la page Stock fixe. */
export default async function PrixPage({ searchParams }: { searchParams: Promise<{ dep?: string }> }) {
  await requireRole(['ADMIN'], '/admin/login')
  const { dep } = await searchParams
  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, color: true, icon: true },
  })
  // « tous » : chaque département à la suite, chacun avec son tableau.
  const tous = dep === 'tous'
  const choisis = tous ? departments : [departments.find((d) => String(d.id) === dep) ?? departments[0]].filter(Boolean)

  const feuilles = await Promise.all(choisis.map(async (d) => {
    const [feuille, fixes] = await Promise.all([
      prisma.departmentProduct.findMany({
        where: { departmentId: d.id, product: { isActive: true, kind: { not: 'MERE' } } },
        orderBy: { sortOrder: 'asc' },
        select: { productId: true, displayName: true, unitPrice: true, product: { select: { name: true, reference: true, category: { select: { name: true } }, baseUnit: { select: { symbol: true } } } } },
      }),
      prisma.stockFixe.findMany({ where: { departmentId: d.id }, select: { productId: true, quantity: true } }),
    ])
    const fixeDe = new Map(fixes.map((f) => [f.productId, Number(f.quantity)]))
    return {
      id: d.id, nom: d.name, couleur: d.color,
      lignes: feuille.map((r) => ({
        productId: r.productId,
        nom: r.displayName ?? r.product.name,
        reference: r.product.reference,
        famille: r.product.category.name,
        unite: r.product.baseUnit.symbol,
        fixe: fixeDe.get(r.productId) ?? null,
        prix: r.unitPrice === null ? null : Number(r.unitPrice),
      })),
    }
  }))
  const onglet = (actif: boolean) => cn('inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[0.86rem] font-medium transition-colors',
    actif ? 'border-accent/40 bg-accent/12 text-accent' : 'border-[rgb(var(--glass-edge)/0.28)] bg-white/60 text-fg-muted hover:text-fg')

  return (
    <>
      <PageHeader title="Prix U" description="Le prix unitaire de chaque article, en dinars, par département. Il sert à valoriser les commandes servies. Enregistrement automatique." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/admin/prix?dep=tous" className={onglet(tous)}>
          <span className="grid size-6 place-items-center rounded-lg bg-accent text-white"><Icon name="Layers" className="size-3.5" /></span>
          Tout
        </Link>
        {departments.map((d) => (
          <Link key={d.id} href={`/admin/prix?dep=${d.id}`} className={onglet(!tous && d.id === choisis[0]?.id)}>
            <span className="grid size-6 place-items-center rounded-lg text-white" style={{ background: d.color }}><Icon name={d.icon ?? 'Building2'} className="size-3.5" /></span>
            {d.name}
          </Link>
        ))}
        <ImprimerPrix feuilles={feuilles} titre={tous ? 'Tous les départements' : (choisis[0]?.name ?? '')} />
      </div>
      <div className="space-y-6">
        {feuilles.map((f) => (
          <PrixEditor key={f.id} departmentId={f.id} departmentName={f.nom} lignes={f.lignes} />
        ))}
      </div>
    </>
  )
}
