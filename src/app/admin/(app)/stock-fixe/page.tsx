import type { Metadata } from 'next'
import { prisma } from '@/server/db'
import { PageHeader } from '@/components/ui/stat'
import { GlassCard, EmptyState } from '@/components/ui/glass'
import { Building2 } from 'lucide-react'
import { StockFixeEditor } from './stock-fixe-editor'
import { NewCategoryButton } from './new-category-button'
import { UnitsButton } from './units-button'
import { FamillesButton } from './familles-button'
import { RelationsButton } from './relations-button'

export const metadata: Metadata = { title: 'Stock fixe' }
export const dynamic = 'force-dynamic'

export default async function StockFixePage({
  searchParams,
}: {
  searchParams: Promise<{ dep?: string; jeu?: string }>
}) {
  const { dep, jeu } = await searchParams

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, code: true, color: true, icon: true, activeStockFixe: true },
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
  // Trois jeux de stock fixe par département ; on regarde (et modifie)
  // celui choisi, sans toucher à celui en service tant qu'on ne bascule pas.
  const vue = ['1', '2', '3'].includes(jeu ?? '') ? Number(jeu) : selected.activeStockFixe

  // Même règle que la feuille de l'employé : une liste explicite prime sur les
  // catégories. Sans cela l'écran réglait des articles que le département ne
  // voit pas — 128 lignes ici contre 107 sur la feuille.
  const [sheet, pars, categories] = await Promise.all([
    prisma.departmentProduct.findMany({
      where: { departmentId: selected.id, product: { isActive: true } },
      orderBy: { sortOrder: 'asc' },
      select: {
        displayName: true,
        product: {
          select: {
            id: true, name: true, reference: true,
            category: { select: { id: true, name: true, icon: true } },
            baseUnit: { select: { id: true, symbol: true } },
          },
        },
      },
    }),
    // Le jeu affiché : celui en service (stock_fixe), ou une réserve.
    vue === selected.activeStockFixe
      ? prisma.stockFixe.findMany({
        where: { departmentId: selected.id },
        select: { productId: true, quantity: true },
      })
      : prisma.stockFixeSet.findMany({
        where: { departmentId: selected.id, slot: vue },
        select: { productId: true, quantity: true },
      }),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
  ])

  const products = sheet.length > 0
    ? sheet.map((row) => ({ ...row.product, catalogueName: row.displayName ? row.product.name : null, name: row.displayName ?? row.product.name }))
    : await prisma.product.findMany({
        where: {
          isActive: true,
          category: { departments: { some: { departmentId: selected.id } } },
        },
        orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
        select: {
          id: true, name: true, reference: true,
          category: { select: { id: true, name: true, icon: true } },
          baseUnit: { select: { id: true, symbol: true } },
        },
      })

  // Pour chaque famille, les départements qui l'utilisent : leur feuille, ou
  // leurs familles affectées tant qu'ils n'ont pas de feuille propre.
  const usages = await prisma.$queryRaw<{ categoryId: number; departmentId: number }[]>`
    SELECT DISTINCT p."categoryId", dp."departmentId"
      FROM department_products dp JOIN products p ON p.id = dp."productId"
     WHERE p."isActive"
    UNION
    SELECT dc."categoryId", dc."departmentId" FROM department_categories dc
     WHERE NOT EXISTS (SELECT 1 FROM department_products x WHERE x."departmentId" = dc."departmentId")`
  const rangDep = new Map(departments.map((d, i) => [d.id, i]))
  const departementsDe = new Map<number, { id: number; name: string; color: string }[]>()
  for (const u of usages) {
    const d = departments.find((x) => x.id === u.departmentId)
    if (!d) continue
    const l = departementsDe.get(u.categoryId) ?? []
    l.push({ id: d.id, name: d.name, color: d.color })
    departementsDe.set(u.categoryId, l)
  }
  for (const l of departementsDe.values()) l.sort((a, b) => (rangDep.get(a.id) ?? 0) - (rangDep.get(b.id) ?? 0))
  const nbArticles = new Map((await prisma.product.groupBy({ by: ['categoryId'], where: { isActive: true }, _count: true })).map((g) => [g.categoryId, g._count]))

  const familles = categories.map((c) => ({ id: String(c.id), name: c.name, articles: nbArticles.get(c.id) ?? 0, departements: departementsDe.get(c.id) ?? [] }))

  const units = await prisma.unit.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, symbol: true },
  })

  const parBy = new Map(pars.map((p) => [p.productId, Number(p.quantity)]))

  return (
    <>
      <PageHeader
        title="Stock fixe"
        description="La quantité que chaque département doit détenir. L’employé saisit son stock réel ; la commande est l’écart entre cette cible et ce qu’il a."
        actions={
          <>
            <FamillesButton
              categories={familles}
              departments={departments.map((d) => ({ id: d.id, name: d.name, color: d.color }))}
            />
            <RelationsButton departments={departments} />
            <UnitsButton />
            <NewCategoryButton departments={departments} selectedId={selected.id} />
          </>
        }
      />
      <StockFixeEditor
        key={`${selected.id}-${vue}`}
        departments={departments}
        selectedId={selected.id}
        jeuActif={selected.activeStockFixe}
        jeuVu={vue}
        categories={familles}
        units={units.map((u) => ({ id: String(u.id), name: u.name, symbol: u.symbol }))}
        products={products.map((p) => ({
          id: String(p.id),
          name: p.name,
          catalogueName: 'catalogueName' in p ? (p.catalogueName as string | null) : null,
          reference: p.reference,
          unitSymbol: p.baseUnit.symbol,
          unitId: String(p.baseUnit.id),
          category: { id: String(p.category.id), name: p.category.name, icon: p.category.icon },
          quantity: parBy.get(p.id) ?? 0,
        }))}
      />
    </>
  )
}
