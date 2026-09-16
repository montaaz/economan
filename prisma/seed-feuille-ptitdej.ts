/**
 * Feuille de service Petit Déjeuner, reprise de la liste transmise.
 *
 * Premier chargement : le département n'avait ni feuille ni commande.
 * Les noms du papier ne sont pas toujours ceux du catalogue ; chaque
 * rapprochement est commenté à côté du nom retenu.
 *
 * « CHOCOLAT COUVERTURE » donne trois lignes — le catalogue distingue le lait,
 * le blanc et le noir — d'où 70 articles pour 68 lignes de papier.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const FEUILLE: { section: string; articles: string[] }[] = [
  {
    section: 'VOLAILLES & CHARCUTERIE',
    articles: [
      'BOULETTE BURGER',
      'ESCALOPE',                        // « ESCALOPE SANDWICH »
      'ESCALOPE ENERGY 0.170',           // « ESCALOPE ENERGY »
      'JAMBON DINDE',                    // « JAMBON DE DINDE »
      'JAMBON FUME',
      'JAMBON PARFUME',
      'SAUCISSE 40P',                    // « SAUCISSE »
      'STEAK DINDE',                     // « STEACK DE DINDE »
    ],
  },
  {
    section: 'FRUITS DE MER',
    articles: ['CHEVRETTE PET DEJ'],     // « CHEVRETTE PTIT DEJ »
  },
  {
    section: 'CHOCOLATS & BEURRE',
    articles: [
      'CHOCOLAT COUVERTURE AU LAIT',     // « CHOCOLAT COUVERTURE » : les trois
      'CHOCOLAT COUVERTURE BLANC DROPS',
      'CHOCOLAT COUVERTURE NOIR DROPS',
      'DOCREME PISTACHE',
      'NUTELLA',
      'MORGEN NOISETTE',
      'MORGEN CHOCOLAT NOIR',            // « MORJEN NOIR »
      'MIEL PUR',                        // « MIEL PURE »
      'BEURRE MARGARINE 4.5KG',          // « BEURRE MARGARINE »
      'BEURRE PUR',                      // « BEURRE PURE »
      'LAIT ENTIER',
    ],
  },
  { section: 'BISCUITS', articles: ['PORTORICAIN'] },
  {
    section: 'HUILES & CONSERVES & AUTRES',
    articles: [
      'HARISSA 2KG',
      'THON 1.5KG',                      // « THON »
      'TOMATE DCT SICAM 0.800GR',        // « TOMATE CONCENTRE »
      'MAIS 0.285GR',                    // « MAIS »
      'HOMMUS DURRA',
      'TAHINA PAPILLON 400Gr',           // « TAHINA PAPILOON »
      'HARISSA ARBI 1KG',                // « HARISSA ARBI »
      'OEUFS',                           // « ŒUFS »
      "HUILE D'OLIVE",
      'HUILE VEGETALE 5 L',              // « HUILE VEGETALE »
    ],
  },
  {
    section: 'EMBALLAGES',
    articles: [
      'BOX PTIT DEJ',
      'CURE MOZARELLA',
      'CURE DENTS BURGER',
      'CURE DENT 100 P',                 // « CURE DENTS JAMBON »
    ],
  },
  {
    section: 'LEGUMES & FRUITS',
    articles: ['BASILIC', 'TOMATE CERISE', 'KIWI', 'DATTE', 'PECHE', 'RAISIN'],
  },
  {
    section: 'FROMAGE',
    articles: [
      'FROMAGE DEMI SEL',                // « FROMAGE 1/2 SEL »
      'FROMAGE PERSIL',
      'EDAM',
      'FROMAGE CAMEMBERT',               // « CAMMEMEBERT »
      'MOZZARELLA',
      'MOZZARELLA CERISE',
      'GOUTELLA 2.5KG',                  // « GOUTELLA »
      'GOUTA 210Gr',                     // « GOUTA »
      'YAOURT NATURE',
    ],
  },
  {
    section: 'AUTRES',
    articles: [
      'POTATOES',
      'TOMATES SECHE',                   // « TOMATE SECHEE »
      'OLIVES VERTES',                   // « OLIVE VERT »
      'OLIVES VERTES SLICE',             // « OLIVE SLICES »
      'CORNICHONS',                      // « CORNICHON »
      'PIMENT DE CAYENNE',
      'LAURIER (RAND)',                  // « RAND »
      'KLIL W ZAATER FRAIS',             // « KLIL W ZAATER »
      'CHIA',
      'PAPRIKA HACHE',
      'BSISSA',
      'RECHTA SUCRE',
    ],
  },
  {
    section: 'BATTERIE',
    articles: [
      'AMANDE EFFILE',                   // « AMANDE EFFILEE »
      'AMANDE CONCASSE',                 // « AMANDE CONCASSEE »
      'PISTACHE CONCASSE',               // « PISTACHE CONCASSEE »
      'NOIX BROWNIES',
      'NOIX SAVEUR',
      'PORTION AMANDE EFFILEE',
      'PORTION AMANDE CONCASSE',
      'PORTION PISTACHE CONCASSE',
    ],
  },
]

async function main() {
  const dept = await prisma.department.findUniqueOrThrow({ where: { code: 'PTD' } })

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
    // Les familles suivent la feuille : sans elles, l'écran des affectations
    // afficherait un département sans aucune famille cochée.
    await tx.departmentCategory.createMany({
      data: [...familles].map((categoryId, i) => ({
        departmentId: dept.id,
        categoryId,
        sortOrder: i * 10,
      })),
      skipDuplicates: true,
    })
  })

  const n = await prisma.departmentProduct.count({ where: { departmentId: dept.id } })
  const f = await prisma.departmentCategory.count({ where: { departmentId: dept.id } })
  console.log(`${dept.name} : ${n} articles · ${f} familles (liste : ${wanted.length} lignes)`)

  const sansCible = await prisma.departmentProduct.count({
    where: { departmentId: dept.id, product: { stockFixe: { none: { departmentId: dept.id } } } },
  })
  console.log(`${sansCible} article(s) sans stock fixe — à régler dans l'administration`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
