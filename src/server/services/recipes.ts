import 'server-only'
import { prisma } from '@/server/db'
import { normaliser } from '@/lib/search'
import { WorkflowError } from './orders'

/**
 * Les fiches techniques, et ce qu'elles font consommer.
 *
 * Le Z dit combien de pizzas se sont vendues ; la fiche dit ce qu'une pizza
 * emporte du stock — 300 g de pâte, 100 g de mozzarella. Le produit des deux
 * est la consommation théorique de la journée, article par article, celle
 * que le contrôle des stocks compare au comptage du rayon.
 */

/** Une quantité de fiche, ramenée à l'unité d'un article du stock. */
export function convertir(quantite: number, unite: string, uniteArticle: string): number | null {
  let u = unite.toLowerCase().replace(/\s/g, '')
  const a = uniteArticle.toLowerCase()
  // Une fiche écrit souvent « mozzarella 100 » : sans unité, sur un article
  // pesé c'est des grammes, sur un article mesuré des millilitres.
  if (u === '') {
    if (a === 'kg' || a === 'g') u = 'g'
    else if (a === 'l' || a === 'cl' || a === 'ml') u = 'ml'
  }
  // Masses.
  if (a === 'kg') {
    if (u === 'g' || u === 'gr') return quantite / 1000
    if (u === 'kg' || u === 'k') return quantite
    if (u === 'mg') return quantite / 1e6
    return null
  }
  if (a === 'g') {
    if (u === 'g' || u === 'gr') return quantite
    if (u === 'kg' || u === 'k') return quantite * 1000
    return null
  }
  // Volumes.
  if (a === 'l') {
    if (u === 'l') return quantite
    if (u === 'cl') return quantite / 100
    if (u === 'ml') return quantite / 1000
    return null
  }
  if (a === 'cl') {
    if (u === 'cl') return quantite
    if (u === 'l') return quantite * 100
    if (u === 'ml') return quantite / 10
    return null
  }
  if (a === 'ml') {
    if (u === 'ml') return quantite
    if (u === 'cl') return quantite * 10
    if (u === 'l') return quantite * 1000
    return null
  }
  // Pièces : u, p, pce, portion, sachet, bouteille… tout ce qui se compte.
  if (['u', 'p', 'pce', 'pcs', 'pièce', 'piece', 'b', 's', 'sachet', 'portion', 'unité', 'unite', ''].includes(u)) return quantite
  return null
}

/** « 150g », « 1p », « 30cl », « 1k », « 0,4p », « 100 » → quantité + unité. */
export function lireGrammage(brut: string): { quantity: number; unit: string } | null {
  const t = brut.trim().toLowerCase().replace(',', '.').replace(/\s+/g, '')
  if (!t) return null
  const m = t.match(/^(\d+(?:\.\d+)?)(?:\/(\d+))?([a-zéè]*)$/)
  if (!m) return null
  let q = Number(m[1]); if (m[2]) q = q / Number(m[2])
  let unit = m[3] || ''
  if (unit === 'k') unit = 'kg'
  if (unit === 'gr') unit = 'g'
  if (unit === 'pc' || unit === 'pce' || unit === 'pcs' || unit === 'portion') unit = 'p'
  if (!Number.isFinite(q)) return null
  return { quantity: q, unit }
}

/** Masse (g) ou volume (ml) d'une ligne, pour peser une préparation. */
function masse(quantity: number, unit: string): number {
  const u = unit.toLowerCase()
  if (u === 'g') return quantity
  if (u === 'kg') return quantity * 1000
  if (u === 'ml') return quantity
  if (u === 'cl') return quantity * 10
  if (u === 'l') return quantity * 1000
  return 0
}

export type Ligne = { quantity: number; unit: string; productId: number | null; subRecipeId: number | null }
export type Fiche = { id: number; departmentId: number; kind: 'PLAT' | 'PREPARATION'; lines: Ligne[] }

/**
 * Ce qu'une portion d'une fiche consomme, article par article, en unités
 * de chaque article — préparations développées au prorata de leur masse.
 */
