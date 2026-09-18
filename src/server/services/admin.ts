'use server'

import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/server/db'
import { requireRole } from '@/server/auth/guards'
import type { Role } from '@/generated/prisma/enums'
import type { Prisma } from '@/generated/prisma/client'

export type ActionResult = { ok: boolean; error?: string }

const DEPT_COLORS = ['#3b82f6', '#ef4444', '#ec4899', '#22c55e', '#a855f7', '#f59e0b', '#14b8a6']

/* ----------------------------------------------------------- départements */

export async function saveDepartment(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  const id = form.get('id') ? Number(form.get('id')) : null
  const name = String(form.get('name') ?? '').trim()
  const code = String(form.get('code') ?? '').trim().toUpperCase()
  const color = String(form.get('color') ?? '') || DEPT_COLORS[0]
  const icon = String(form.get('icon') ?? '').trim() || 'Building2'

  if (!name) return { ok: false, error: 'Le nom est obligatoire.' }
  if (!/^[A-Z0-9]{2,6}$/.test(code)) {
    return { ok: false, error: 'Le code doit faire 2 à 6 caractères (lettres ou chiffres).' }
  }

  // Le nom et le code sont uniques : on le vérifie pour rendre un message
  // lisible plutôt que de laisser remonter une erreur Postgres.
  const clash = await prisma.department.findFirst({
    where: { OR: [{ name }, { code }], ...(id ? { NOT: { id } } : {}) },
    select: { name: true, code: true },
  })
  if (clash) {
    return {
      ok: false,
      error: clash.name === name ? 'Ce nom existe déjà.' : 'Ce code existe déjà.',
    }
  }

  if (id) {
    await prisma.department.update({ where: { id }, data: { name, code, color, icon } })
  } else {
    const last = await prisma.department.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })
    await prisma.department.create({
      data: { name, code, color, icon, sortOrder: (last?.sortOrder ?? 0) + 10 },
    })
  }

  revalidatePath('/admin/departements')
  revalidatePath('/')
  return { ok: true }
}

export async function toggleDepartment(id: number, isActive: boolean): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')
  await prisma.department.update({ where: { id }, data: { isActive } })
  revalidatePath('/admin/departements')
  revalidatePath('/')
  return { ok: true }
}

export async function deleteDepartment(id: number): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  // Les commandes référencent le département en RESTRICT : une suppression
  // effacerait l'historique si elle passait. On propose la désactivation.
  const orders = await prisma.order.count({ where: { departmentId: id } })
  if (orders > 0) {
    return {
      ok: false,
      error: `Ce département porte ${orders} commande(s). Désactivez-le plutôt que de le supprimer.`,
    }
  }

  await prisma.user.updateMany({ where: { departmentId: id }, data: { departmentId: null } })
  await prisma.department.delete({ where: { id } })

  revalidatePath('/admin/departements')
  revalidatePath('/')
  return { ok: true }
}

/* ----------------------------------------------------------- affectations */

export async function setDepartmentCategories(
  departmentId: number,
  categoryIds: number[],
): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  await prisma.$transaction([
    prisma.departmentCategory.deleteMany({ where: { departmentId } }),
    prisma.departmentCategory.createMany({
      data: categoryIds.map((categoryId, i) => ({ departmentId, categoryId, sortOrder: i * 10 })),
      skipDuplicates: true,
    }),
  ])

  revalidatePath('/admin/affectations')
  revalidatePath('/')
  return { ok: true }
}

/* ------------------------------------------------------------ utilisateurs */

