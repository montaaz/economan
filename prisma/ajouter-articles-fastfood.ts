/**
 * Ajoute à la feuille fast food les articles de la liste du 16/09 qui n'y
 * figuraient pas. Les 30 articles déjà présents ne sont pas touchés : la
 * demande était d'ajouter, non de remplacer.
 *
 * Chaque article se range en fin de son bloc de famille, comme le fait
 * l'interface, pour que la feuille garde sa structure.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

/** Nom exact au catalogue. */
const A_AJOUTER = [
  'MOZZARELLA CERISE',
  'LEVURE BOULANGERE EN BLOC',
  'ORIGAN',
  'COURGETTE',
  'AUBERGINE',
  'OIGNON',
  'MP BETTERAVE',        // « BETTERAVE » : la micro-pousse du catalogue
]

async function main() {
  const dept = await prisma.department.findUniqueOrThrow({ where: { code: 'RES' } })

  const produits = await prisma.product.findMany({
    where: { name: { in: A_AJOUTER }, isActive: true },
    select: { id: true, name: true, categoryId: true },
  })
  const manquants = A_AJOUTER.filter((n) => !produits.some((p) => p.name === n))
  if (manquants.length > 0) {
    console.warn(`! introuvable(s) : ${manquants.join(', ')}\n`)
  }

  for (const produit of produits) {
    const deja = await prisma.departmentProduct.findUnique({
      where: { departmentId_productId: { departmentId: dept.id, productId: produit.id } },
    })
    if (deja) {
      console.log(`${produit.name.padEnd(28)} déjà sur la feuille`)
      continue
    }

    await prisma.$transaction(async (tx) => {
      const sheet = await tx.departmentProduct.findMany({
        where: { departmentId: dept.id },
        orderBy: { sortOrder: 'asc' },
        select: { productId: true, sortOrder: true, product: { select: { categoryId: true } } },
      })

      // Fin du premier bloc de la famille, comme dans l'interface : la feuille
      // suit l'ordre du papier, où une famille peut s'ouvrir plusieurs fois.
      const first = sheet.findIndex((r) => r.product.categoryId === produit.categoryId)
      let after: number | null = null
      if (first !== -1) {
        let i = first
        while (i + 1 < sheet.length && sheet[i + 1].product.categoryId === produit.categoryId) i += 1
        after = sheet[i].sortOrder
      }

      if (after !== null) {
        for (const row of sheet.filter((r) => r.sortOrder > after)) {
          await tx.departmentProduct.update({
            where: { departmentId_productId: { departmentId: dept.id, productId: row.productId } },
            data: { sortOrder: row.sortOrder + 10 },
          })
        }
      }

      await tx.departmentProduct.create({
        data: {
          departmentId: dept.id,
          productId: produit.id,
          sortOrder: after !== null ? after + 5 : (sheet.at(-1)?.sortOrder ?? 0) + 10,
        },
      })
    })
    console.log(`${produit.name.padEnd(28)} ajouté`)
  }

  const n = await prisma.departmentProduct.count({ where: { departmentId: dept.id } })
  const sansCible = await prisma.departmentProduct.count({
    where: { departmentId: dept.id, product: { stockFixe: { none: { departmentId: dept.id } } } },
  })
  console.log(`\n${dept.name} : ${n} articles — ${sansCible} sans stock fixe`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
