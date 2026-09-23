import 'server-only'
import { prisma } from '@/server/db'
import { businessDay } from '@/lib/utils'
import { WorkflowError } from './orders'

/**
 * Le stock général, article par article.
 *
 * Il ne compte que ce qu'on achète : les articles mères et les finis. Un
 * préparé n'y a pas de stock à lui ; ce qui en sort est ramené à sa mère
 * (10 escalopes pizza à 300 g = 3 kg d'escalope).
 *
 * Point de départ : le dernier inventaire de l'article, s'il y en a un —
 * « à cet instant, tant, à tel coût ». Puis les arrivages venus après
 * s'ajoutent, et les livraisons venues après se retranchent. Rien d'autre
 * n'est stocké : corriger une livraison corrige le stock, sans écriture à
 * défaire. Le coût moyen pondère l'inventaire et les arrivages qui suivent.
 */

type Base = {
  /** Quantité de départ (inventaire) plus arrivages venus après. */
  entered: number
  /** Valeur correspondante, pour le coût moyen. */
  value: number
  /** L'instant de l'inventaire, ou nul : tout compte. */
  since: Date | null
  lastEntryAt: Date | null
}

/** Par article : le point de départ et les arrivages qui le suivent. */
export async function bases(): Promise<Map<number, Base>> {
  const entries = await prisma.stockEntry.findMany({
    select: { productId: true, type: true, quantity: true, unitPrice: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const m = new Map<number, Base>()
  for (const e of entries) {
    const q = Number(e.quantity), p = Number(e.unitPrice)
    const b = m.get(e.productId) ?? { entered: 0, value: 0, since: null, lastEntryAt: null }
    if (e.type === 'INVENTAIRE') {
      // Le point remplace tout ce qui précède.
      m.set(e.productId, { entered: q, value: q * p, since: e.createdAt, lastEntryAt: b.lastEntryAt })
    } else {
      b.entered += q
      b.value += q * p
      b.lastEntryAt = e.createdAt
      m.set(e.productId, b)
    }
  }
  return m
}

type Livraison = { departmentId: number; productId: number; quantity: number; at: Date; businessDay: Date }

/** Chaque ligne livrée, telle que servie : premier servi des bons émis, compléments des bons émis. */
export async function livraisons(from: Date | null, to: Date | null): Promise<Livraison[]> {
  const jour = from || to ? { ...(from && { gte: from }), ...(to && { lte: to }) } : undefined
  const [premiers, complements] = await Promise.all([
    prisma.orderLine.findMany({
      where: { order: { deliveredAt: { not: null }, ...(jour && { businessDay: jour }) } },
      select: { productId: true, quantityServed: true, order: { select: { departmentId: true, deliveredAt: true, businessDay: true } } },
    }),
    prisma.orderRefillLine.findMany({
      where: { refill: { deliveredAt: { not: null }, order: jour ? { businessDay: jour } : undefined } },
      select: { quantity: true, refill: { select: { deliveredAt: true } }, orderLine: { select: { productId: true, order: { select: { departmentId: true, businessDay: true } } } } },
    }),
  ])
  const out: Livraison[] = []
  for (const l of premiers) {
    const q = Number(l.quantityServed ?? 0)
    if (q > 0) out.push({ departmentId: l.order.departmentId, productId: l.productId, quantity: q, at: l.order.deliveredAt!, businessDay: l.order.businessDay })
  }
  for (const c of complements) {
    const q = Number(c.quantity)
    if (q > 0) out.push({ departmentId: c.orderLine.order.departmentId, productId: c.orderLine.productId, quantity: q, at: c.refill.deliveredAt!, businessDay: c.orderLine.order.businessDay })
  }
  return out
}

/**
 * Ce qu'un service a reçu par article sur une période, en unités de l'article
 * tel que servi (sans conversion vers la mère) : le contrôle des stocks
 * compare ce que le rayon a reçu à ce qu'il compte.
 */
export async function livraisonsDuService(departmentId: number, from: Date, to: Date): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  for (const l of await livraisons(from, to)) {
    if (l.departmentId !== departmentId) continue
    out.set(l.productId, (out.get(l.productId) ?? 0) + l.quantity)
  }
  return out
}

/** La table des mères : une portion compte pour sa mère, fois ce qu'elle en consomme. */
export async function conversion() {
  const produits = await prisma.product.findMany({ select: { id: true, parentId: true, motherQuantity: true } })
  const parent = new Map(produits.map((p) => [p.id, p]))
  return (productId: number, q: number): [number, number] => {
    const p = parent.get(productId)
    if (p?.parentId && Number(p.motherQuantity) > 0) return [p.parentId, q * Number(p.motherQuantity)]
    return [productId, q]
  }
}

export async function generalStock() {
  const [products, base, sorties, versStock] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      include: { category: true, baseUnit: true, portions: { where: { isActive: true }, include: { baseUnit: true } } },
      orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
    }),
    bases(),
    livraisons(null, null),
    conversion(),
  ])
  // Sorti depuis le point de départ de chaque article : en unités de stock
  // (portions converties) pour la mère, en portions pour le préparé.
  const sortiStock = new Map<number, number>()
  const sortiBrut = new Map<number, number>()
  for (const l of sorties) {
    const [sid, qs] = versStock(l.productId, l.quantity)
    const since = base.get(sid)?.since
    if (!since || l.at > since) sortiStock.set(sid, (sortiStock.get(sid) ?? 0) + qs)
    sortiBrut.set(l.productId, (sortiBrut.get(l.productId) ?? 0) + l.quantity)
  }
  const parId = new Map(products.map((p) => [p.id, p]))
  const lines = products.map((p) => {
    const prepare = p.kind === 'PREPARE' && p.parentId !== null
    const mere = prepare ? parId.get(p.parentId!) : null
    const b = base.get(p.id)
    const entered = prepare ? 0 : (b?.entered ?? 0)
    const delivered = prepare ? (sortiBrut.get(p.id) ?? 0) : (sortiStock.get(p.id) ?? 0)
    const stock = prepare ? 0 : entered - delivered
    const unitCost = prepare || !b || b.entered <= 0 ? null : b.value / b.entered
    return {
      productId: String(p.id),
      productName: p.name,
      productRef: p.reference,
      categoryName: p.category.name,
      unitSymbol: p.baseUnit.symbol,
      kind: p.kind,
      mother: mere
        ? { productId: String(mere.id), productName: mere.name, unitSymbol: mere.baseUnit.symbol, motherQuantity: Number(p.motherQuantity ?? 0) }
        : null,
      portions: p.portions.map((c) => ({
        productId: String(c.id), productName: c.name, productRef: c.reference,
        unitSymbol: c.baseUnit.symbol, motherQuantity: Number(c.motherQuantity ?? 0),
      })),
      entered, delivered, stock, unitCost,
      stockValue: unitCost === null ? 0 : stock * unitCost,
      lastEntryAt: b?.lastEntryAt ?? b?.since ?? null,
    }
  })
  const stockees = lines.filter((l) => l.kind !== 'PREPARE')
  return {
    lines,
    totalValue: stockees.reduce((s, l) => s + l.stockValue, 0),
    negativeCount: stockees.filter((l) => l.stock < -1e-9).length,
  }
}