export async function saveUser(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  const id = form.get('id') ? Number(form.get('id')) : null
  const fullName = String(form.get('fullName') ?? '').trim()
  const username = String(form.get('username') ?? '').trim().toLowerCase()
  const role = String(form.get('role') ?? 'EMPLOYEE') as Role
  const departmentRaw = String(form.get('departmentId') ?? '')
  const departmentId = departmentRaw ? Number(departmentRaw) : null
  const password = String(form.get('password') ?? '')

  if (!fullName) return { ok: false, error: 'Le nom complet est obligatoire.' }
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return { ok: false, error: 'Identifiant : 3 à 32 caractères, minuscules, chiffres, . _ -' }
  }
  if (role === 'EMPLOYEE' && !departmentId) {
    return { ok: false, error: 'Un employé doit être rattaché à un département.' }
  }
  if (!id && password.length < 8) {
    return { ok: false, error: 'Le mot de passe doit faire au moins 8 caractères.' }
  }
  if (id && password && password.length < 8) {
    return { ok: false, error: 'Le nouveau mot de passe doit faire au moins 8 caractères.' }
  }

  const clash = await prisma.user.findFirst({
    where: { username, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  })
  if (clash) return { ok: false, error: 'Cet identifiant est déjà pris.' }

  // Un économe ou un admin n'appartient à aucun département.
  const deptForRole = role === 'EMPLOYEE' ? departmentId : null

  if (id) {
    await prisma.user.update({
      where: { id },
      data: {
        fullName, username, role, departmentId: deptForRole,
        ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
      },
    })
  } else {
    await prisma.user.create({
      data: {
        fullName, username, role, departmentId: deptForRole,
        passwordHash: await bcrypt.hash(password, 10),
        avatarColor: DEPT_COLORS[Math.floor(Math.random() * DEPT_COLORS.length)],
      },
    })
  }

  revalidatePath('/admin/utilisateurs')
  revalidatePath('/')
  return { ok: true }
}

export async function toggleUser(id: number, isActive: boolean): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')
  await prisma.user.update({ where: { id }, data: { isActive } })
  revalidatePath('/admin/utilisateurs')
  return { ok: true }
}

export async function deleteUser(id: number): Promise<ActionResult> {
  const actor = await requireRole(['ADMIN'], '/admin/login')
  if (actor.id === id) return { ok: false, error: 'Vous ne pouvez pas supprimer votre propre compte.' }

  const orders = await prisma.order.count({ where: { createdById: id } })
  if (orders > 0) {
    return {
      ok: false,
      error: `Ce compte porte ${orders} commande(s). Désactivez-le plutôt que de le supprimer.`,
    }
  }

  await prisma.user.delete({ where: { id } })
  revalidatePath('/admin/utilisateurs')
  return { ok: true }
}

/* ------------------------------------------------------- articles / feuille */

/**
 * Crée un article et l'ajoute à la feuille d'un département.
 *
 * Les deux vont ensemble : un article créé depuis cet écran est destiné à
 * cette feuille, et l'y placer dans un second temps se serait oublié. Il se
 * range en fin de sa famille, là où l'administrateur a cliqué.
 */
export async function createProductForDepartment(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  const departmentId = Number(form.get('departmentId'))
  const categoryId = Number(form.get('categoryId'))
  const unitId = Number(form.get('unitId'))
  const name = String(form.get('name') ?? '').trim()
  const quantityRaw = String(form.get('quantity') ?? '').replace(',', '.')

  if (!departmentId || !categoryId || !unitId) {
    return { ok: false, error: 'Département, famille et unité sont obligatoires.' }
  }
  if (name.length < 2) {
    return { ok: false, error: 'Le nom de l’article est obligatoire.' }
  }

  const quantity = quantityRaw === '' ? 0 : Number(quantityRaw)
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { ok: false, error: 'Stock fixe invalide.' }
  }

  const clash = await prisma.product.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true, name: true },
  })
  if (clash) {
    return { ok: false, error: `L’article « ${clash.name} » existe déjà au catalogue.` }
  }

  await prisma.$transaction(async (tx) => {
    // Les références sont numériques : on repart du plus grand nombre utilisé.
    const refs = await tx.product.findMany({ select: { reference: true } })
    const next =
      Math.max(
        ...refs.map((r) => Number(r.reference)).filter((n) => Number.isFinite(n)),
        0,
      ) + 1

    const product = await tx.product.create({
      data: {
        reference: String(next).padStart(4, '0'),
        name,
        categoryId,
        baseUnitId: unitId,
      },
      select: { id: true },
    })

    await attachToSheet(tx, departmentId, product.id, categoryId)

    if (quantity > 0) {
      await tx.stockFixe.create({
        data: { departmentId, productId: product.id, quantity },
      })
    }
  })

  revalidatePath('/admin/stock-fixe')
  revalidatePath('/employe/commande')
  return { ok: true }
}

