/**
 * Portions de la feuille Pâtisserie, absentes du catalogue.
 *
 * Comme pour le Petit Déjeuner, une portion est un article distinct du vrac :
 * elle se compte à la pièce, le vrac au kilo.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const A_CREER = [
  { name: 'PORTION NOISETTE CONCASSE', categorie: 'FRUITS SECS ET GRAINES', unite: 'u' },
  { name: 'PORTION NOIX',              categorie: 'FRUITS SECS ET GRAINES', unite: 'u' },
  { name: 'PORTION ESCALOPE',          categorie: 'VOLAILLES',              unite: 'u' },
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
