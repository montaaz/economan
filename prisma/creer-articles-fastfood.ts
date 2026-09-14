/**
 * Crée les articles de la feuille fast food absents du catalogue.
 *
 * Les unités suivent celles de leur section : les escalopes au kilo comme les
 * autres volailles, les paquets à la pièce comme les emballages, la sauce au
 * kilo comme les conserves.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const A_CREER = [
  { name: 'ESCALOPE CRUNCHY', categorie: 'VOLAILLES', unite: 'kg' },
  { name: 'PAQUET PANUZZO',   categorie: 'EMBALAGES', unite: 'u'  },
  { name: 'PAQUET PIZZA',     categorie: 'EMBALAGES', unite: 'u'  },
  { name: 'SAUCE TOMATE',     categorie: 'CONSERVES', unite: 'kg' },
]

async function main() {
  const refs = await prisma.product.findMany({ select: { reference: true } })
  let next = Math.max(
    ...refs.map((r) => Number(r.reference)).filter((n) => Number.isFinite(n)),
    0,
  )

  for (const a of A_CREER) {
    const exists = await prisma.product.findFirst({ where: { name: a.name } })
    if (exists) {
      console.log(`${a.name.padEnd(20)} existe déjà`)
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
    console.log(`${p.name.padEnd(20)} créé — réf ${p.reference}, ${a.unite}, ${a.categorie}`)
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