/** Articles d'une famille, pour l'écran des affectations. */
export async function listCategoryProducts(categoryId: number) {
  await requireRole(['ADMIN'], '/admin/login')
  return prisma.product.findMany({
    where: { categoryId, isActive: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      reference: true,
      baseUnit: { select: { id: true, name: true, symbol: true } },
      _count: { select: { lines: true, departments: true } },
    },
  })
}

/**
 * Place un article en fin de son bloc de famille sur la feuille d'un
 * département, en décalant les suivants.
 *
 * La feuille suit l'ordre du papier, où une même famille peut s'ouvrir
 * plusieurs fois : on vise la fin du *premier* bloc, sans quoi l'article
 * atterrirait en fin de feuille.
 */
async function attachToSheet(
  tx: Prisma.TransactionClient,
  departmentId: number,
  productId: number,
  categoryId: number,
) {
  const sheet = await tx.departmentProduct.findMany({
    where: { departmentId },
    orderBy: { sortOrder: 'asc' },
    select: { productId: true, sortOrder: true, product: { select: { categoryId: true } } },
  })

  const first = sheet.findIndex((r) => r.product.categoryId === categoryId)
  let after: number | null = null
  if (first !== -1) {
    let i = first
    while (i + 1 < sheet.length && sheet[i + 1].product.categoryId === categoryId) i += 1
    after = sheet[i].sortOrder
  }

  if (after !== null) {
    for (const row of sheet.filter((r) => r.sortOrder > after)) {
      await tx.departmentProduct.update({
        where: { departmentId_productId: { departmentId, productId: row.productId } },
        data: { sortOrder: row.sortOrder + 10 },
      })
    }
  }

  await tx.departmentProduct.create({
    data: {
      departmentId,
      productId,
      sortOrder: after !== null ? after + 5 : (sheet.at(-1)?.sortOrder ?? 0) + 10,
    },
  })
}

/**
 * Crée un article dans une famille.
 *
 * Une famille est souvent partagée — EMBALAGES sert cinq départements — donc
 * une seule cible n'aurait pas de sens : le formulaire en propose une par
 * département concerné. Un département dont la cible est renseignée reçoit
 * l'article sur sa feuille ; les autres ne sont pas touchés.
 */
export async function createProduct(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  const categoryId = Number(form.get('categoryId'))
  const unitId = Number(form.get('unitId'))
  const name = String(form.get('name') ?? '').trim()

  if (!categoryId || !unitId) return { ok: false, error: 'Famille et unité sont obligatoires.' }
  if (name.length < 2) return { ok: false, error: 'Le nom de l’article est obligatoire.' }

  // Les cibles arrivent sous la forme « stock-<departmentId> ».
  const targets: { departmentId: number; quantity: number }[] = []
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('stock-')) continue
    const departmentId = Number(key.slice('stock-'.length))
    if (!departmentId) continue
    const raw = String(value).replace(',', '.').trim()
    const quantity = raw === '' ? 0 : Number(raw)
    if (!Number.isFinite(quantity) || quantity < 0) {
      return { ok: false, error: 'Stock fixe invalide.' }
    }
    if (quantity > 0) targets.push({ departmentId, quantity })
  }

  const clash = await prisma.product.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { name: true },
  })
  if (clash) return { ok: false, error: `L’article « ${clash.name} » existe déjà.` }

  await prisma.$transaction(async (tx) => {
    const refs = await tx.product.findMany({ select: { reference: true } })
    const next =
      Math.max(...refs.map((r) => Number(r.reference)).filter((n) => Number.isFinite(n)), 0) + 1

    const product = await tx.product.create({
      data: { reference: String(next).padStart(4, '0'), name, categoryId, baseUnitId: unitId },
      select: { id: true },
    })

    for (const t of targets) {
      await tx.stockFixe.create({
        data: { departmentId: t.departmentId, productId: product.id, quantity: t.quantity },
      })
      await attachToSheet(tx, t.departmentId, product.id, categoryId)
    }
  })

  revalidatePath('/admin/affectations')
  revalidatePath('/admin/stock-fixe')
  revalidatePath('/employe/commande')
  return { ok: true }
}

