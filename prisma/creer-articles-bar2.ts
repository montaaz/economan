/**
 * Articles de la feuille Bar du 16/09 absents du catalogue.
 *
 * Les unités suivent celles de leur section : les portions et les emballages
 * à la pièce, les jus au litre, les décorations à la pièce.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const A_CREER = [
  { name: 'PORTIONS PIGNONS',            categorie: 'FRUITS SECS ET GRAINES', unite: 'u' },
  { name: 'PORTIONS FRUITS SECS JWEJEM', categorie: 'FRUITS SECS ET GRAINES', unite: 'u' },
  { name: 'PORTIONS THE GOURMAND',       categorie: 'FRUITS SECS ET GRAINES', unite: 'u' },
  { name: 'SHWEPPES LIME',               categorie: 'JUS ET BOISSONS',        unite: 'u' },
  { name: 'JUS ANNANS',                  categorie: 'JUS ET BOISSONS',        unite: 'L' },
  { name: 'THE INFUSION NOIR',           categorie: 'CAFES ET THE',           unite: 'u' },
  { name: 'CORNETS',                     categorie: 'EMBALAGES',              unite: 'u' },
  { name: 'BISCUIT CRUNCHY SPECULOS',    categorie: 'PRODUIT ALIMENTAIRE',    unite: 'kg' },
  { name: 'PINCES',                      categorie: 'EMBALAGES',              unite: 'u' },
  { name: 'CORDON DECORATIF',            categorie: 'EMBALAGES',              unite: 'u' },
  { name: 'FLEURS SECHES',               categorie: 'FRUITS SECS ET GRAINES', unite: 'u' },
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
      console.log(`${a.name.padEnd(30)} existe déjà`)
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
    console.log(`${p.name.padEnd(30)} créé — réf ${p.reference}, ${a.unite}, ${a.categorie}`)
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
