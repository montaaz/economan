/**
 * Articles de la liste fast food du 16/09 absents du catalogue.
 *
 * « OIGNON » n'existait que sous la forme « SANS OIGNON », qui est une option
 * de commande en salle, pas le légume.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const A_CREER = [
  { name: 'LEVURE BOULANGERE EN BLOC', categorie: 'PRODUIT ALIMENTAIRE', unite: 'kg' },
  { name: 'OIGNON',                    categorie: 'FRUITS ET LEGUMES',   unite: 'kg' },
]

async function main() {
  const refs = await prisma.product.findMany({ select: { reference: true } })
  let next = Math.max(
    ...refs.map((r) => Number(r.reference)).filter((n) => Number.isFinite(n)),
    0,
  )

  for (const a of A_CREER) {
    const exists = await prisma.product.findFirst({
      where: { name: { equals: a.name, mode: 'insensitive' } },
    })
    if (exists) {
      console.log(`${a.name.padEnd(28)} existe déjà`)
      continue
    }
    const categorie = await prisma.category.findUniqueOrThrow({ where: { name: a.categorie } })
    const unite = await prisma.unit.findUniqueOrThrow({ where: { symbol: a.unite } })
    next += 1
    const p = await prisma.product.create({
      data: {
        reference: String(next).padStart(4, '0'),
        name: a.name,
        categoryId: categorie.id,
        baseUnitId: unite.id,
      },
      select: { reference: true, name: true },
    })
    console.log(`${p.name.padEnd(28)} créé — réf ${p.reference}, ${a.unite}, ${a.categorie}`)
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