/** Renomme un article, change sa famille ou son unité. */
export async function updateProduct(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  const id = Number(form.get('id'))
  const categoryId = Number(form.get('categoryId'))
  const unitId = Number(form.get('unitId'))
  const name = String(form.get('name') ?? '').trim()

  if (!id) return { ok: false, error: 'Article introuvable.' }
  if (!categoryId || !unitId) return { ok: false, error: 'Famille et unité sont obligatoires.' }
  if (name.length < 2) return { ok: false, error: 'Le nom de l’article est obligatoire.' }

  const clash = await prisma.product.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, NOT: { id } },
    select: { name: true },
  })
  if (clash) return { ok: false, error: `L’article « ${clash.name} » existe déjà.` }

  await prisma.product.update({
    where: { id },
    data: { name, categoryId, baseUnitId: unitId },
  })

  revalidatePath('/admin/affectations')
  revalidatePath('/admin/stock-fixe')
  revalidatePath('/employe/commande')
  return { ok: true }
}

/**
 * Retire un article.
 *
 * Un article déjà commandé n'est jamais supprimé : les lignes de commande le
 * référencent, et un bon ancien deviendrait illisible. Il est désactivé, ce
 * qui le retire des feuilles sans toucher à l'historique.
 */
export async function deleteProduct(id: number): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  const product = await prisma.product.findUnique({
    where: { id },
    select: { name: true, _count: { select: { lines: true } } },
  })
  if (!product) return { ok: false, error: 'Article introuvable.' }

  if (product._count.lines > 0) {
    await prisma.$transaction([
      prisma.product.update({ where: { id }, data: { isActive: false } }),
      prisma.departmentProduct.deleteMany({ where: { productId: id } }),
      prisma.stockFixe.deleteMany({ where: { productId: id } }),
    ])
    revalidatePath('/admin/affectations')
    revalidatePath('/admin/stock-fixe')
    revalidatePath('/employe/commande')
    return {
      ok: true,
      error: `« ${product.name} » figure dans ${product._count.lines} ligne(s) de commande : il a été désactivé et retiré des feuilles, l’historique est conservé.`,
    }
  }

  await prisma.$transaction([
    prisma.departmentProduct.deleteMany({ where: { productId: id } }),
    prisma.stockFixe.deleteMany({ where: { productId: id } }),
    prisma.product.delete({ where: { id } }),
  ])

  revalidatePath('/admin/affectations')
  revalidatePath('/admin/stock-fixe')
  revalidatePath('/employe/commande')
  return { ok: true }
}

/* ---------------------------------------------------------------- familles */

/**
 * Crée une famille d'articles.
 *
 * Elle se range en fin de liste, et n'est affectée à aucun département : c'est
 * la matrice des affectations qui décide ensuite qui la commande.
 */
