/**
 * Feuille de service Cuisine, reprise de la liste transmise.
 *
 * Premier chargement : le département n'avait pas de feuille, mais 283 cibles
 * de stock fixe héritées de l'ancien fonctionnement par catégories. Celles qui
 * ne correspondent à aucun article de la feuille sont supprimées.
 *
 * « MICRO-POUSSES » donne huit lignes, une par variété du catalogue, d'où 95
 * articles pour 88 lignes de papier.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const FEUILLE: { section: string; articles: string[] }[] = [
  {
    section: 'FRUITS DE MER',
    articles: [
      'DAURADE',
      'LOUP',
      'PASTA FRUIT DE MER',        // « PASTA FRT MER »
      'SAUTE FRUIT DE MER',        // « SAUTEE FRT MER »
      'CREVETTE GRILLE',           // « CREVETTE GRILLEE »
      'GRATIN FRUIT DE MER',       // « GRATIN FRT MER »
      'CHEVRETTE OJJA',
      'CREVETTE  BRIK',            // « CHEVRETTE BRICK »
      'SAUMON 150Gr',              // « SAUMON (150 gr) »
      'CARNAVAL',
      'CLOVIS',
      'MOULE',                     // « Moule 1/2 coq »
      'CREVETTE BISK',
    ],
  },
  {
    section: 'PATES',
    articles: [
      'SPAGHETTI', 'FELL', 'PENNE',
      'TAGLIATELLE 250Gr',         // « TAGLIATELLE »
      'RIZ',
      'CHORBA FRIK 250Gr',         // « CHORBA FRICK »
      "CHORBA LANGUE D'OISEAU 500Gr",
    ],
  },
  {
    section: 'FARINE & SAUCES',
    articles: [
      'FARINE PATISSIERE WARDA',   // « FARINE »
      'OEUFS',                     // « ŒUFS »
      'HUILE VEGETALE 5 L',        // « HUILE VEGETARIENNE »
      "HUILE D'OLIVE",
      'TOMATE DCT SICAM 0.800GR',  // « TOMATE CONCENTREE »
      'MAYONNAISE 5L',             // « MAYONNAISE »
      'FRITES  SIMPLE',            // « FRITE »
      'BRICK ARBI',                // « BRICK »
      'THON 1.5KG',                // « THON BRICK »
      'CHAPELURE',
      'PAIN DE MIE',
      'CREME LIQUIDE',
      'SAUCE CESARE 3L',           // « SAUCE CESAR »
      'SAUCE SOJA',
      'CREME BALSAMIQUE',
      'MAIS 0.285GR',              // « MAIS »
    ],
  },
  {
    section: 'LEGUMES',
    articles: [
      'POMME DE TERRE',
      'TOMATE FRAICHE',
      'TOMATE CERISE',
      'OIGNON',
      'CAROTTE',
      'CONCOMBRE',
      'AUBERGINE',
      'PIMENT DOUX',
      'CITRON',
      'AIL',
      'PERSIL',
      'BASILIC',
      'KLAFIZ',
      'FJIL',
      'PETIT POIS',                // « PETIT POIS CONGELES »
      'CHAMPIGNON FRAIS',
      'AVOCAT',
    ],
  },
  {
    section: 'DECORATIONS',
    articles: [
      'MIX FLEURS DE SAISON',      // « FLEURS »
      // « MICRO-POUSSES » : les huit variétés du catalogue.
      'MP AMARANTE', 'MP BETTERAVE', 'MP CHOU VERT', 'MP LENTILLES',
      'MP PETIT POIS', 'MP RADIS CERISE', 'MP RADIS POURPRE', 'MP ROQUETTE',
    ],
  },
  {
    section: 'VIANDE',
    articles: [
      'FILET DE BOEUF 250Gr',      // « filet de Bœuf (250-280) »
      'VIANDE HACHE CUISINE 180 G',// « Viande Hachée (180) »
      'MERGUEZ OJJA 150G',         // « MERGUEZ (150) »
      "SOURIS D'AGNEAU",
      'EMINCEE DE BOEUF 200Gr',    // « Emincé de Bœuf (200) »
    ],
  },
  {
    section: 'RAVIOLLI',
    articles: ['RAVIOLI SAUMON', 'RAVIOLI EPINARD', 'RAVIOLI VIANDE HACHE'],
  },
  {
    section: 'VOLAILLE',
    articles: [
      'CORDON BLEU',
      'SUPREME DE POULET FARCI',   // « POULET FARCI »
      'ESCALOPE',
      'ESCALOPE EMINCE',
    ],
  },
  { section: 'FROMAGE', articles: ['FROMAGE RAPE', 'PARMESAN'] },  // « FROMAGE RAPEE »
  {
    section: 'EPICES & FRUITS SECS',
    articles: [
      'LENTILLES JAUNE',
      'LENTILLES ROUGE',
      'PIMENT DE CAYENNE',
      'OLIVES NOIRES SLICE',       // « OLIVE NOIRES SLICES »
      'CAPRES',
      'CORNICHONS',                // « CORNICHON »
      'PAPRIKA HACHE',
      'PIMENT SECHE GROUNE',       // « PIMENT ROUGE »
      'POIVRE NOIR',
      'EPICE 4',                   // « 4 EPICES »
      'KORKOM',
      'SEL',
      'KAMOUN',
      'SAFRAN',                    // « SAFRON »
      'NOIX DE MUSCADE',
      'PORTION NOIX',              // « NOIX EN PORTIONS »
      'AMANDE EFFILE',             // « AMANDE EFFILEE »
      'ABRICOT SECHE',             // « ABRICOTS SECHES »
      'PISTACHE CONCASSE',
    ],
  },
]

async function main() {
  const dept = await prisma.department.findUniqueOrThrow({ where: { code: 'CUI' } })

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

    // Les cibles héritées de l'ancien fonctionnement par catégories visent des
    // articles absents de la feuille : elles n'ont plus d'objet.
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