/** Ce que chaque département a reçu, en dinars au coût moyen, sur la période. */
export async function departmentSpend(from: Date | null, to: Date | null) {
  const [sorties, base, departments, produits, versStock] = await Promise.all([
    livraisons(from, to),
    bases(),
    prisma.department.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.product.findMany({ select: { id: true, name: true, baseUnit: { select: { symbol: true } } } }),
    conversion(),
  ])
  const cout = (id: number) => { const b = base.get(id); return b && b.entered > 0 ? b.value / b.entered : 0 }
  const infos = new Map(produits.map((p) => [p.id, p]))
  return departments.map((d) => {
    const acc = new Map<number, { quantity: number; lines: number }>()
    for (const l of sorties.filter((s) => s.departmentId === d.id)) {
      const [sid, qs] = versStock(l.productId, l.quantity)
      const a = acc.get(sid) ?? { quantity: 0, lines: 0 }
      a.quantity += qs; a.lines += 1
      acc.set(sid, a)
    }
    const items = [...acc.entries()]
      .map(([id, a]) => ({
        productId: String(id),
        productName: infos.get(id)?.name ?? '?',
        unitSymbol: infos.get(id)?.baseUnit.symbol ?? '',
        quantity: a.quantity,
        amount: a.quantity * cout(id),
      }))
      .sort((a, b) => b.amount - a.amount)
    return {
      department: d,
      lineCount: [...acc.values()].reduce((n, a) => n + a.lines, 0),
      amount: items.reduce((n, i) => n + i.amount, 0),
      items,
    }
  })
}

/**
 * Le journal du stock général : arrivages (entrées), inventaires, et bons
 * émis (sorties), valorisés au coût moyen, les plus récents d'abord.
 */
