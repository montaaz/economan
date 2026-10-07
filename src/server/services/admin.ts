'use server'

import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/server/db'
import { requireRole } from '@/server/auth/guards'
import { deleteArticle } from '@/server/services/stock'
import { chiffrerMotDePasse, dechiffrerMotDePasse } from '@/server/auth/password-vault'
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
  // Les fiches techniques le référencent aussi, sans cascade : la suppression
  // tombait en erreur brute de la base.
  const fiches = await prisma.recipe.count({ where: { departmentId: id } })
  if (fiches > 0) {
    return {
      ok: false,
      error: `Ce département porte ${fiches} fiche(s) technique(s). Désactivez-le plutôt que de le supprimer.`,
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
        ...(password ? { passwordHash: await bcrypt.hash(password, 10), passwordEnc: chiffrerMotDePasse(password) } : {}),
      },
    })
  } else {
    await prisma.user.create({
      data: {
        fullName, username, role, departmentId: deptForRole,
        passwordHash: await bcrypt.hash(password, 10),
        passwordEnc: chiffrerMotDePasse(password),
        avatarColor: DEPT_COLORS[Math.floor(Math.random() * DEPT_COLORS.length)],
      },
    })
  }

  revalidatePath('/admin/utilisateurs')
  revalidatePath('/')
  return { ok: true }
}

/**
 * Le mot de passe d'un compte, en clair — administration seule. Nul tant
 * qu'il n'est pas connu : fixé avant l'arrivée du coffre, il ne se lit qu'à
 * la prochaine connexion de l'utilisateur, ou quand l'administration en
 * donne un nouveau.
 */
export async function revealPassword(id: number): Promise<{ ok: boolean; password: string | null; error?: string }> {
  await requireRole(['ADMIN'], '/admin/login')
  const u = await prisma.user.findUnique({ where: { id }, select: { passwordEnc: true } })
  if (!u) return { ok: false, password: null, error: 'Utilisateur introuvable.' }
  return { ok: true, password: dechiffrerMotDePasse(u.passwordEnc) }
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
  // Les écritures de stock, préparations et ventes déclarées portent aussi
  // son nom, sans cascade : on le dit plutôt que de laisser la base refuser.
  const [entrees, preparations, declarees] = await Promise.all([
    prisma.stockEntry.count({ where: { createdById: id } }),
    prisma.preparation.count({ where: { createdById: id } }),
    prisma.declaredSale.count({ where: { createdById: id } }),
  ])
  const photos = await prisma.invoicePhoto.count({ where: { createdById: id } })
  if (entrees + preparations + declarees + photos > 0) {
    return {
      ok: false,
      error: `Ce compte a signé ${entrees + preparations + declarees + photos} écriture(s) de stock ou de contrôle. Désactivez-le plutôt que de le supprimer.`,
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

  // Un article retiré de la feuille reste au catalogue : le recréer sous le
  // même nom le remet simplement sur la feuille, au lieu de répondre qu'il
  // existe déjà.
  const clash = await prisma.product.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: {
      id: true, name: true, kind: true, categoryId: true,
      departments: { select: { departmentId: true, department: { select: { name: true } } } },
    },
  })
  if (clash?.kind === 'MERE') {
    return { ok: false, error: `« ${clash.name} » est un article pur : il ne se commande pas.` }
  }
  const ici = clash?.departments.find((d) => d.departmentId === departmentId)
  if (clash && ici) {
    return { ok: false, error: `L’article « ${clash.name} » est déjà sur la feuille de ${ici.department.name}.` }
  }

  await prisma.$transaction(async (tx) => {
    let productId: number
    let famille = categoryId
    if (clash) {
      productId = clash.id
      // Il ne sert à aucun autre département : il prend la famille et l'unité
      // choisies. Sinon il garde sa famille, que les autres feuilles utilisent.
      if (clash.departments.length === 0) {
        await tx.product.update({ where: { id: clash.id }, data: { categoryId, baseUnitId: unitId, isActive: true } })
      } else {
        famille = clash.categoryId
        await tx.product.update({ where: { id: clash.id }, data: { isActive: true } })
      }
      await tx.stockFixe.deleteMany({ where: { departmentId, productId } })
    } else {
      // Les références sont numériques : on repart du plus grand nombre utilisé.
      const refs = await tx.product.findMany({ select: { reference: true } })
      const next =
        Math.max(
          ...refs.map((r) => Number(r.reference)).filter((n) => Number.isFinite(n)),
          0,
        ) + 1
      productId = (await tx.product.create({
        data: {
          reference: String(next).padStart(4, '0'),
          name,
          categoryId,
          baseUnitId: unitId,
        },
        select: { id: true },
      })).id
    }

    await attachToSheet(tx, departmentId, productId, famille)

    if (quantity > 0) {
      await tx.stockFixe.create({
        data: { departmentId, productId, quantity },
      })
    }
  }, { timeout: 20_000 })

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
 * Place un article sur la feuille d'un département, à la fin de sa famille.
 *
 * La famille n'y figure pas encore (tous ses articles retirés, ou feuille
 * qui suivait les liens de familles) : l'article ouvre son bloc à la place
 * de la famille dans l'ordre du catalogue, pas tout en bas de la feuille.
 * Un département sans feuille propre reçoit d'abord la feuille qu'il voyait,
 * sans quoi il ne lui resterait que ce seul article.
 */
