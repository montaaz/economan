/**
 * Feuille de service Pâtisserie — version du 16/09/2026.
 *
 * Remplace celle reprise du document papier précédent. Les cibles de stock
 * fixe des articles conservés survivent ; seules celles des articles retirés
 * sont supprimées, n'ayant plus d'objet.
 *
 * Les noms du papier ne sont pas toujours ceux du catalogue : chaque
 * rapprochement est commenté à côté du nom retenu.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const FEUILLE: { section: string; articles: string[] }[] = [
  { section: 'FRUITS', articles: ['BANANE', 'KIWI'] },
  {
    section: 'CHOCOLATS & DIVERS',
    articles: [
      'NUTELLA',
      'DOCREME PISTACHE',              // « DOKREM PISTACHE »
      'DOCREME NOISETTE CRUCHY',       // « DOKREM NOISETTE CRUNCHY »
      'MORGEN NOISETTE',
      'MORGEN CHOCOLAT NOIR',          // « MORGEN NOIRE »
      'PATE CARAMEL BEUR SALE',        // « CARAMEL BEURRE SALE »
      'SAUCE CARAMEL  TRILECE',        // « CARAMEL TRILECE »
      'PURE FRAISE',                   // « PUREE FRAISE »
      'KINDER BUENO WHITE',            // « KINDER WHITE »
      'PATE LOTUS 400Gr',              // « PATE LOTUS »
    ],
  },
  {
    section: 'PRODUITS LAITIERS & ŒUFS',
    articles: [
      'LAIT DELICE',                   // « LAIT »
      'LAIT ENTIER',
      'MOZZARELLA',                    // « MOZARELLA »
      'HUILE VEGETALE 5 L',            // « HUILE VEGETALE »
      'BEURRE MARGARINE 4.5KG',        // « BEURRE MARGARINE »
      'FRAIDOUX 2.5KG',                // « FRAIDOUX »
      'MASCARPONE ZANETTI 250G',       // « MASCARPONE »
      'CREME FOUETTE',                 // « CREME FOUETTER »
      'CREME LIQUIDE',
      'CREME FRAICHE 45Gr',            // « CREME FRAICHE »
      'YAOURT GREECOS',
    ],
  },
  {
    section: 'THON & FARINE & SAUCES',
    articles: [
      'HARISSA 2KG',                   // « HARISSA »
      "HUILE D'OLIVE",
      "SAUCE A L'AIL",
      'THON 1.5KG',                    // « THON »
      'CHAMPIGNON FRAIS',              // « CHAMPIGNON »
    ],
  },
  { section: 'LEGUMES', articles: ['BASILIC', 'TOMATE CERISE'] },  // « BASILIC FRAIS »
  {
    section: 'BATTERIE',
    articles: [
      'GRANOLA',                       // « GRANULA »
      'AMANDE EFFILE',                 // « AMANADE EFFILE »
      'PORTION NOISETTE CONCASSE',     // « NOISETTE CONCASSE EN PORTIONS »
      'PORTION NOIX',                  // « NOIX EN PORTIONS »
      'PISTACHE CONCASSE',
      'CHOUCH WARD',
    ],
  },
  {
    section: 'BISCUITS & PREPARATIONS',
    articles: [
      'OEUFS',                         // « ŒUFS »
      'FARINE PATISSIERE WARDA',       // « FARINE PATISSIERE »
      'SUCRE POUDRE',
      'SUCRE GLACE',
      'SUCRE VANILLE',
      'SUCRE BRUN',
      'LEVURE PATISSIERE',
      'AMIDON',
      'GILK',
      'CREME CHANTILLY 700Gr',         // « CREME CHANTILLY »
      'NESTLE 1KG',                    // « NESTLE »
      'BISCUIT CRUCHY SPECULOS',       // « BISCUITS CRUNCHY SPECULOS »
      'LANGUE DE CHAT',                // « LANGUE DU CHAT »
      'OREO BISCUIT',                  // « OREO »
      'BISCUIT LOTUS 250Gr',           // « BISCUIT LOTUS »
      'CHOCOLAT COUVERTURE NOIR DROPS',
      'CHOCOLAT COUVERTURE AU LAIT',
      'CHOCOLAT COUVERTURE BLANC DROPS',
      'AROME NATURELLE VANILLE',       // « AROME VANILLE »
      'POUDRE DE CACAO',
    ],
  },
  { section: 'VOLAILLES & VIANDES', articles: ['PORTION ESCALOPE'] },
]

async function main() {
  const dept = await prisma.department.findUniqueOrThrow({ where: { code: 'PAT' } })

  const wanted = FEUILLE.flatMap((s) => s.articles)
  const found = await prisma.product.findMany({
    where: { name: { in: wanted }, isActive: true },
    select: { id: true, name: true, categoryId: true },
  })
  const byName = new Map(found.map((p) => [p.name, p]))

  const missing = wanted.filter((n) => !byName.has(n))
  if (missing.length > 0) {
    console.warn(`\n! ${missing.length} introuvable(s) :`)
    for (const m of missing) console.warn(`    ${m}`)
    console.warn('')
  }

  const cibleAvant = await prisma.stockFixe.count({ where: { departmentId: dept.id } })

  await prisma.$transaction(async (tx) => {
    await tx.departmentProduct.deleteMany({ where: { departmentId: dept.id } })
    await tx.departmentCategory.deleteMany({ where: { departmentId: dept.id } })

    let order = 0
    const rows: { departmentId: number; productId: number; sortOrder: number }[] = []
    const familles = new Set<number>()
    for (const s of FEUILLE) {
      for (const name of s.articles) {
        const p = byName.get(name)
        if (!p) continue
        rows.push({ departmentId: dept.id, productId: p.id, sortOrder: order })
        familles.add(p.categoryId)
        order += 10
      }
    }
    await tx.departmentProduct.createMany({ data: rows, skipDuplicates: true })
    await tx.departmentCategory.createMany({
      data: [...familles].map((categoryId, i) => ({
        departmentId: dept.id, categoryId, sortOrder: i * 10,
      })),
      skipDuplicates: true,
    })

    // Les cibles des articles conservés restent ; celles des articles sortis
    // de la feuille n'ont plus d'objet.
    await tx.stockFixe.deleteMany({
      where: { departmentId: dept.id, productId: { notIn: [...byName.values()].map((p) => p.id) } },
    })
  })

  const n = await prisma.departmentProduct.count({ where: { departmentId: dept.id } })
  const f = await prisma.departmentCategory.count({ where: { departmentId: dept.id } })
  const cibleApres = await prisma.stockFixe.count({ where: { departmentId: dept.id } })
  console.log(`${dept.name} : ${n} articles · ${f} familles (liste : ${wanted.length} lignes)`)
  console.log(`stock fixe : ${cibleApres} cible(s) conservée(s) sur ${cibleAvant}`)
  console.log(`${n - cibleApres} article(s) sans stock fixe`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
