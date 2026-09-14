/**
 * Crée les articles de la feuille Bar absents du catalogue.
 *
 * Les unités sont déduites des voisins de section : les sirops et les purées
 * se comptent en litres, les fruits secs au kilo, les confiseries à la pièce.
 * La référence suit le format du catalogue (quatre chiffres).
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const A_CREER = [
  { name: 'SNICK BAR',             categorie: 'PATES ET CHOCOLATS',     unite: 'u'  },
  { name: 'CORNET GLACE',          categorie: 'GLACE',                  unite: 'u'  },
  { name: 'FRUIT SEC THE GOURMAND', categorie: 'FRUITS SECS ET GRAINES', unite: 'kg' },
  { name: 'SIROP MELON',           categorie: 'SIROP ET PURé',          unite: 'L'  },
  { name: 'PURE MYRTILLE',         categorie: 'SIROP ET PURé',          unite: 'L'  },
  { name: 'PATE PISTACHE',         categorie: 'PATES ET CHOCOLATS',     unite: 'kg' },
]

async function main() {
  // Les références sont numériques : on repart du plus grand nombre utilisé.
  const refs = await prisma.product.findMany({ select: { reference: true } })
  let next = Math.max(
    ...refs.map((r) => Number(r.reference)).filter((n) => Number.isFinite(n)),
    0,
  )

  for (const a of A_CREER) {
    const exists = await prisma.product.findFirst({ where: { name: a.name } })
    if (exists) {
      console.log(`${a.name.padEnd(24)} existe déjà`)
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
    console.log(`${p.name.padEnd(24)} créé — réf ${p.reference}, ${a.unite}, ${a.categorie}`)
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
