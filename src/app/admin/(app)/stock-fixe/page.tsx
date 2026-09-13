import type { Metadata } from 'next'
import { prisma } from '@/server/db'
import { PageHeader } from '@/components/ui/stat'
import { GlassCard, EmptyState } from '@/components/ui/glass'
import { Building2 } from 'lucide-react'
import { StockFixeEditor } from './stock-fixe-editor'

export const metadata: Metadata = { title: 'Stock fixe' }
export const dynamic = 'force-dynamic'

export default async function StockFixePage({
  searchParams,
}: {
  searchParams: Promise<{ dep?: string }>
}) {
  const { dep } = await searchParams

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, code: true, color: true, icon: true },
  })

  if (departments.length === 0) {
    return (
      <>
        <PageHeader title="Stock fixe" />
        <GlassCard>
          <EmptyState
            icon={<Building2 className="size-6" />}
            title="Aucun département"
            description="Créez d’abord un département."
          />
        </GlassCard>
      </>
    )
  }

  const selected = departments.find((d) => String(d.id) === dep) ?? departments[0]

  const [products, pars] = await Promise.all([
    prisma.product.findMany({
      where: {
        isActive: true,
        category: { departments: { some: { departmentId: selected.id } } },
      },
      orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
      select: {
        id: true, name: true, reference: true,
        category: { select: { id: true, name: true, icon: true } },
        baseUnit: { select: { symbol: true } },
      },
    }),
    prisma.stockFixe.findMany({
      where: { departmentId: selected.id },
      select: { productId: true, quantity: true },
    }),
  ])

  const parBy = new Map(pars.map((p) => [p.productId, Number(p.quantity)]))

  return (
    <>
      <PageHeader
        title="Stock fixe"
        description="La quantité que chaque département doit détenir. L’employé saisit son stock réel ; la commande est l’écart entre cette cible et ce qu’il a."
      />
      <StockFixeEditor
        departments={departments}
        selectedId={selected.id}
        products={products.map((p) => ({
          id: String(p.id),
          name: p.name,
          reference: p.reference,
          unitSymbol: p.baseUnit.symbol,
          category: { id: String(p.category.id), name: p.category.name, icon: p.category.icon },
          quantity: parBy.get(p.id) ?? 0,
        }))}
      />
    </>
  )
}
