/**
 * Feuille de service Pâtisserie, reprise ligne à ligne du document papier.
 *
 * L'ordre suit la feuille : colonne de gauche puis colonne de droite, section
 * par section. Dès qu'un département possède des lignes ici, sa feuille vaut
 * exactement cette liste — ses catégories ne s'appliquent plus.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

/** Nom exact au catalogue, dans l'ordre de la feuille. */
const FEUILLE: { section: string; articles: string[] }[] = [
  { section: 'FRUITS', articles: ['BANANE', 'KIWI'] },
  {
    section: 'BISCUITS & CHOCOLATS',
    articles: [
      'BISCUIT SAIDA 200Gr', 'OREO BISCUIT', 'POUDRE DE CACAO',
      'CHOCOLAT COUVERTURE BLANC DROPS', 'CHOCOLAT COUVERTURE NOIR DROPS',
      'NUTELLA', 'MIEL BAR', 'MIEL PUR', 'KINDER BUENO WHITE',
      'MORGEN NOISETTE', 'PATE CARAMEL BEUR SALE', 'PATE SPECULOSE CRUNCHY',
      'PATE LOTUS 400Gr',
    ],
  },
  {
    section: 'BEURRE & FROMAGES & ŒUFS',
    articles: [
      'FRAIDOUX 2.5KG', 'MASCARPONE ZANETTI 250G', 'MOZZARELLA',
      'BEURRE MARGARINE 4.5KG', 'LANGUE DE CHAT', 'OEUF DE LAMP ROUGE',
      'FARINE PATISSIERE WARDA',
    ],
  },
  { section: 'VOLAILLES & VIANDES', articles: ['ESCALOPE'] },
  {
    section: 'THON & FARINE & SAUCES',
    articles: ['HARISSA 2KG', "HUILE D'OLIVE", "SAUCE A L'AIL 5L", 'THON 1.5KG', 'CHAMPIGNON BOITE 2KG'],
  },
  {
    section: 'BATTERIE',
    articles: ['AMANDE CONCASSE', 'AMANDE EFFILE', 'NOISETTE CONCASSE', 'NOIX', 'PISTACHE CONCASSE'],
  },
  { section: 'FRUITS CONGELES', articles: ['FRAMBOISE CONGELE', 'MYRTILLE CONGELE'] },
  {
    section: 'LAITS & CREMES & AROMES',
    articles: [
      'LAIT DELICE', 'LAIT ENTIER', 'NESTLE 1KG', 'CREME CHANTILLY 700Gr',
      'CREME FOUETTE', 'CREME FRAICHE 45Gr', 'DOCREME NOISETTE CRUCHY',
      'DOCREME PISTACHE', 'CREME LIQUIDE', 'LEVURE PATISSIERE',
      'SUCRE BRUN', 'SUCRE GLACE', 'SUCRE POUDRE', 'SUCRE VANILLE',
      'AROME NATURELLE VANILLE', 'YAOURT GREECOS', 'AMIDON',
      'PURE FRUIT DE PASSION', 'GILK',
    ],
  },
  { section: 'DECORATIONS', articles: ["FEUILLE D'OR", 'CHOUCH WARD'] },
]

async function main() {
  const dept = await prisma.department.findUniqueOrThrow({ where: { code: 'PAT' } })

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
    console.warn('  (à créer depuis l’administration, puis relancer)\n')
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
  console.log(`${dept.name} : ${n} articles affectés (feuille papier : ${wanted.length})`)

  // Le stock fixe ne doit exister que pour les articles de la feuille.
  const removed = await prisma.stockFixe.deleteMany({
    where: {
      departmentId: dept.id,
      productId: { notIn: [...idByName.values()] },
    },
  })
  console.log(`stock fixe : ${removed.count} cible(s) hors feuille supprimée(s)`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