export function consommationParPortion(
  fiche: Fiche, fiches: Map<number, Fiche>, unites: Map<number, string>, profondeur = 0,
): Map<number, number> {
  const out = new Map<number, number>()
  if (profondeur > 4) return out
  for (const l of fiche.lines) {
    if (l.productId !== null) {
      const q = convertir(Number(l.quantity), l.unit, unites.get(l.productId) ?? 'u')
      if (q !== null && q > 0) out.set(l.productId, (out.get(l.productId) ?? 0) + q)
      continue
    }
    if (l.subRecipeId !== null) {
      const sub = fiches.get(l.subRecipeId)
      if (!sub) continue
      // La préparation pèse la somme de ses ingrédients ; on en prend la part.
      const total = sub.lines.reduce((n, x) => n + masse(Number(x.quantity), x.unit), 0)
      const part = masse(Number(l.quantity), l.unit)
      const ratio = total > 0 && part > 0 ? part / total : (l.unit === 'p' || l.unit === '' ? Number(l.quantity) : 0)
      if (ratio <= 0) continue
      for (const [pid, q] of consommationParPortion(sub, fiches, unites, profondeur + 1)) {
        out.set(pid, (out.get(pid) ?? 0) + q * ratio)
      }
    }
  }
  return out
}

/**
 * La consommation théorique des ventes sur une période de journées de
 * service : par département de la fiche, par article, en unités de l'article.
 */
export async function consommationVentes(from: Date, to: Date): Promise<Map<number, Map<number, number>>> {
  const [ventes, fiches, produits] = await Promise.all([
    prisma.salesReportLine.findMany({
      where: { report: { businessDay: { gte: from, lte: to } } },
      select: { itemId: true, quantity: true },
    }),
    prisma.recipe.findMany({
      where: { isActive: true },
      select: { id: true, departmentId: true, kind: true, salesItemId: true, lines: { select: { quantity: true, unit: true, productId: true, subRecipeId: true } } },
    }),
    prisma.product.findMany({ select: { id: true, baseUnit: { select: { symbol: true } } } }),
  ])
  const unites = new Map(produits.map((p) => [p.id, p.baseUnit.symbol]))
  const parId = new Map<number, Fiche>(fiches.map((f) => [f.id, { id: f.id, departmentId: f.departmentId, kind: f.kind, lines: f.lines.map((l) => ({ quantity: Number(l.quantity), unit: l.unit, productId: l.productId, subRecipeId: l.subRecipeId })) }]))
  const parItem = new Map<number, Fiche>()
  for (const f of fiches) if (f.salesItemId !== null) parItem.set(f.salesItemId, parId.get(f.id)!)
  const out = new Map<number, Map<number, number>>()
  for (const v of ventes) {
    const f = parItem.get(v.itemId)
    if (!f) continue
    const q = Number(v.quantity)
    if (q <= 0) continue
    const dep = out.get(f.departmentId) ?? new Map<number, number>()
    for (const [pid, par] of consommationParPortion(f, parId, unites)) dep.set(pid, (dep.get(pid) ?? 0) + par * q)
    out.set(f.departmentId, dep)
  }
  return out
}

/** Rapprochement d'un libellé de fiche avec un article du stock : exact, puis contenu, puis mots. */
export function rapprocher(label: string, produits: { id: number; name: string }[]): number | null {
  const n = normaliser(label).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!n) return null
  const exact = produits.find((p) => normaliser(p.name) === n)
  if (exact) return exact.id
  const mots = n.split(' ').filter((m) => m.length > 2)
  if (mots.length === 0) return null
  let meilleur: { id: number; score: number } | null = null
  for (const p of produits) {
    const pn = normaliser(p.name)
    const pm = new Set(pn.split(/[^a-z0-9]+/).filter((m) => m.length > 2))
    // Tous les mots du libellé se retrouvent dans l'article (ou le préfixe) : bon candidat.
    const communs = mots.filter((m) => pm.has(m) || [...pm].some((x) => x.startsWith(m) || m.startsWith(x))).length
    if (communs === 0) continue
    const score = communs / mots.length - Math.abs(pm.size - mots.length) * 0.05
    if (communs === mots.length && (!meilleur || score > meilleur.score)) meilleur = { id: p.id, score }
  }
  return meilleur && meilleur.score >= 0.6 ? meilleur.id : null
}

