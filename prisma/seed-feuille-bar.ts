/**
 * Feuille de service Bar & Comptoir, reprise des deux pages du document papier.
 *
 * Le catalogue porte deux gammes de sodas : les noms courts (catégorie JUS ET
 * BOISSONS) et les noms préfixés SODA. La première a été retenue — c'est la
 * seule qui contient aussi les eaux, SHARK, GARCI et BOGA MOJITO, tous présents
 * sur la feuille.
 *
 * Cinq lignes du papier n'ont aucun article au catalogue et sont omises :
 * schwips citron, snick bar, cornet glace, fruit sec thé gourmand, boga lemon,
 * goblet capucin. Elles sont listées en fin d'exécution, à créer depuis
 * l'administration puis à ajouter à la feuille.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

/** Nom exact au catalogue, dans l'ordre des sections du papier. */
const FEUILLE: { section: string; articles: string[] }[] = [
  // ---- Page 1 : Bar & Comptoir ----
  {
    section: 'SODA / EAUX',
    articles: [
      'APLA', 'BOGA CIDRE', 'BOGA MOJITO 1 L', 'COCA', 'COCA ZERO',
      'EAU 0.4L', 'EAU 1L', 'FANTA', 'GARCI  1L', 'ORANGINA', 'SHARK', 'SPRITE',
    ],
  },
  {
    section: 'CAFE',
    articles: ['CAFE MOKADOR', 'CAPSULE NESPRESSO', 'CAFE TURC', 'CAPUCCINO'],
  },
  {
    section: 'BISCUITS & CHOCOLATS & LAIT',
    articles: [
      'BISCUIT CRUNCHY CACAO', 'CHOCOLAT CHAUD', 'CHOCOLINE 280Gr',
      'FERRERO ROCHER', 'HLOU CAFE TURC', 'KINDER BUENO CHOCOLAT',
      'MARCHMELLO 17P', 'MIEL BAR', 'NESTLE 1KG', 'NUTELLA', 'OREO BISCUIT',
    ],
  },
  { section: 'FRUITS', articles: ['BANANE', 'CITRON', 'DATTE', 'KIWI'] },
  {
    section: 'GOBLETS & AUTRES',
    articles: [
      'AGITATEUR  CAFE', 'CURE DENT 100 P', 'GOBLET COCKTAIL', 'GOBLET DIRECT',
      'GOBLET EXPRESS', 'GOBLET PERSONNEL', 'PAILLES',
    ],
  },
  {
    section: 'PUREE',
    articles: [
      'PURE DE BANANE', 'PURE ANANAS', 'PURE FRAISE', 'PURE KIWI',
      'PURE DE MANGUE', 'PURE LYCHEE', 'PURE NOIX DE COCO',
      'PURE FRUIT DE PASSION', 'PURE PECHE', 'PURE POMME',
    ],
  },
  {
    section: 'JUS',
    articles: [
      "JUS D'ANANAS", 'JUS FRAISE', 'JUS KIWI', 'JUS DE MANGUE',
      "JUS D'ORANGE", 'CITRONNADE',
    ],
  },

  // ---- Page 2 ----
  {
    section: 'PATES',
    articles: [
      'PATE CARAMEL BEUR SALE', 'PATE FERRERO CRUNCHY', 'PATE NOISETTE',
      'PATE ORIO', 'PATE SPECULOSE CRUNCHY',
    ],
  },
  {
    section: 'FRUITS SECS',
    articles: [
      'ABRICOT SECHE', 'AMANDE CONCASSE', 'ANANAS TRANCHET', 'ANANAS SECHE',
      'FRAMBOISE CONGELE', 'GRANOLA', 'KIWI SECHE', 'MANGUE CONGELE',
      'MYRTILLE CONGELE', 'PIGNON', 'PISTACHE CONCASSE',
    ],
  },
  { section: 'AUTRES', articles: ['CHOUCH WARD', 'YAOURT JWEJEM'] },
  {
    section: 'SIROPS',
    articles: [
      'SIROP BLEU', 'SIROP CARAMEL', 'SIROP COOKIES', 'SIROP FRAISE',
      'SIROP FRAMBOISE', 'SIROP FRUIT DE BOIS', 'SIROP FRUITS DE PASSION',
      'SIROP GRENADINE', 'SIROP MANGUE', 'SIROP MENTHE', 'SIROP MOJITO',
      'SIROP NOISETTE', 'SIROP PECHE', 'SIROP PINACOLADA', 'SIROP POMME',
      'SIROP SPECULOS', 'SIROP TIRAMISSO', 'SIROP VANILLE',
    ],
  },
  {
    section: 'LAIT & AUTRES',
    articles: [
      'LAIT ENTIER', 'CREME CHANTILLY 700Gr', 'CREME FOUETTE',
      'SUCRE BUSINESS', 'SUCRE POUDRE', 'THE VERT 200Gr',
      'YAOURT GLACE', 'YAOURT GREECOS',
    ],
  },
]

/** Lignes du papier sans article au catalogue — à créer puis ajouter. */
const SANS_EQUIVALENT = [
  'schwips citron', 'snick bar', 'cornet glace',
  'fruit sec thé gourmand', 'boga lemon', 'goblet capucin',
  'sirop melon (absent du catalogue)',
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
    console.warn(`\n! ${missing.length} nom(s) introuvable(s) — vérifier l'orthographe :`)
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
  console.log(`${dept.name} : ${n} articles affectés (feuille papier : ${wanted.length} lignes retenues)`)

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

  console.log(`\n${SANS_EQUIVALENT.length} ligne(s) du papier sans article au catalogue :`)
  for (const s of SANS_EQUIVALENT) console.log(`    ${s}`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
