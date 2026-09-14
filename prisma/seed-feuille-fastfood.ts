/**
 * Feuille de service fast food, reprise de la liste transmise.
 *
 * « CHAMPIGNON » figure deux fois sur la liste : ce sont les deux produits du
 * catalogue, le frais et la conserve. Les variantes retenues pour les lignes
 * à plusieurs candidats sont celles d'un service pizza : farine pizza, ketchup
 * 5 L, olives noires slice, harissa 2 kg, basilic frais, viande hachée HZ.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

/** Nom exact au catalogue, dans l'ordre de la liste. */
const FEUILLE: { section: string; articles: string[] }[] = [
  {
    section: 'VIANDES & POISSONS',
    articles: [
      'ESCALOPE',
      'ESCALOPE CRUNCHY',
      'VIANDE HACHEE HZ',        // « Viande Hachée »
      'FRUITS DE MER PIZZA',
      'THON 1.5KG',              // « THON »
      'PEPPERONI 250G',          // « PEPPERONI »
      'JAMBON FUME',
    ],
  },
  {
    section: 'FROMAGES',
    articles: ['MOZZARELLA', 'FROMAGE GRUYERE', 'PARMESAN', 'FROMAGE BLEU'],
  },
  {
    section: 'GARNITURE',
    articles: ['CHAMPIGNON FRAIS', 'SAUCE TOMATE'],
  },
  {
    section: 'BASE',
    articles: [
      'FARINE PIZZA 300 WARDA',  // « FARINE »
      'SEMOULE',
      'LEVURE BOULANGERE',
      "HUILE D'OLIVE",
    ],
  },
  {
    section: 'CREMES',
    articles: ['CREME LIQUIDE', 'CREME FRAICHE 45Gr', 'CREME BALSAMIQUE'],
  },
  {
    section: 'ACCOMPAGNEMENTS',
    articles: [
      'BASILIC',                 // frais
      'FRITES  SIMPLE',          // « FRITES »
      'TOMATE CERISE',
      'OLIVES NOIRES SLICE',     // « OLIVE SLICE »
    ],
  },
  {
    section: 'SAUCES',
    articles: [
      'KETCHUP 5L',              // « KETCHUP »
      'MAYONNAISE 5L',           // « MAYONAISE »
      'HARISSA 2KG',             // « HARISSA »
    ],
  },
  {
    // Le second « CHAMPIGNON » de la liste : la conserve.
    section: 'CONSERVES',
    articles: ['CHAMPIGNON BOITE 2KG'],
  },
  {
    section: 'EMBALLAGES',
    articles: ['PAQUET PANUZZO', 'PAQUET PIZZA'],
  },
]

async function main() {
  const dept = await prisma.department.findUniqueOrThrow({ where: { code: 'RES' } })

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
  console.log(`${dept.name} : ${n} articles affectés (liste : ${wanted.length} lignes)`)

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
