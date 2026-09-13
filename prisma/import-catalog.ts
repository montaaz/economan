/**
 * Reprend le catalogue réel de la base `economan` : unités, catégories,
 * départements, affectations département↔catégorie et les 544 articles.
 * Idempotent — relançable sans créer de doublons.
 */
import 'dotenv/config'
import { Client } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import bcrypt from 'bcryptjs'

const SOURCE_URL =
  process.env.SOURCE_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/economan'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const src = new Client({ connectionString: SOURCE_URL })
  await src.connect()

  // ---- Unités ------------------------------------------------------------
  const units = (
    await src.query<{ id: number; name: string; symbol: string; allowsDecimals: boolean }>(
      'SELECT id, name, symbol, "allowsDecimals" FROM units ORDER BY id',
    )
  ).rows
  for (const u of units) {
    await prisma.unit.upsert({
      where: { id: u.id },
      update: { name: u.name, symbol: u.symbol, allowsDecimals: u.allowsDecimals },
      create: { id: u.id, name: u.name, symbol: u.symbol, allowsDecimals: u.allowsDecimals },
    })
  }
  console.log(`unités       : ${units.length}`)

  // ---- Catégories --------------------------------------------------------
  const categories = (
    await src.query<{ id: number; name: string; description: string | null; icon: string | null; sortOrder: number }>(
      'SELECT id, name, description, icon, "sortOrder" FROM categories ORDER BY "sortOrder", id',
    )
  ).rows
  for (const c of categories) {
    await prisma.category.upsert({
      where: { id: c.id },
      update: { name: c.name, description: c.description, icon: c.icon, sortOrder: c.sortOrder },
      create: { id: c.id, name: c.name, description: c.description, icon: c.icon, sortOrder: c.sortOrder },
    })
  }
  console.log(`catégories   : ${categories.length}`)

  // ---- Départements ------------------------------------------------------
  const departments = (
    await src.query<{ id: number; name: string; code: string; color: string; isActive: boolean }>(
      'SELECT id, name, code, color, "isActive" FROM departments ORDER BY id',
    )
  ).rows
  const DEPT_ICON: Record<string, string> = {
    BAR: 'Martini',
    CUI: 'ChefHat',
    PAT: 'CakeSlice',
    RES: 'UtensilsCrossed',
    HSK: 'SprayCan',
  }
  let order = 0
  for (const d of departments) {
    const icon = DEPT_ICON[d.code] ?? 'Building2'
    await prisma.department.upsert({
      where: { id: d.id },
      update: { name: d.name, code: d.code, color: d.color, icon, sortOrder: order, isActive: d.isActive },
      create: { id: d.id, name: d.name, code: d.code, color: d.color, icon, sortOrder: order, isActive: d.isActive },
    })
    order += 10
  }
  console.log(`départements : ${departments.length}`)

  // ---- Affectations département ↔ catégorie ------------------------------
  const links = (
    await src.query<{ departmentId: number; categoryId: number }>(
      'SELECT "departmentId", "categoryId" FROM department_categories',
    )
  ).rows
  await prisma.departmentCategory.createMany({ data: links, skipDuplicates: true })
  console.log(`affectations : ${links.length}`)

  // ---- Articles ----------------------------------------------------------
  const products = (
    await src.query<{
      id: number
      reference: string
      name: string
      description: string | null
      imageUrl: string | null
      categoryId: number
      baseUnitId: number
      isActive: boolean
    }>(
      'SELECT id, reference, name, description, "imageUrl", "categoryId", "baseUnitId", "isActive" FROM products ORDER BY "categoryId", name',
    )
  ).rows
  let n = 0
  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {
        reference: p.reference, name: p.name, description: p.description, imageUrl: p.imageUrl,
        categoryId: p.categoryId, baseUnitId: p.baseUnitId, sortOrder: n, isActive: p.isActive,
      },
      create: {
        id: p.id, reference: p.reference, name: p.name, description: p.description, imageUrl: p.imageUrl,
        categoryId: p.categoryId, baseUnitId: p.baseUnitId, sortOrder: n, isActive: p.isActive,
      },
    })
    n += 10
  }
  console.log(`articles     : ${products.length}`)

  await src.end()

  // ---- Séquences ---------------------------------------------------------
  // Les id ont été imposés : on recale les séquences pour que les prochains
  // inserts ne rentrent pas en collision.
  for (const t of ['units', 'categories', 'departments', 'products']) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${t}"', 'id'), COALESCE((SELECT MAX(id) FROM "${t}"), 1))`,
    )
  }

  // ---- Comptes -----------------------------------------------------------
  const PASSWORD = 'Economan2026!'
  const hash = await bcrypt.hash(PASSWORD, 10)

  const staff = [
    { username: 'admin', fullName: 'Riadh Bohlel', role: 'ADMIN' as const, dept: null, color: '#1c4f96' },
    { username: 'economat', fullName: 'Kermen Naccache', role: 'ECONOMAN' as const, dept: null, color: '#0f9b6c' },
  ]
  for (const s of staff) {
    await prisma.user.upsert({
      where: { username: s.username },
      update: { fullName: s.fullName, role: s.role, avatarColor: s.color },
      create: { username: s.username, fullName: s.fullName, passwordHash: hash, role: s.role, avatarColor: s.color },
    })
  }

  const EMPLOYEES: Record<string, { username: string; fullName: string }> = {
    BAR: { username: 'bar', fullName: 'Karim Mejri' },
    CUI: { username: 'cuisine', fullName: 'Yassine Gharbi' },
    PAT: { username: 'patisserie', fullName: 'Leïla Hamdi' },
    RES: { username: 'restaurant', fullName: 'Mehdi Bouzid' },
    HSK: { username: 'housekeeping', fullName: 'Nadia Chaabane' },
  }
  for (const d of departments) {
    const e = EMPLOYEES[d.code]
    if (!e) continue
    await prisma.user.upsert({
      where: { username: e.username },
      update: { fullName: e.fullName, role: 'EMPLOYEE', departmentId: d.id, avatarColor: d.color },
      create: {
        username: e.username, fullName: e.fullName, passwordHash: hash,
        role: 'EMPLOYEE', departmentId: d.id, avatarColor: d.color,
      },
    })
  }
  console.log(`comptes      : ${staff.length + departments.length}  (mot de passe : ${PASSWORD})`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