export async function createCategory(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  const name = String(form.get('name') ?? '').trim()
  const icon = String(form.get('icon') ?? '').trim() || null

  if (name.length < 2) return { ok: false, error: 'Le nom de la famille est obligatoire.' }

  const clash = await prisma.category.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { name: true },
  })
  if (clash) return { ok: false, error: `La famille « ${clash.name} » existe déjà.` }

  // Les départements cochés arrivent sous la forme « dep-<id> ».
  const departmentIds: number[] = []
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('dep-')) continue
    if (String(value) !== 'on') continue
    const id = Number(key.slice('dep-'.length))
    if (id) departmentIds.push(id)
  }

  const last = await prisma.category.findFirst({
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  await prisma.$transaction(async (tx) => {
    const category = await tx.category.create({
      data: { name, icon, sortOrder: (last?.sortOrder ?? 0) + 10 },
      select: { id: true },
    })

    // Affecter la famille dans la foulée évite un aller-retour par l'écran
    // des affectations : une famille que personne ne commande ne sert à rien.
    if (departmentIds.length > 0) {
      await tx.departmentCategory.createMany({
        data: departmentIds.map((departmentId, i) => ({
          departmentId,
          categoryId: category.id,
          sortOrder: i * 10,
        })),
        skipDuplicates: true,
      })
    }
  })

  revalidatePath('/admin/affectations')
  revalidatePath('/admin/stock-fixe')
  return { ok: true }
}

/* ------------------------------------------------------------------ unités */

/** Unités avec leur usage, pour l'écran de gestion. */
export async function listUnits() {
  await requireRole(['ADMIN'], '/admin/login')
  return prisma.unit.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      symbol: true,
      allowsDecimals: true,
      _count: { select: { products: true, orderLines: true } },
    },
  })
}

/** Crée une unité de mesure. */
export async function createUnit(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  const name = String(form.get('name') ?? '').trim()
  const symbol = String(form.get('symbol') ?? '').trim()
  const allowsDecimals = String(form.get('allowsDecimals') ?? '') === 'on'

  if (name.length < 2) return { ok: false, error: 'Le nom de l’unité est obligatoire.' }
  if (!symbol) return { ok: false, error: 'Le symbole est obligatoire.' }

  const clash = await prisma.unit.findFirst({
    where: {
      OR: [
        { name: { equals: name, mode: 'insensitive' } },
        { symbol: { equals: symbol, mode: 'insensitive' } },
      ],
    },
    select: { name: true, symbol: true },
  })
  if (clash) {
    return {
      ok: false,
      error: `L’unité « ${clash.name} » (${clash.symbol}) occupe déjà ce nom ou ce symbole.`,
    }
  }

  await prisma.unit.create({ data: { name, symbol, allowsDecimals } })

  revalidatePath('/admin/stock-fixe')
  return { ok: true }
}

/**
 * Renomme une unité ou change son symbole.
 *
 * Sans danger pour l'existant : articles et lignes de commande référencent
 * l'identifiant, pas le libellé. Le changement se répercute donc partout, y
 * compris sur les bons déjà imprimés si on les réimprime.
 */
export async function updateUnit(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  const id = Number(form.get('id'))
  const name = String(form.get('name') ?? '').trim()
  const symbol = String(form.get('symbol') ?? '').trim()
  const allowsDecimals = String(form.get('allowsDecimals') ?? '') === 'on'

  if (!id) return { ok: false, error: 'Unité introuvable.' }
  if (name.length < 2) return { ok: false, error: 'Le nom de l’unité est obligatoire.' }
  if (!symbol) return { ok: false, error: 'Le symbole est obligatoire.' }

  const clash = await prisma.unit.findFirst({
    where: {
      NOT: { id },
      OR: [
        { name: { equals: name, mode: 'insensitive' } },
        { symbol: { equals: symbol, mode: 'insensitive' } },
      ],
    },
    select: { name: true, symbol: true },
  })
  if (clash) {
    return {
      ok: false,
      error: `L’unité « ${clash.name} » (${clash.symbol}) occupe déjà ce nom ou ce symbole.`,
    }
  }

  await prisma.unit.update({ where: { id }, data: { name, symbol, allowsDecimals } })

  revalidatePath('/admin/stock-fixe')
  revalidatePath('/employe/commande')
  return { ok: true }
}

/**
 * Supprime une unité.
 *
 * Refusée dès qu'un article ou une ligne de commande l'utilise : contrairement
 * à un article, une unité n'a pas d'état « inactif » et la retirer casserait
 * les références.
 */
