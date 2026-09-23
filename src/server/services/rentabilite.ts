import 'server-only'
import { prisma } from '@/server/db'
import { bases, livraisons, conversion } from './stock'
import { consommationParPortion, type Fiche } from './recipes'

/**
 * Achats contre ventes : est-ce qu'on gagne de l'argent sur ce qu'on vend ?
 *
 * Côté ventes, le Z dit combien de chaque plat s'est vendu, et à quel prix
 * (le chiffre d'affaires de la ligne quand le Z le donne, sinon le prix de
 * la carte). Côté achats, la fiche technique dit ce qu'une portion emporte
 * du stock, et les arrivages disent ce que chaque article a coûté en moyenne.
 * Le produit des deux est le coût matière de ce qui s'est vendu ; la marge,
 * c'est ce qui reste — par plat, par article, par département, en tout.
 *
 * Pour un article, on regarde trois quantités : ce qu'on en a acheté, ce que
 * les départements en ont reçu, et ce que les ventes en ont consommé d'après
 * les fiches. Reçu plus que vendu, c'est de l'argent parti sans être vendu.
 * Le chiffre d'affaires d'un plat se répartit entre ses ingrédients au
 * prorata de leur coût : un article vendu tel quel (une canette) touche tout
 * le prix ; la mozzarella d'une pizza en touche sa part.
 */

export type Plat = {
  salesItemId: number
  name: string
  familyName: string
  departmentId: number | null
  /** Quantité vendue sur la période (Z). */
  quantity: number
  /** Prix de vente unitaire : CA ÷ quantité, ou le prix de la carte. Nul si inconnu. */
  unitPrice: number | null
  /** Chiffre d'affaires. Nul si aucun prix n'est connu. */
  revenue: number | null
  /** Coût matière d'une portion, d'après la fiche et le coût moyen des arrivages. Nul sans fiche. */
  unitCost: number | null
  cost: number | null
  margin: number | null
  /** Marge ÷ CA, en %. */
  marginRate: number | null
  /** La fiche existe-t-elle ? */
  hasRecipe: boolean
  /** Lignes de la fiche sans article de stock, ou dont l'article n'a pas de coût : le coût est sous-estimé. */
  incompleteLines: number
}

export type Article = {
  productId: number
  name: string
  unitSymbol: string
  categoryName: string
  /** Coût moyen d'achat, par unité. Nul sans arrivage. */
  unitCost: number | null
  /** Acheté sur la période (arrivages). */
  purchasedQty: number
  purchasedValue: number
  /** Livré aux départements sur la période, au coût moyen. */
  deliveredQty: number
  deliveredValue: number
  /** Consommé par les ventes d'après les fiches, au coût moyen. */
  soldQty: number
  soldValue: number
  /** Part du chiffre d'affaires des plats que cet article a rapportée. */
  revenue: number
  /** CA attribué moins coût de ce qui a été consommé. */
  margin: number
  /** Livré moins consommé : positif, on a sorti plus que les ventes n'expliquent. */
  gapQty: number
  gapValue: number
}

export type Rentabilite = {
  revenue: number
  cost: number
  margin: number
  marginRate: number | null
  purchasedValue: number
  deliveredValue: number
  /** Plats vendus sans prix connu : le CA est incomplet. */
  unpricedCount: number
  /** Plats vendus sans fiche : le coût est incomplet. */
  unrecipedCount: number
  plats: Plat[]
  articles: Article[]
  departments: { departmentId: number; revenue: number; cost: number; margin: number; marginRate: number | null; deliveredValue: number; plats: Plat[]; articles: Article[] }[]
}

const taux = (marge: number, ca: number) => (ca > 0 ? (marge / ca) * 100 : null)