async function attachToSheet(
  tx: Prisma.TransactionClient,
  departmentId: number,
  productId: number,
  categoryId: number,
) {
  const feuille = (await feuilleFigee(tx, departmentId)).filter((r) => r.productId !== productId)
  // La DERNIÈRE ligne de la famille : s'arrêter au premier bloc en créait un
  // nouveau à chaque ajout dès que la famille apparaissait plusieurs fois.
  let at = -1
  feuille.forEach((r, i) => { if (r.product.categoryId === categoryId) at = i + 1 })
  if (at === -1) {
    const rangs = new Map((await tx.category.findMany({
      where: { id: { in: [...new Set([categoryId, ...feuille.map((r) => r.product.categoryId)])] } },
      select: { id: true, sortOrder: true },
    })).map((c) => [c.id, c.sortOrder]))
    const rang = rangs.get(categoryId) ?? 0
    at = feuille.findIndex((r) => (rangs.get(r.product.categoryId) ?? 0) > rang)
    if (at === -1) at = feuille.length
  }
  const ids = feuille.map((r) => r.productId)
  ids.splice(at, 0, productId)

  await tx.departmentProduct.upsert({
    where: { departmentId_productId: { departmentId, productId } },
    update: {},
    create: { departmentId, productId, sortOrder: 0 },
  })
  await tx.departmentCategory.upsert({
    where: { departmentId_categoryId: { departmentId, categoryId } },
    update: {},
    create: { departmentId, categoryId },
  })
  // Toute la feuille renumérotée d'une requête, par pas de 10.
  await tx.$executeRaw`
    UPDATE "department_products" AS d SET "sortOrder" = v.rang
    FROM (SELECT unnest(${ids}::int[]) AS pid, generate_series(10, ${ids.length * 10}, 10) AS rang) AS v
    WHERE d."departmentId" = ${departmentId} AND d."productId" = v.pid`
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

  // Depuis Stock fixe, le nom est celui de la feuille du département : les
  // autres départements gardent le leur.
  const departmentId = Number(form.get('departmentId')) || null
  if (departmentId) {
    const r = await nommerSurFeuille(departmentId, id, name)
    if (!r.ok) return r
    await prisma.product.update({ where: { id }, data: { categoryId, baseUnitId: unitId } })
  } else {
    const clash = await prisma.product.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, NOT: { id } },
      select: { name: true },
    })
    if (clash) return { ok: false, error: `L’article « ${clash.name} » existe déjà.` }

    await prisma.product.update({
      where: { id },
      data: { name, categoryId, baseUnitId: unitId },
    })
  }

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
    select: {
      name: true,
      // Tout ce qui le référence sans cascade : commandes, écritures de
      // stock, préparations (comme source ou comme résultat), fiches. Un
      // article ainsi lié se désactive ; le supprimer tombait en erreur brute.
      _count: { select: { lines: true, stockEntries: true, preparationsMade: true, preparationsFrom: true, recipeLines: true } },
    },
  })
  if (!product) return { ok: false, error: 'Article introuvable.' }

  const liens = product._count.lines + product._count.stockEntries + product._count.preparationsMade
    + product._count.preparationsFrom + product._count.recipeLines
  if (liens > 0) {
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
      error: `« ${product.name} » figure dans ${liens} ligne(s) de commande, de stock ou de fiche : il a été désactivé et retiré des feuilles, l’historique est conservé.`,
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
      await feuilleFigee(tx, departmentId)
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

    // Un département sans feuille propre la reçoit d'abord : sinon il ne lui
    // resterait que les articles de cette famille.
    await feuilleFigee(tx, departmentId)
    await tx.departmentCategory.upsert({
      where: { departmentId_categoryId: { departmentId, categoryId } },
      update: {},
      create: { departmentId, categoryId },
    })

    const products = await tx.product.findMany({
      where: { categoryId, isActive: true, kind: { not: 'MERE' } },
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
  }, { timeout: 20_000 })

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
      // Un département sans feuille propre voit ses articles par ses familles :
      // on fige d'abord sa feuille, sinon retirer un article ne retirait rien
      // et le compte à zéro qui suit détachait toute la famille.
      await feuilleFigee(tx, departmentId)
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

/* ------------------------------------------ familles d'une feuille */

/**
 * La feuille d'un département, article par article, dans son ordre. Un
 * département qui suivait encore ses familles (sans feuille propre) reçoit
 * ici une feuille figée telle qu'il la voyait : on peut alors la réordonner
 * sans toucher aux autres départements.
 */
async function feuilleFigee(tx: Prisma.TransactionClient, departmentId: number) {
  let feuille = await tx.departmentProduct.findMany({
    where: { departmentId, product: { isActive: true } },
    orderBy: { sortOrder: 'asc' },
    select: { productId: true, product: { select: { categoryId: true } } },
  })
  if (feuille.length === 0) {
    const catalogue = await tx.product.findMany({
      where: { isActive: true, kind: { not: 'MERE' }, category: { departments: { some: { departmentId } } } },
      orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
      select: { id: true, categoryId: true },
    })
    if (catalogue.length > 0) {
      await tx.departmentProduct.createMany({
        data: catalogue.map((x, i) => ({ departmentId, productId: x.id, sortOrder: (i + 1) * 10 })),
        skipDuplicates: true,
      })
    }
    feuille = catalogue.map((x) => ({ productId: x.id, product: { categoryId: x.categoryId } }))
  }
  return feuille
}

/**
 * Monte ou descend une famille sur la feuille d'un département : tout son
 * bloc d'articles passe avant (ou après) la famille voisine. Les articles
 * gardent leur ordre entre eux ; les autres départements ne bougent pas.
 */
export async function moveFamilyInSheet(departmentId: number, categoryId: number, sens: 'haut' | 'bas'): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')
  const fait = await prisma.$transaction(async (tx) => {
    const feuille = await feuilleFigee(tx, departmentId)
    // Les familles dans l'ordre où elles apparaissent ; leurs articles regroupés.
    const ordre: number[] = []
    const blocs = new Map<number, number[]>()
    for (const r of feuille) {
      const c = r.product.categoryId
      if (!blocs.has(c)) { blocs.set(c, []); ordre.push(c) }
      blocs.get(c)!.push(r.productId)
    }
    const i = ordre.indexOf(categoryId)
    if (i === -1) return 'absente'
    const j = sens === 'haut' ? i - 1 : i + 1
    if (j < 0 || j >= ordre.length) return 'bord'
    ;[ordre[i], ordre[j]] = [ordre[j], ordre[i]]
    const ids = ordre.flatMap((c) => blocs.get(c)!)
    // Une seule requête pour toute la feuille.
    await tx.$executeRaw`
      UPDATE "department_products" AS d SET "sortOrder" = v.rang
      FROM (SELECT unnest(${ids}::int[]) AS pid, generate_series(10, ${ids.length * 10}, 10) AS rang) AS v
      WHERE d."departmentId" = ${departmentId} AND d."productId" = v.pid`
    return 'ok'
  }, { timeout: 20_000 })
  if (fait === 'absente') return { ok: false, error: 'Cette famille n’est pas sur la feuille de ce département.' }
  if (fait === 'bord') return { ok: false, error: sens === 'haut' ? 'La famille est déjà en tête.' : 'La famille est déjà en dernier.' }
  revalidatePath('/admin/stock-fixe')
  revalidatePath('/employe/commande')
  return { ok: true }
}