export async function stockMovements(params: { from: Date | null; to: Date | null; type: 'ENTREE' | 'SORTIE' | null; take?: number }) {
  const { from, to, type } = params
  const jour = from || to ? { ...(from && { gte: from }), ...(to && { lte: to }) } : undefined
  const [entries, orders, refills, base, versStock] = await Promise.all([
    type === 'SORTIE' ? [] : prisma.stockEntry.findMany({
      where: jour ? { businessDay: jour } : undefined,
      include: { product: { include: { baseUnit: true } }, createdBy: true },
      orderBy: [{ businessDay: 'desc' }, { createdAt: 'desc' }],
      take: params.take ?? 300,
    }),
    type === 'ENTREE' ? [] : prisma.order.findMany({
      where: { deliveredAt: { not: null }, ...(jour && { businessDay: jour }) },
      select: {
        id: true, reference: true, businessDay: true, deliveredAt: true,
        department: { select: { name: true, color: true } },
        processedBy: { select: { fullName: true } },
        lines: { select: { productId: true, quantityServed: true } },
      },
      orderBy: [{ businessDay: 'desc' }, { deliveredAt: 'desc' }],
      take: params.take ?? 300,
    }),
    type === 'ENTREE' ? [] : prisma.orderRefill.findMany({
      where: { deliveredAt: { not: null }, order: jour ? { businessDay: jour } : undefined },
      select: {
        id: true, rank: true, deliveredAt: true,
        order: { select: { id: true, reference: true, businessDay: true, department: { select: { name: true, color: true } } } },
        createdBy: { select: { fullName: true } },
        lines: { select: { quantity: true, orderLine: { select: { productId: true } } } },
      },
      orderBy: [{ deliveredAt: 'desc' }],
      take: params.take ?? 300,
    }),
    bases(),
    conversion(),
  ])
  const cout = (id: number) => { const b = base.get(id); return b && b.entered > 0 ? b.value / b.entered : 0 }
  const valeur = (productId: number, q: number) => { const [sid, qs] = versStock(productId, q); return qs * cout(sid) }
  type Mouvement = {
    id: string; type: 'ENTREE' | 'SORTIE' | 'INVENTAIRE'; at: Date; businessDay: Date; label: string; detail: string | null
    department: { name: string; color: string } | null; by: string | null; lineCount: number
    quantity: number | null; unitSymbol: string | null; amount: number; orderId: string | null
  }
  const out: Mouvement[] = []
  for (const e of entries) {
    const inventaire = e.type === 'INVENTAIRE'
    out.push({
      id: `e${e.id}`, type: inventaire ? 'INVENTAIRE' : 'ENTREE', at: e.createdAt, businessDay: e.businessDay,
      label: inventaire ? `Inventaire — ${e.product.name}` : e.product.name,
      detail: e.reference ? `Facture ${e.reference}` : (e.note ?? null),
      department: null, by: e.createdBy.fullName, lineCount: 1,
      quantity: Number(e.quantity), unitSymbol: e.product.baseUnit.symbol,
      amount: Number(e.quantity) * Number(e.unitPrice), orderId: null,
    })
  }
  for (const o of orders) {
    const lignes = o.lines.filter((l) => Number(l.quantityServed ?? 0) > 0)
    out.push({
      id: `o${o.id}`, type: 'SORTIE', at: o.deliveredAt!, businessDay: o.businessDay,
      label: `Bon de livraison n° 1 — ${o.reference}`, detail: null,
      department: o.department, by: o.processedBy?.fullName ?? null, lineCount: lignes.length,
      quantity: null, unitSymbol: null,
      amount: lignes.reduce((s, l) => s + valeur(l.productId, Number(l.quantityServed ?? 0)), 0), orderId: String(o.id),
    })
  }
  for (const r of refills) {
    out.push({
      id: `r${r.id}`, type: 'SORTIE', at: r.deliveredAt!, businessDay: r.order.businessDay,
      label: `Bon du ${r.rank}ᵉ servi — ${r.order.reference}`, detail: null,
      department: r.order.department, by: r.createdBy?.fullName ?? null, lineCount: r.lines.length,
      quantity: null, unitSymbol: null,
      amount: r.lines.reduce((s, l) => s + valeur(l.orderLine.productId, Number(l.quantity)), 0), orderId: String(r.order.id),
    })
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime())
}

