/**
 * Affecte à chaque département les catégories qu'il commande réellement.
 * L'import reprend la base source où tout était affecté à tout le monde :
 * ici on donne à chaque service sa propre feuille.
 * Réglable ensuite depuis Administration → Affectations.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

/** Par code département : les catégories à cocher. */
const PLAN: Record<string, string[]> = {
  BAR: [
    'CAFES ET THE', 'JUS ET BOISSONS', 'SODA', 'COCKTAILS & SLUSHY', 'SIROP ET PURé',
    'COM BAR', 'GLACE', 'FRUITS & FRAICHEURS', 'EMBALAGES', 'DIVERS',
  ],
  CUI: [
    'PRODUIT ALIMENTAIRE', 'VIANDE', 'VOLAILLES', 'FRUITS DE MER', 'FRUITS ET LEGUMES',
    'EPICES', 'CONSERVES', 'FROMAGE ET LAITIERS', 'PIZZA', 'EMBALAGES', 'DIVERS',
  ],
  PAT: [
    'PATES ET CHOCOLATS', 'BISCUITS ET CHOCOLAT', 'DESSERT', 'FRUITS SECS ET GRAINES',
    'FROMAGE ET LAITIERS', 'GLACE', 'PRODUIT ALIMENTAIRE', 'EMBALAGES',
  ],
  RES: [
    'PREPARATION PETIT DEJ', 'SUPPLEMENTS PTIT DEJ', 'JUS ET BOISSONS', 'SODA',
    'FROMAGE ET LAITIERS', 'FRUITS ET LEGUMES', 'PRODUIT ALIMENTAIRE', 'EMBALAGES', 'DIVERS',
  ],
  HSK: ["PRODUITS D'ENTRETIEN", 'EMBALAGES', 'DIVERS'],
}

/** Département chicha : créé s'il n'existe pas, avec ses catégories dédiées. */
const CHICHA = {
  code: 'CHI',
  name: 'Chicha',
  color: '#a855f7',
  icon: 'Flame',
  categories: ['CHICHA', 'CHICHA HOOKAH', 'M3ASSEL', 'SUPPLEMENT CHICHA', 'DIVERS'],
}

async function main() {
  const categories = await prisma.category.findMany({ select: { id: true, name: true } })
  const idByName = new Map(categories.map((c) => [c.name, c.id]))

  // Département chicha
  let chicha = await prisma.department.findUnique({ where: { code: CHICHA.code } })
  if (!chicha) {
    const last = await prisma.department.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })
    chicha = await prisma.department.create({
      data: {
        name: CHICHA.name, code: CHICHA.code, color: CHICHA.color,
        icon: CHICHA.icon, sortOrder: (last?.sortOrder ?? 0) + 10,
      },
    })
    console.log(`département créé : ${CHICHA.name}`)
  }

  const plan: Record<string, string[]> = { ...PLAN, [CHICHA.code]: CHICHA.categories }
  const departments = await prisma.department.findMany({ select: { id: true, code: true, name: true } })

  for (const d of departments) {
    const wanted = plan[d.code]
    if (!wanted) {
      console.log(`${d.name.padEnd(14)} : aucun plan, laissé tel quel`)
      continue
    }

    const ids: number[] = []
    for (const name of wanted) {
      const id = idByName.get(name)
      if (id === undefined) {
        console.warn(`  ! catégorie inconnue : ${name}`)
        continue
      }
      ids.push(id)
    }

    await prisma.$transaction([
      prisma.departmentCategory.deleteMany({ where: { departmentId: d.id } }),
      prisma.departmentCategory.createMany({
        data: ids.map((categoryId, i) => ({ departmentId: d.id, categoryId, sortOrder: i * 10 })),
        skipDuplicates: true,
      }),
    ])

    const n = await prisma.product.count({
      where: { isActive: true, category: { departments: { some: { departmentId: d.id } } } },
    })
    console.log(`${d.name.padEnd(14)} : ${String(ids.length).padStart(2)} catégories → ${n} articles`)
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