/**
 * Retire une famille de la feuille d'UN département : ses articles en
 * sortent avec leur stock fixe. Ils restent au catalogue et sur les feuilles
 * des autres départements ; on les remet en ajoutant un article à la famille.
 */
export async function removeFamilyFromSheet(departmentId: number, categoryId: number): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')
  const n = await prisma.$transaction(async (tx) => {
    const feuille = await feuilleFigee(tx, departmentId)
    const ids = feuille.filter((r) => r.product.categoryId === categoryId).map((r) => r.productId)
    if (ids.length === 0) return 0
    await tx.departmentProduct.deleteMany({ where: { departmentId, productId: { in: ids } } })
    await tx.stockFixe.deleteMany({ where: { departmentId, productId: { in: ids } } })
    // La famille ne revient pas non plus par le chemin des catégories.
    await tx.departmentCategory.deleteMany({ where: { departmentId, categoryId } })
    return ids.length
  }, { timeout: 20_000 })
  if (n === 0) return { ok: false, error: 'Cette famille n’est pas sur la feuille de ce département.' }
  revalidatePath('/admin/stock-fixe')
  revalidatePath('/employe/commande')
  return { ok: true }
}

/**
 * Supprime une famille du catalogue.
 *
 * Avec `avecArticles`, ses articles partent avec elle : supprimés, ou
 * désactivés s'ils ont un historique (commandes, stock, fiches) pour que les
 * bons passés restent lisibles. Ils quittent toutes les feuilles. Sans, une
 * famille qui porte encore des articles est refusée.
 */