export async function addStockEntry(params: {
  productId: number
  quantity: number
  unitPrice: number
  reference?: string | null
  note?: string | null
  day?: Date | null
  actorId: number
}) {
  if (!Number.isFinite(params.quantity) || params.quantity <= 0) throw new WorkflowError('Quantité invalide.')
  if (!Number.isFinite(params.unitPrice) || params.unitPrice < 0) throw new WorkflowError('Prix unitaire invalide.')
  const p = await prisma.product.findUnique({ where: { id: params.productId }, select: { kind: true, name: true } })
  if (!p) throw new WorkflowError('Article introuvable.')
  // Un article préparé ne s'achète pas : on entre sa mère.
  if (p.kind === 'PREPARE') throw new WorkflowError(`${p.name} est un article préparé : entrez l’article mère.`)
  return prisma.stockEntry.create({
    data: {
      productId: params.productId,
      type: 'ARRIVAGE',
      quantity: params.quantity,
      unitPrice: params.unitPrice,
      reference: params.reference?.trim() || null,
      note: params.note?.trim() || null,
      businessDay: params.day ?? businessDay(),
      createdById: params.actorId,
    },
    select: { id: true },
  })
}

/**
 * Inventaire : on pose le stock réel et son coût moyen, tels qu'on les
 * constate. Ce point devient le départ de l'article ; ce qui précède ne
 * compte plus, ce qui suit se compte à partir de lui.
 */
export async function setStockLevel(params: { productId: number; quantity: number; unitCost: number; note?: string | null; actorId: number }) {
  if (!Number.isFinite(params.quantity) || params.quantity < 0) throw new WorkflowError('Quantité en stock invalide.')
  if (!Number.isFinite(params.unitCost) || params.unitCost < 0) throw new WorkflowError('Coût moyen invalide.')
  const p = await prisma.product.findUnique({ where: { id: params.productId }, select: { kind: true, name: true } })
  if (!p) throw new WorkflowError('Article introuvable.')
  if (p.kind === 'PREPARE') throw new WorkflowError(`${p.name} est un article préparé : son stock est celui de sa mère.`)
  return prisma.stockEntry.create({
    data: {
      productId: params.productId,
      type: 'INVENTAIRE',
      quantity: params.quantity,
      unitPrice: params.unitCost,
      note: params.note?.trim() || 'Inventaire',
      businessDay: businessDay(),
      createdById: params.actorId,
    },
    select: { id: true },
  })
}

export async function setProductPortion(params: { productId: number; parentId: number | null; motherQuantity: number | null }) {
  const { productId, parentId, motherQuantity } = params
  if (parentId === null) {
    // Détaché, l'article redevient fini ; sa mère reste mère tant qu'elle
    // a d'autres portions, ou si on l'a désignée ainsi.
    return prisma.product.update({ where: { id: productId }, data: { parentId: null, motherQuantity: null, kind: 'FINI' }, select: { id: true } })
  }
  if (parentId === productId) throw new WorkflowError('Un article ne peut pas être sa propre mère.')
  if (!Number.isFinite(motherQuantity) || (motherQuantity ?? 0) <= 0) {
    throw new WorkflowError('La quantité de mère consommée par portion doit être positive.')
  }
  const mere = await prisma.product.findUnique({ where: { id: parentId }, select: { parentId: true, name: true } })
  if (!mere) throw new WorkflowError('Article mère introuvable.')
  // Pas de portion de portion : la chaîne s'arrête à la mère.
  if (mere.parentId) throw new WorkflowError(`${mere.name} est déjà une portion : choisissez sa mère.`)
  const enfants = await prisma.product.count({ where: { parentId: productId } })
  if (enfants > 0) throw new WorkflowError('Cet article a lui-même des portions : il ne peut pas en devenir une.')
  await prisma.product.update({ where: { id: parentId }, data: { kind: 'MERE' } })
  return prisma.product.update({ where: { id: productId }, data: { parentId, motherQuantity, kind: 'PREPARE' }, select: { id: true } })
}

/** Change la nature d'un article : fini ou mère. Un préparé passe par `setProductPortion`. */
export async function setProductKind(productId: number, kind: 'FINI' | 'MERE') {
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { portions: { select: { id: true } }, name: true } })
  if (!p) throw new WorkflowError('Article introuvable.')
  if (kind === 'FINI' && p.portions.length > 0) {
    throw new WorkflowError(`${p.name} a des articles préparés : détachez-les avant d’en faire un article fini.`)
  }
  return prisma.product.update({ where: { id: productId }, data: { kind, parentId: null, motherQuantity: null }, select: { id: true } })
}