export async function updateRecipeLine(params: { id: number; productId: number | null; subRecipeId: number | null; quantity: number; unit: string }) {
  if (!Number.isFinite(params.quantity) || params.quantity < 0) throw new WorkflowError('Quantité invalide.')
  if (params.productId !== null && params.subRecipeId !== null) throw new WorkflowError('Un ingrédient est un article ou une préparation, pas les deux.')
  return prisma.recipeLine.update({
    where: { id: params.id },
    data: { productId: params.productId, subRecipeId: params.subRecipeId, quantity: params.quantity, unit: params.unit.trim() || 'u' },
    select: { id: true },
  })
}

export async function createRecipe(params: {
  name: string
  departmentId: number
  kind: 'PLAT' | 'PREPARATION'
  /** Relier à un plat de la carte existant… */
  salesItemId: number | null
  /** …ou en créer un dans cette famille, au même nom. */
  createItemInFamilyId: number | null
}) {
  const name = params.name.trim()
  if (!name) throw new WorkflowError('Nommez la fiche.')
  const doublon = await prisma.recipe.findUnique({ where: { departmentId_name: { departmentId: params.departmentId, name } }, select: { id: true } })
  if (doublon) throw new WorkflowError(`Une fiche « ${name} » existe déjà pour ce service.`)
  let salesItemId = params.kind === 'PLAT' ? params.salesItemId : null
  if (params.kind === 'PLAT' && salesItemId === null && params.createItemInFamilyId !== null) {
    const existant = await prisma.salesItem.findUnique({ where: { familyId_name: { familyId: params.createItemInFamilyId, name } }, select: { id: true } })
    salesItemId = existant?.id ?? (await prisma.salesItem.create({ data: { name, familyId: params.createItemInFamilyId, departmentId: params.departmentId }, select: { id: true } })).id
  }
  if (salesItemId !== null) {
    const pris = await prisma.recipe.findFirst({ where: { salesItemId }, select: { name: true } })
    if (pris) throw new WorkflowError(`Ce plat de la carte est déjà relié à la fiche « ${pris.name} ».`)
  }
  return prisma.recipe.create({ data: { name, departmentId: params.departmentId, kind: params.kind, salesItemId, source: 'saisie' }, select: { id: true } })
}

export async function deleteRecipe(id: number) {
  const usages = await prisma.recipeLine.count({ where: { subRecipeId: id } })
  if (usages > 0) throw new WorkflowError(`Cette préparation entre dans ${usages} fiche(s) : retirez-la d’abord de celles-ci.`)
  return prisma.recipe.delete({ where: { id }, select: { id: true } })
}

export async function addRecipeLine(params: { recipeId: number; label: string; quantity: number; unit: string; productId: number | null; subRecipeId: number | null }) {
  const label = params.label.trim()
  if (!label) throw new WorkflowError('Nommez l’ingrédient.')
  if (!Number.isFinite(params.quantity) || params.quantity <= 0) throw new WorkflowError('Quantité invalide.')
  if (params.subRecipeId === params.recipeId) throw new WorkflowError('Une fiche ne peut pas se contenir elle-même.')
  const dernier = await prisma.recipeLine.aggregate({ where: { recipeId: params.recipeId }, _max: { sortOrder: true } })
  return prisma.recipeLine.create({
    data: { recipeId: params.recipeId, label, quantity: params.quantity, unit: params.unit.trim() || 'u', productId: params.productId, subRecipeId: params.subRecipeId, sortOrder: (dernier._max.sortOrder ?? -1) + 1 },
    select: { id: true },
  })
}

export async function deleteRecipeLine(id: number) {
  return prisma.recipeLine.delete({ where: { id }, select: { id: true } })
}

export async function linkRecipeItem(recipeId: number, salesItemId: number | null) {
  if (salesItemId !== null) {
    const deja = await prisma.recipe.findFirst({ where: { salesItemId, NOT: { id: recipeId } }, select: { name: true } })
    if (deja) throw new WorkflowError(`Cet article de la carte est déjà relié à la fiche « ${deja.name} ».`)
  }
  return prisma.recipe.update({ where: { id: recipeId }, data: { salesItemId }, select: { id: true } })
}