export async function deleteFamily(categoryId: number, avecArticles = false): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')
  const ids = (await prisma.product.findMany({ where: { categoryId, isActive: true }, select: { id: true } })).map((p) => p.id)
  if (ids.length > 0 && !avecArticles) {
    return { ok: false, error: `Cette famille porte encore ${ids.length} article(s).` }
  }
  try {
    for (const id of ids) await deleteArticle(id, true)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Suppression impossible.' }
  }
  const restants = await prisma.product.count({ where: { categoryId } })
  if (restants > 0) {
    // Des articles désactivés gardent leur historique : la famille se masque.
    await prisma.$transaction([
      prisma.departmentCategory.deleteMany({ where: { categoryId } }),
      prisma.category.update({ where: { id: categoryId }, data: { isActive: false } }),
    ])
  } else {
    await prisma.$transaction([
      prisma.departmentCategory.deleteMany({ where: { categoryId } }),
      prisma.category.deleteMany({ where: { id: categoryId } }),
    ])
  }
  revalidatePath('/admin/stock-fixe')
  revalidatePath('/employe/commande')
  return { ok: true }
}

/**
 * Met en service un autre jeu de stock fixe (1, 2 ou 3) pour un département.
 *
 * Le jeu actif est rangé dans sa réserve, le jeu choisi prend sa place dans
 * stock_fixe : dès la prochaine commande, le département commande avec lui.
 * Les commandes déjà passées gardent le stock fixe figé sur leurs lignes.
 */
export async function activateStockFixe(departmentId: number, slot: number): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')
  if (![1, 2, 3].includes(slot)) return { ok: false, error: 'Jeu de stock fixe inconnu.' }
  const dep = await prisma.department.findUnique({ where: { id: departmentId }, select: { activeStockFixe: true } })
  if (!dep) return { ok: false, error: 'Département introuvable.' }
  if (dep.activeStockFixe === slot) return { ok: true }
  const actif = dep.activeStockFixe
  await prisma.$transaction(async (tx) => {
    // Personne n'écrit la feuille pendant la bascule.
    await tx.$executeRaw`SELECT id FROM "departments" WHERE id = ${departmentId} FOR UPDATE`
    // 1. Le jeu en service retourne dans sa réserve, tel qu'il est.
    await tx.stockFixeSet.deleteMany({ where: { departmentId, slot: actif } })
    await tx.$executeRaw`
      INSERT INTO "stock_fixe_sets" ("departmentId", "slot", "productId", "quantity", "updatedAt")
      SELECT "departmentId", ${actif}::int, "productId", "quantity", now() FROM "stock_fixe" WHERE "departmentId" = ${departmentId}`
    // 2. Le jeu choisi entre en service.
    await tx.stockFixe.deleteMany({ where: { departmentId } })
    await tx.$executeRaw`
      INSERT INTO "stock_fixe" ("departmentId", "productId", "quantity", "updatedAt")
      SELECT "departmentId", "productId", "quantity", now() FROM "stock_fixe_sets"
       WHERE "departmentId" = ${departmentId} AND "slot" = ${slot} AND "quantity" > 0`
    await tx.department.update({ where: { id: departmentId }, data: { activeStockFixe: slot } })
  }, { timeout: 20_000 })
  revalidatePath('/admin/stock-fixe')
  revalidatePath('/employe/commande')
  return { ok: true }
}

