/**
 * Amorce le stock fixe : une cible par article et par département.
 *
 * Sans cible, l'écart est toujours nul et aucune commande ne peut partir.
 * Les valeurs sont des ordres de grandeur par unité de mesure — à ajuster
 * ensuite depuis Administration → Stock fixe.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

/** Cible par symbole d'unité : on ne stocke pas 20 kg comme 20 bouteilles. */
const BY_UNIT: Record<string, number> = {
  kg: 10,
  g: 500,
  L: 12,
  cl: 200,
  u: 24,
  btl: 24,
  crt: 4,
  pqt: 8,
}

async function main() {
  const departments = await prisma.department.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { sortOrder: 'asc' },
  })

  for (const d of departments) {
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        category: { departments: { some: { departmentId: d.id } } },
      },
      select: { id: true, baseUnit: { select: { symbol: true } } },
    })

    if (products.length === 0) {
      console.log(`${d.name.padEnd(14)} : aucun article affecté`)
      continue
    }

    // createMany + skipDuplicates : on n'écrase pas un réglage déjà saisi.
    const created = await prisma.stockFixe.createMany({
      data: products.map((p) => ({
        departmentId: d.id,
        productId: p.id,
        quantity: BY_UNIT[p.baseUnit.symbol] ?? 10,
      })),
      skipDuplicates: true,
    })

    console.log(
      `${d.name.padEnd(14)} : ${String(created.count).padStart(3)} cibles créées ` +
        `(${products.length} articles)`,
    )
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
