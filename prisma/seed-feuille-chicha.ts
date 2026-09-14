/**
 * Feuille de service Chicha, reprise du document papier.
 *
 * Le catalogue porte deux gammes pour les mêmes parfums : M3ASSEL (au kilo)
 * et HOOKAH (à la pièce). Seule M3ASSEL couvre les quatorze lignes du papier
 * — HAWAII, LADY KILLER et DÉJÀ VU n'existent pas en HOOKAH. Le charbon et le
 * matériel closent la feuille : ils ne figurent pas sur ce papier mais le
 * service les consomme.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

/** Nom exact au catalogue, dans l'ordre de la feuille. */
const FEUILLE: { section: string; articles: string[] }[] = [
  {
    section: 'PARFUMS',
    articles: [
      'M3ASSEL MENTHE',
      'M3ASSEL RAISIN',
      'M3ASSEL PASTEQUE',
      'M3ASSEL MELON',
      'M3ASSEL CITRON',
      'M3ASSEL LOVE',
      'M3ASSEL ENJOY',
      'M3ASSEL CHWINGUM',
      'M3ASSEL HAWAY',        // « HAWAII » sur le papier
      'M3ASSEL MIAMOR',
      'M3ASSEL CHIKH MANI',   // « CHIKH MONEY » sur le papier
      'M3ASSEL POMME',
      'M3ASSEL LADY KILLER',
      'M32ASSEL DEJA VU',     // « DÉJÀ VU » sur le papier
    ],
  },
  { section: 'CHARBON & MATERIEL', articles: ['CHARBON', 'JABED CHICHA', 'MABSEM'] },
]

async function main() {
  const dept = await prisma.department.findUniqueOrThrow({ where: { code: 'CHI' } })

  const wanted = FEUILLE.flatMap((s) => s.articles)
  const found = await prisma.product.findMany({
    where: { name: { in: wanted }, isActive: true },
    select: { id: true, name: true },
  })
  const idByName = new Map(found.map((p) => [p.name, p.id]))

  const missing = wanted.filter((n) => !idByName.has(n))
  if (missing.length > 0) {
    console.warn(`\n! ${missing.length} article(s) introuvable(s) au catalogue :`)
    for (const m of missing) console.warn(`    ${m}`)
    console.warn('')
  }

  // La feuille est remplacée d'un bloc : pas de résidu d'un ancien réglage.
  await prisma.$transaction(async (tx) => {
    await tx.departmentProduct.deleteMany({ where: { departmentId: dept.id } })

    let order = 0
    const rows: { departmentId: number; productId: number; sortOrder: number }[] = []
    for (const s of FEUILLE) {
      for (const name of s.articles) {
        const id = idByName.get(name)
        if (id === undefined) continue
        rows.push({ departmentId: dept.id, productId: id, sortOrder: order })
        order += 10
      }
    }
    await tx.departmentProduct.createMany({ data: rows, skipDuplicates: true })
  })

  const n = await prisma.departmentProduct.count({ where: { departmentId: dept.id } })
  console.log(`${dept.name} : ${n} articles affectés (feuille papier : 14 parfums + 3 matériel)`)

  // Le stock fixe ne doit exister que pour les articles de la feuille.
  const removed = await prisma.stockFixe.deleteMany({
    where: { departmentId: dept.id, productId: { notIn: [...idByName.values()] } },
  })
  console.log(`stock fixe : ${removed.count} cible(s) hors feuille supprimée(s)`)

  const sansCible = await prisma.departmentProduct.findMany({
    where: {
      departmentId: dept.id,
      product: { stockFixe: { none: { departmentId: dept.id } } },
    },
    include: { product: { select: { name: true, baseUnit: { select: { symbol: true } } } } },
    orderBy: { sortOrder: 'asc' },
  })
  if (sansCible.length > 0) {
    console.log(`\n${sansCible.length} article(s) sans stock fixe — à régler dans l'administration :`)
    for (const s of sansCible) console.log(`    ${s.product.name} (${s.product.baseUnit.symbol})`)
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