/** Renomme une famille. Le nom est celui du catalogue : il change pour tous les départements. */
export async function renameFamily(categoryId: number, name: string): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')
  const nom = name.trim().replace(/\s+/g, ' ').toUpperCase()
  if (nom.length < 2) return { ok: false, error: 'Nom trop court.' }
  if (nom.length > 80) return { ok: false, error: 'Nom trop long.' }
  const doublon = await prisma.category.findFirst({ where: { name: { equals: nom, mode: 'insensitive' }, NOT: { id: categoryId } }, select: { name: true } })
  if (doublon) return { ok: false, error: `La famille « ${doublon.name} » existe déjà.` }
  const { count } = await prisma.category.updateMany({ where: { id: categoryId }, data: { name: nom } })
  if (count === 0) return { ok: false, error: 'Famille introuvable.' }
  revalidatePath('/admin/stock-fixe')
  revalidatePath('/employe/commande')
  return { ok: true }
}

/**
 * Le nom d'un article sur la feuille d'UN département. Le catalogue et les
 * autres départements gardent le leur : « MAIS » au Petit Déjeuner reste
 * « MAIS 0.285GR » en Cuisine. Reprendre le nom du catalogue efface le nom
 * propre. Les commandes passées gardent le nom qu'elles portaient.
 */
async function nommerSurFeuille(departmentId: number, productId: number, name: string): Promise<ActionResult> {
  const clean = name.trim()
  if (clean.length < 2) return { ok: false, error: 'Nom trop court.' }
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { name: true } })
  if (!product) return { ok: false, error: 'Article introuvable.' }

  return prisma.$transaction(async (tx) => {
    // Un département qui suivait ses familles reçoit d'abord sa feuille.
    await feuilleFigee(tx, departmentId)
    const feuille = await tx.departmentProduct.findMany({
      where: { departmentId, product: { isActive: true }, NOT: { productId } },
      select: { displayName: true, product: { select: { name: true } } },
    })
    const autre = feuille.find((r) => (r.displayName ?? r.product.name).toLowerCase() === clean.toLowerCase())
    if (autre) return { ok: false, error: `« ${clean} » est déjà sur cette feuille.` }
    const displayName = clean === product.name ? null : clean
    await tx.departmentProduct.upsert({
      where: { departmentId_productId: { departmentId, productId } },
      update: { displayName },
      create: { departmentId, productId, displayName, sortOrder: 1_000_000 },
    })
    return { ok: true as const }
  }, { timeout: 20_000 })
}

export async function renameProductInDepartment(departmentId: number, productId: number, name: string): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')
  const r = await nommerSurFeuille(departmentId, productId, name)
  if (!r.ok) return r
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

/**
 * Change l'unité d'un article, sans toucher au reste.
 *
 * L'unité n'est pas figée dans les commandes passées : chaque ligne garde la
 * sienne au moment de l'envoi, donc modifier l'article ici ne réécrit aucun
 * historique.
 */
export async function setProductUnit(id: number, unitId: number): Promise<ActionResult> {
  await requireRole(['ADMIN'], '/admin/login')

  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { id: true } })
  if (!unit) return { ok: false, error: 'Unité inconnue.' }

  const done = await prisma.product.updateMany({ where: { id }, data: { baseUnitId: unitId } })
  if (done.count === 0) return { ok: false, error: 'Article introuvable.' }

  revalidatePath('/admin/stock-fixe')
  revalidatePath('/admin/affectations')
  revalidatePath('/employe/commande')
  return { ok: true }
}