export async function rentabilite(from: Date | null, to: Date | null): Promise<Rentabilite> {
  const jour = from || to ? { ...(from && { gte: from }), ...(to && { lte: to }) } : undefined
  const [ventes, fiches, produits, base, sorties, versStock, arrivages, departements] = await Promise.all([
    prisma.salesReportLine.findMany({
      where: jour ? { report: { businessDay: jour } } : undefined,
      select: { itemId: true, quantity: true, amount: true, item: { select: { name: true, price: true, departmentId: true, family: { select: { name: true } } } } },
    }),
    prisma.recipe.findMany({
      where: { isActive: true },
      select: { id: true, departmentId: true, kind: true, salesItemId: true, lines: { select: { quantity: true, unit: true, productId: true, subRecipeId: true } } },
    }),
    prisma.product.findMany({ select: { id: true, name: true, kind: true, parentId: true, motherQuantity: true, category: { select: { name: true } }, baseUnit: { select: { symbol: true } } } }),
    bases(),
    livraisons(from, to),
    conversion(),
    prisma.stockEntry.findMany({ where: { type: 'ARRIVAGE', ...(jour && { businessDay: jour }) }, select: { productId: true, quantity: true, unitPrice: true } }),
    prisma.department.findMany({ where: { isActive: true }, select: { id: true } }),
  ])

  const infos = new Map(produits.map((p) => [p.id, p]))
  const unites = new Map(produits.map((p) => [p.id, p.baseUnit.symbol]))
  // Le coût d'un article, par unité de l'article : un préparé vaut sa part de mère.
  const coutUnitaire = (id: number): number | null => {
    const [sid, q] = versStock(id, 1)
    const b = base.get(sid)
    if (!b || b.entered <= 0) return null
    return (b.value / b.entered) * q
  }

  const parId = new Map<number, Fiche>(fiches.map((f) => [f.id, { id: f.id, departmentId: f.departmentId, kind: f.kind, lines: f.lines.map((l) => ({ quantity: Number(l.quantity), unit: l.unit, productId: l.productId, subRecipeId: l.subRecipeId })) }]))
  const parItem = new Map<number, Fiche>()
  for (const f of fiches) if (f.salesItemId !== null) parItem.set(f.salesItemId, parId.get(f.id)!)
  // Lignes qui ne portent ni article ni préparation : la fiche n'est pas complète.
  const lignesIncompletes = (f: Fiche, vues = new Set<number>()): number => {
    if (vues.has(f.id)) return 0
    vues.add(f.id)
    let n = 0
    for (const l of f.lines) {
      if (l.productId !== null) { if (coutUnitaire(l.productId) === null) n += 1; continue }
      if (l.subRecipeId !== null) { const s = parId.get(l.subRecipeId); n += s ? lignesIncompletes(s, vues) : 1; continue }
      n += 1
    }
    return n
  }

  // Ventes agrégées par plat.
  const platsMap = new Map<number, Plat & { _consomme: Map<number, number> }>()
  for (const v of ventes) {
    const q = Number(v.quantity)
    if (q <= 0) continue
    const f = parItem.get(v.itemId)
    let p = platsMap.get(v.itemId)
    if (!p) {
      p = {
        salesItemId: v.itemId, name: v.item.name, familyName: v.item.family.name,
        departmentId: f?.departmentId ?? v.item.departmentId ?? null,
        quantity: 0, unitPrice: null, revenue: null, unitCost: null, cost: null, margin: null, marginRate: null,
        hasRecipe: !!f, incompleteLines: f ? lignesIncompletes(f) : 0, _consomme: new Map(),
      }
      if (f) {
        let cout = 0
        for (const [pid, par] of consommationParPortion(f, parId, unites)) {
          p._consomme.set(pid, par)
          cout += par * (coutUnitaire(pid) ?? 0)
        }
        p.unitCost = cout
      }
      platsMap.set(v.itemId, p)
    }
    p.quantity += q
    // Le CA de la ligne si le Z le donne, sinon le prix de la carte.
    const ca = v.amount !== null && Number(v.amount) > 0 ? Number(v.amount) : v.item.price !== null ? q * Number(v.item.price) : null
    if (ca !== null) p.revenue = (p.revenue ?? 0) + ca
  }
  const plats: Plat[] = []
  // Par article : quantités consommées, coût et CA attribué, par département de la fiche.
  type Acc = { soldQty: number; revenue: number }
  const parDepArticle = new Map<number | null, Map<number, Acc>>()
  const accumule = (dep: number | null, pid: number, q: number, ca: number) => {
    const m = parDepArticle.get(dep) ?? new Map<number, Acc>()
    const a = m.get(pid) ?? { soldQty: 0, revenue: 0 }
    a.soldQty += q; a.revenue += ca
    m.set(pid, a); parDepArticle.set(dep, m)
  }
  for (const p of platsMap.values()) {
    if (p.revenue !== null && p.quantity > 0) p.unitPrice = p.revenue / p.quantity
    if (p.unitCost !== null) {
      p.cost = p.unitCost * p.quantity
      if (p.revenue !== null) { p.margin = p.revenue - p.cost; p.marginRate = taux(p.margin, p.revenue) }
    }
    // Le CA se répartit entre les ingrédients au prorata de leur coût ; sans
    // aucun coût connu, à parts égales entre eux.
    const couts = [...p._consomme].map(([pid, par]) => [pid, par, par * (coutUnitaire(pid) ?? 0)] as const)
    const total = couts.reduce((n, c) => n + c[2], 0)
    for (const [pid, par, c] of couts) {
      const part = total > 0 ? c / total : 1 / couts.length
      accumule(p.departmentId, pid, par * p.quantity, (p.revenue ?? 0) * part)
    }
    const { _consomme: _c, ...plat } = p
    plats.push(plat)
  }
  plats.sort((a, b) => (a.margin ?? Infinity) - (b.margin ?? Infinity) || b.quantity - a.quantity)

  // Livré par département et par article (en unités de l'article servi).
  const livreDep = new Map<number, Map<number, number>>()
  for (const l of sorties) {
    const m = livreDep.get(l.departmentId) ?? new Map<number, number>()
    m.set(l.productId, (m.get(l.productId) ?? 0) + l.quantity)
    livreDep.set(l.departmentId, m)
  }
  // Acheté : par article de stock, sur la période.
  const achete = new Map<number, { qty: number; value: number }>()
  for (const e of arrivages) {
    const a = achete.get(e.productId) ?? { qty: 0, value: 0 }
    a.qty += Number(e.quantity); a.value += Number(e.quantity) * Number(e.unitPrice)
    achete.set(e.productId, a)
  }

  const articlesDe = (dep: number | null): Article[] => {
    const ids = new Set<number>()
    const consos = dep === null ? [...parDepArticle.values()] : [parDepArticle.get(dep) ?? new Map<number, Acc>()]
    const livres = dep === null ? [...livreDep.values()] : [livreDep.get(dep) ?? new Map<number, number>()]
    for (const m of consos) for (const id of m.keys()) ids.add(id)
    for (const m of livres) for (const id of m.keys()) ids.add(id)
    if (dep === null) for (const id of achete.keys()) ids.add(id)
    const out: Article[] = []
    for (const id of ids) {
      const info = infos.get(id); if (!info) continue
      const cu = coutUnitaire(id)
      let soldQty = 0, revenue = 0, deliveredQty = 0
      for (const m of consos) { const a = m.get(id); if (a) { soldQty += a.soldQty; revenue += a.revenue } }
      for (const m of livres) deliveredQty += m.get(id) ?? 0
      const ach = dep === null ? achete.get(id) : undefined
      const soldValue = soldQty * (cu ?? 0), deliveredValue = deliveredQty * (cu ?? 0)
      if (soldQty <= 0 && deliveredQty <= 0 && !ach) continue
      out.push({
        productId: id, name: info.name, unitSymbol: info.baseUnit.symbol, categoryName: info.category.name, unitCost: cu,
        purchasedQty: ach?.qty ?? 0, purchasedValue: ach?.value ?? 0,
        deliveredQty, deliveredValue, soldQty, soldValue, revenue, margin: revenue - soldValue,
        gapQty: deliveredQty - soldQty, gapValue: deliveredValue - soldValue,
      })
    }
    // Les pertes d'abord : l'écart le plus cher en tête.
    return out.sort((a, b) => b.gapValue - a.gapValue || b.soldValue - a.soldValue)
  }

  const resume = (liste: Plat[], articles: Article[]) => {
    const revenue = liste.reduce((n, p) => n + (p.revenue ?? 0), 0)
    const cost = liste.reduce((n, p) => n + (p.cost ?? 0), 0)
    const margin = revenue - cost
    return { revenue, cost, margin, marginRate: taux(margin, revenue), deliveredValue: articles.reduce((n, a) => n + a.deliveredValue, 0) }
  }
  const articles = articlesDe(null)
  const tout = resume(plats, articles)
  return {
    ...tout,
    purchasedValue: [...achete.values()].reduce((n, a) => n + a.value, 0),
    unpricedCount: plats.filter((p) => p.revenue === null).length,
    unrecipedCount: plats.filter((p) => !p.hasRecipe).length,
    plats,
    articles,
    departments: departements.map((d) => {
      const mes = plats.filter((p) => p.departmentId === d.id)
      const arts = articlesDe(d.id)
      return { departmentId: d.id, ...resume(mes, arts), plats: mes, articles: arts }
    }),
  }
}