export async function deleteUnit(id: number): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  const unit = await prisma.unit.findUnique({
    where: { id },
    select: { name: true, _count: { select: { products: true, orderLines: true } } },
  })
  if (!unit) return { ok: false, error: 'Unité introuvable.' }

  const used = unit._count.products + unit._count.orderLines
  if (used > 0) {
    return {
      ok: false,
      error:
        `« ${unit.name} » est utilisée par ${unit._count.products} article(s) et ` +
        `${unit._count.orderLines} ligne(s) de commande : elle ne peut pas être supprimée.`,
    }
  }

  await prisma.unit.delete({ where: { id } })
  revalidatePath('/admin/stock-fixe')
  return { ok: true }
}

/* ------------------------------------------------- relations département */

/**
 * État complet des relations d'un département : ses familles, et pour chacune
 * les articles présents ou non sur sa feuille.
 *
 * C'est la feuille (`department_products`) qui fait foi — c'est elle que voit
 * l'employé. La case « famille » n'est donc pas un simple lien : elle indique
 * qu'au moins un article de cette famille est sur la feuille.
 */
export async function getDepartmentRelations(departmentId: number) {
  await requireRole(['ADMIN'], '/admin/login')

  const [categories, sheet, links] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        icon: true,
        products: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, reference: true, baseUnit: { select: { symbol: true } } },
        },
      },
    }),
    prisma.departmentProduct.findMany({
      where: { departmentId },
      select: { productId: true },
    }),
    prisma.departmentCategory.findMany({
      where: { departmentId },
      select: { categoryId: true },
    }),
  ])

  const onSheet = new Set(sheet.map((r) => r.productId))
  const linked = new Set(links.map((r) => r.categoryId))

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    // Le lien de catégorie seul ne suffit pas : d'anciennes affectations
    // pointent des familles dont aucun article n'est sur la feuille, et
    // l'employé ne verrait rien. Une famille vide n'est donc pas « cochée ».
    linked: linked.has(c.id) && c.products.some((p) => onSheet.has(p.id)),
    products: c.products.map((p) => ({
      id: p.id,
      name: p.name,
      reference: p.reference,
      symbol: p.baseUnit.symbol,
      onSheet: onSheet.has(p.id),
    })),
  }))
}

/**
 * Rattache ou détache une famille entière.
 *
 * Cocher une famille place tous ses articles sur la feuille : sans cela le
 * lien serait décoratif, puisque l'employé ne voit que la feuille. Décocher
 * les retire — le stock fixe correspondant part avec, il n'aurait plus de sens.
 */
export async function toggleDepartmentCategory(
  departmentId: number,
  categoryId: number,
  linked: boolean,
): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  await prisma.$transaction(async (tx) => {
    if (!linked) {
      const products = await tx.product.findMany({
        where: { categoryId },
        select: { id: true },
      })
      const ids = products.map((p) => p.id)
      await tx.departmentProduct.deleteMany({ where: { departmentId, productId: { in: ids } } })
      await tx.stockFixe.deleteMany({ where: { departmentId, productId: { in: ids } } })
      await tx.departmentCategory.deleteMany({ where: { departmentId, categoryId } })
      return
    }

    await tx.departmentCategory.upsert({
      where: { departmentId_categoryId: { departmentId, categoryId } },
      update: {},
      create: { departmentId, categoryId },
    })

    const products = await tx.product.findMany({
      where: { categoryId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true },
    })
    if (products.length === 0) return

    const last = await tx.departmentProduct.findFirst({
      where: { departmentId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })
    let order = (last?.sortOrder ?? 0) + 10

    await tx.departmentProduct.createMany({
      data: products.map((p) => ({ departmentId, productId: p.id, sortOrder: (order += 10) })),
      skipDuplicates: true,
    })
  })

  revalidatePath('/admin/stock-fixe')
  revalidatePath('/employe/commande')
  return { ok: true }
}

/**
 * Ajoute ou retire un article de la feuille d'un département.
 *
 * Retirer le dernier article d'une famille détache aussi la famille : garder
 * un lien vide laisserait croire que le département commande cette famille.
 */
