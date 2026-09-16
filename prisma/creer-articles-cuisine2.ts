/**
 * Articles de la feuille Cuisine absents du catalogue.
 *
 * « CHEVRETTE BRICK » et « CREVETTE BISK » sont deux lignes distinctes du
 * papier : rapprocher les deux de CREVETTE BRIK ferait doublon, on crée donc
 * CREVETTE BISK à part.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const A_CREER = [
  { name: 'KAMOUN',           categorie: 'EPICES',            unite: 'kg' },
  { name: 'KLAFIZ',           categorie: 'EPICES',            unite: 'kg' },
  { name: 'FJIL',             categorie: 'FRUITS ET LEGUMES', unite: 'kg' },
  { name: 'LENTILLES JAUNE',  categorie: 'PRODUIT ALIMENTAIRE', unite: 'kg' },
  { name: 'LENTILLES ROUGE',  categorie: 'PRODUIT ALIMENTAIRE', unite: 'kg' },
  { name: 'TOMATE FRAICHE',   categorie: 'FRUITS ET LEGUMES', unite: 'kg' },
  { name: 'ESCALOPE EMINCE',  categorie: 'VOLAILLES',         unite: 'kg' },
  { name: 'CREVETTE BISK',    categorie: 'FRUITS DE MER',     unite: 'u'  },
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
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
