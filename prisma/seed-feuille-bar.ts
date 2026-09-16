/**
 * Feuille de service Bar & Comptoir — version du 16/09/2026.
 *
 * Remplace celle du 14/09 : les sections diffèrent sensiblement (pâtes et
 * fruits secs en vrac disparaissent, glaces, fruits de saison et décorations
 * apparaissent). L'historique des commandes n'est pas touché, les lignes de
 * commande figeant le nom des articles.
 *
 * Les noms du papier ne sont pas toujours ceux du catalogue : les
 * rapprochements évidents sont commentés ligne à ligne, et les choix qui
 * relevaient d'un arbitrage portent la mention « arbitrage ».
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const FEUILLE: { section: string; articles: string[] }[] = [
  {
    section: 'FRUITS SECS',
    articles: [
      'PORTIONS PIGNONS',
      'PORTIONS FRUITS SECS JWEJEM',
      'PORTIONS THE GOURMAND',
      'AMANDE FRAIS',
    ],
  },
  {
    section: 'EAUX & BOISSONS',
    articles: [
      'EAU 1L',                  // « EAUX 1L »
      'EAU 0.4L',                // « EAUX 0,4L »
      'GARCI  1L',               // « GARCI »
      'SHARK',
      'ORANGINA',
      'SPRITE',
      'SHWEPPES LIME',
      'SCHWEPPES TONIC',         // « SHWEPPES TONIC »
      'COCA ZERO',
      'FANTA',
      'COCA',                    // arbitrage : « COCA COLA » → COCA, gamme courte
      'APLA',
      'BOGA LIME',
      'BOGA CIDRE',
    ],
  },
  {
    section: 'JUS',
    articles: [
      'JUS ANNANS',
      'JUS DE MANGUE',           // « JUS MANGUE »
      "JUS D'ORANGE",
      'JUS FRAISE',
      'CITRONNADE',
      'JUS KIWI',
    ],
  },
  {
    section: 'CAFE & THE',
    articles: [
      'CAFE MOKADOR',
      'CAPSULE NESPRESSO',       // « NESPRESSO »
      'CHOCOLAT CHAUD',
      'CHOCOLINE 280Gr',         // « CHOCOLINE »
      'CAFE TURC',
      'THE VERT 200Gr',          // arbitrage : « THE »
      'THE INFUSION VERT',
      'THE INFUSION NOIR',
      'VERVEINE 25P',            // « VERVEINE »
    ],
  },
  {
    section: 'BISCUITS & CHOCOLAT',
    articles: [
      'FERRERO ROCHER',          // arbitrage : « FERRERO »
      'HLOU CAFE TURC',          // « HLOU CAFE TURC (2P) »
      'KINDER BUENO CHOCOLAT',   // arbitrage : « KINDER CHOCOLAT »
      'MARCHMELLO 17P',          // « MARCHMELLO »
      'OREO BISCUIT',            // « OREO »
      'CORNETS',
      'BISCUIT CRUNCHY SPECULOS',
      'PORTORICAIN',             // arbitrage : « PORTORICAIN CAFE PISTACHE »
    ],
  },
  {
    section: 'PUREE',
    articles: [
      'PURE DE BANANE',          // « PUREE BANANE »
      'PURE ANANAS',
      'PURE FRAISE',
      'PURE KIWI',
      'PURE DE MANGUE',
      'PURE NOIX DE COCO',       // « PUREE NOIS DE COCO »
      'PURE FRUIT DE PASSION',   // « PUREE PASSION FRTS »
      'PURE PECHE',
      'PURE POMME',
    ],
  },
  {
    section: 'SIROPS SAVEURS',
    articles: [
      'SIROP BLEU',
      'SIROP CARAMEL',
      'SIROP MANGUE',
      'SIROP FRAISE',
      'SIROP FRAMBOISE',
      'SIROP FRUIT DE BOIS',     // « SIROP FRUITS DE BOIS »
      'SIROP FRUITS DE PASSION',
      'SIROP MOJITO',
      'SIROP NOISETTE',
      'SIROP PECHE',
      'SIROP PINACOLADA',
      'SIROP POMME',
      'SIROP TIRAMISSO',         // « SIROP TIRAMISU »
      'SIROP VANILLE',
    ],
  },
  {
    section: 'LAIT & AUTRES',
    articles: [
      'LAIT ENTIER',             // arbitrage : « LAIT »
      'CREME FOUETTE',           // « CREME FOUETTER »
      'YAOURT GLACE',
      'YAOURT GREECOS',
      'YAOURT JWEJEM',
      'SUCRE POUDRE',
      'NESTLE 1KG',              // « NESTLE »
      'ANANAS TRANCHET',         // « ANANAS EN TRANCHE »
      'CREME CHANTILLY 700Gr',   // « CREME CHANTILLY »
    ],
  },
  {
    section: 'CHOCOLATS',
    articles: [
      'PATE CARAMEL BEUR SALE',  // « PATE CARAMEL »
      'PATE FERRERO CRUNCHY',    // « PATE FERRERO »
      'PATE NOISETTE',
      'NUTELLA',
      'MIEL BAR',                // arbitrage : « MIEL »
      'DOCREME PISTACHE',        // « DOKREME PISTACHE »
      'PATE SPECULOSE CRUNCHY',  // « PATE SPECULOS »
    ],
  },
  {
    section: 'GOBLETS & AUTRES',
    articles: [
      'SUCRE BUSINESS',
      'GOBLET DIRECT',           // « GOBLE DIRECT »
      'GOBLET CAPU',             // « GOBLET CAPUCIN »
      'GOBLET EXPRESS',
      'GOBLET COCKTAIL',         // « GOBLET COCKTAIL TRANSPARANT »
      'PAILLES',
      'AGITATEUR  CAFE',         // « AGITATEURS »
      'PINCES',
    ],
  },
  {
    section: 'GLACES & AUTRES',
    articles: [
      'GLACE NEUTRE 5L',         // « GLACE NEUTRE »
      'MYRTILLE CONGELE',        // « MERTYLLE CGL »
      'FRAMBOISE CONGELE',       // « FRAMBOISE CGL »
      'MANGUE CONGELE',          // « MANGUE CGL »
      'GLACE VANILLE',
      'GLACE FRAISE',
      'GLACE PISTACHE',
      'GLACE CHOCOLAT',
      'SORBET CITRON',
    ],
  },
  {
    section: 'FRUITS DE SAISON',
    articles: ['PECHE', 'KIWI', 'PASTEQUE', 'MELON', 'DATTE'],  // « DATTES »
  },
  {
    section: 'AUTRES',
    articles: [
      'KERFA',
      'KIWI SECHE',              // « KIWI SECHEE »
      'ANANAS SECHE',            // « ANANAS SECHEE »
      'GRANOLA',                 // arbitrage : « GRANULA »
      'CHOUCH WARD',
    ],
  },
  {
    section: 'DECORATIONS',
    articles: ['CORDON DECORATIF', 'FLEURS SECHES'],
  },
]

async function main() {
  const dept = await prisma.department.findUniqueOrThrow({ where: { code: 'BAR' } })

  const wanted = FEUILLE.flatMap((s) => s.articles)
  const found = await prisma.product.findMany({
    where: { name: { in: wanted }, isActive: true },
    select: { id: true, name: true },
  })
  const idByName = new Map(found.map((p) => [p.name, p.id]))

  const missing = wanted.filter((n) => !idByName.has(n))
  if (missing.length > 0) {
    console.warn(`\n! ${missing.length} nom(s) introuvable(s) :`)
    for (const m of missing) console.warn(`    ${m}`)
    console.warn('')
  }

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
  console.log(`${dept.name} : ${n} articles affectés (feuille papier : ${wanted.length} lignes)`)

  const removed = await prisma.stockFixe.deleteMany({
    where: { departmentId: dept.id, productId: { notIn: [...idByName.values()] } },
  })
  console.log(`stock fixe : ${removed.count} cible(s) hors feuille supprimée(s)`)

  const sansCible = await prisma.departmentProduct.count({
    where: { departmentId: dept.id, product: { stockFixe: { none: { departmentId: dept.id } } } },
  })
  console.log(`${sansCible} article(s) sans stock fixe — à régler dans l'administration`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