export async function toggleDepartmentProduct(
  departmentId: number,
  productId: number,
  onSheet: boolean,
): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { categoryId: true },
  })
  if (!product) return { ok: false, error: 'Article introuvable.' }

  await prisma.$transaction(async (tx) => {
    if (!onSheet) {
      await tx.departmentProduct.deleteMany({ where: { departmentId, productId } })
      await tx.stockFixe.deleteMany({ where: { departmentId, productId } })

      const reste = await tx.departmentProduct.count({
        where: { departmentId, product: { categoryId: product.categoryId } },
      })
      if (reste === 0) {
        await tx.departmentCategory.deleteMany({
          where: { departmentId, categoryId: product.categoryId },
        })
      }
      return
    }

    await tx.departmentCategory.upsert({
      where: { departmentId_categoryId: { departmentId, categoryId: product.categoryId } },
      update: {},
      create: { departmentId, categoryId: product.categoryId },
    })
    await attachToSheet(tx, departmentId, productId, product.categoryId)
  })

  revalidatePath('/admin/stock-fixe')
  revalidatePath('/employe/commande')
  return { ok: true }
}

/* ------------------------------------------------- position sur la feuille */

/**
 * Déplace un article à une position donnée de la feuille d'un département.
 *
 * La position affichée est le rang dans la feuille, pas le `sortOrder` brut :
 * celui-ci avance par pas de 10 et comporte des trous après chaque insertion.
 * On renumérote donc toute la feuille d'un coup — quelques centaines de lignes
 * au plus, et l'écriture reste atomique.
 *
 * Renuméroter évite aussi que les trous se referment peu à peu, ce qui finirait
 * par rendre l'insertion entre deux lignes impossible.
 */
export async function moveProductInSheet(
  departmentId: number,
  productId: number,
  /** Position voulue, à partir de 1. */
  position: number,
): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  if (!Number.isInteger(position) || position < 1) {
    return { ok: false, error: 'La position doit être un entier supérieur à 0.' }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const sheet = await tx.departmentProduct.findMany({
        where: { departmentId, product: { isActive: true } },
        orderBy: { sortOrder: 'asc' },
        select: { productId: true },
      })

      const from = sheet.findIndex((r) => r.productId === productId)
      if (from === -1) throw new Error('INTROUVABLE')

      // Une position au-delà de la fin place l'article en dernier plutôt que
      // de refuser : c'est ce que veut dire « tout en bas ».
      const to = Math.min(position - 1, sheet.length - 1)
      if (to === from) return

      const ordered = sheet.map((r) => r.productId)
      ordered.splice(to, 0, ordered.splice(from, 1)[0])

      for (const [i, id] of ordered.entries()) {
        await tx.departmentProduct.update({
          where: { departmentId_productId: { departmentId, productId: id } },
          data: { sortOrder: (i + 1) * 10 },
        })
      }
    })
  } catch (e) {
    if (e instanceof Error && e.message === 'INTROUVABLE') {
      return { ok: false, error: 'Cet article ne figure pas sur la feuille de ce département.' }
    }
    throw e
  }

  revalidatePath('/admin/stock-fixe')
  revalidatePath('/employe/commande')
  return { ok: true }
}

/**
 * Renomme un article, sans toucher à sa famille ni à son unité.
 *
 * `updateProduct` exige un formulaire complet ; l'édition en place ne connaît
 * que le nom, et reconstruire les autres champs côté client risquerait de les
 * réécrire avec des valeurs périmées.
 */
export async function renameProduct(id: number, name: string): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  const clean = name.trim()
  if (clean.length < 2) return { ok: false, error: 'Nom trop court.' }

  const clash = await prisma.product.findFirst({
    where: { name: { equals: clean, mode: 'insensitive' }, NOT: { id } },
    select: { name: true },
  })
  if (clash) return { ok: false, error: `« ${clash.name} » existe déjà.` }

  const done = await prisma.product.updateMany({ where: { id }, data: { name: clean } })
  if (done.count === 0) return { ok: false, error: 'Article introuvable.' }

  revalidatePath('/admin/stock-fixe')
  revalidatePath('/admin/affectations')
  revalidatePath('/employe/commande')
  return { ok: true }
}
