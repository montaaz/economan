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

/**
 * Par article : le point de départ et les arrivages qui le suivent.
 *
 * Une préparation compte comme un arrivage pour l'article préparé : ce qui
 * en est obtenu entre à son stock, au coût que le pur consommé a coûté.
 */
export async function bases(productId?: number): Promise<Map<number, Base>> {
  // Un seul article quand on ne veut que lui : la préparation relisait
  // toutes les écritures du stock pour le coût d'un seul pur.
  const [arrivages, preparations] = await Promise.all([
    prisma.stockEntry.findMany({
      where: productId ? { productId } : undefined,
      select: { productId: true, type: true, quantity: true, unitPrice: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.preparation.findMany({
      where: productId ? { productId } : undefined,
      select: { productId: true, quantityMade: true, unitCost: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  const entries = [
    ...arrivages,
    ...preparations.map((p) => ({ productId: p.productId, type: 'ARRIVAGE' as const, quantity: p.quantityMade, unitPrice: p.unitCost, createdAt: p.createdAt })),
  ].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())
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
export async function livraisons(from: Date | null, to: Date | null, departmentId?: number): Promise<Livraison[]> {
  const jour = from || to ? { ...(from && { gte: from }), ...(to && { lte: to }) } : undefined
  // Le département se filtre en base quand on le connaît : le contrôle des
  // stocks relisait toutes les livraisons de tous les services, sept fois.
  const commande = { deliveredAt: { not: null }, ...(jour && { businessDay: jour }), ...(departmentId && { departmentId }) }
  const [premiers, complements] = await Promise.all([
    prisma.orderLine.findMany({
      where: { order: commande },
      select: { productId: true, quantityServed: true, order: { select: { departmentId: true, deliveredAt: true, businessDay: true } } },
    }),
    prisma.orderRefillLine.findMany({
      where: { refill: { deliveredAt: { not: null }, order: jour || departmentId ? { ...(jour && { businessDay: jour }), ...(departmentId && { departmentId }) } : undefined } },
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
  for (const l of await livraisons(from, to, departmentId)) {
    out.set(l.productId, (out.get(l.productId) ?? 0) + l.quantity)
  }
  return out
}

/**
 * Ce qu'une livraison sort du stock : l'article livré lui-même.
 *
 * Une portion ne se ramène plus à sa mère à la livraison : c'est la
 * préparation qui a fait passer le stock du pur au préparé, et le préparé
 * a son propre stock et son propre coût. La contenance (`motherQuantity`)
 * ne sert plus qu'à proposer la quantité de pur au moment de préparer.
 */
export async function conversion() {
  return (productId: number, q: number): [number, number] => [productId, q]
}

/** Ce que les préparations ont consommé de chaque article pur, avec l'instant de chaque prélèvement. */
async function consommations(): Promise<Map<number, { quantity: number; at: Date }[]>> {
  const rows = await prisma.preparation.findMany({ select: { sourceId: true, quantityUsed: true, createdAt: true } })
  const m = new Map<number, { quantity: number; at: Date }[]>()
  for (const r of rows) {
    const l = m.get(r.sourceId) ?? []
    l.push({ quantity: Number(r.quantityUsed), at: r.createdAt })
    m.set(r.sourceId, l)
  }
  return m
}

export async function generalStock() {
  const [products, base, sorties, versStock, preparees] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      include: { category: true, baseUnit: true, portions: { where: { isActive: true }, include: { baseUnit: true } } },
      orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
    }),
    bases(),
    livraisons(null, null),
    conversion(),
    consommations(),
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
    // Entré : les arrivages pour un pur, ce que les préparations ont
    // obtenu pour un préparé. Sorti : les livraisons. Préparé : ce que les
    // préparations ont pris à un pur, depuis son point de départ.
    const entered = b?.entered ?? 0
    const delivered = sortiStock.get(p.id) ?? 0
    const prepared = (preparees.get(p.id) ?? []).filter((c) => !b?.since || c.at > b.since).reduce((n, c) => n + c.quantity, 0)
    const stock = entered - delivered - prepared
    const unitCost = !b || b.entered <= 0 ? null : b.value / b.entered
    void sortiBrut
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
      entered, delivered, prepared, stock, unitCost,
      stockValue: unitCost === null ? 0 : stock * unitCost,
      lastEntryAt: b?.lastEntryAt ?? b?.since ?? null,
    }
  })
  return {
    lines,
    totalValue: lines.reduce((s, l) => s + l.stockValue, 0),
    negativeCount: lines.filter((l) => l.stock < -1e-9).length,
  }
}

/**
 * Une préparation : tant de pur consommé, tant de préparé obtenu.
 *
 * Le coût du préparé se fige à cet instant : le pur consommé, à son coût
 * moyen du moment, réparti sur ce qui est obtenu. Un article encore « à la
 * pièce » choisi comme préparé se rattache au pur de lui-même, avec pour
 * contenance ce que cette préparation en a pris par unité obtenue.
 */
export async function addPreparation(params: {
  sourceId: number; productId: number; quantityUsed: number; quantityMade: number
  /** L'unité du préparé (« p » pour portion), posée au rattachement : c'est en elle qu'on compte ce qu'on obtient. */
  madeUnit?: string | null
  day?: Date | null; note?: string | null; actorId: number
}) {
  const { sourceId, productId, quantityUsed, quantityMade } = params
  if (sourceId === productId) throw new WorkflowError('Le pur et le préparé doivent être deux articles différents.')
  if (!Number.isFinite(quantityUsed) || quantityUsed <= 0) throw new WorkflowError('La quantité de pur consommée doit être positive.')
  if (!Number.isFinite(quantityMade) || quantityMade <= 0) throw new WorkflowError('La quantité préparée doit être positive.')
  const [pur, prep, base] = await Promise.all([
    prisma.product.findUnique({ where: { id: sourceId }, select: { id: true, name: true, kind: true, parentId: true } }),
    prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true, kind: true, parentId: true, portions: { select: { id: true } } } }),
    bases(sourceId),
  ])
  if (!pur || !prep) throw new WorkflowError('Article introuvable.')
  if (pur.kind === 'PREPARE') throw new WorkflowError(`${pur.name} est un article préparé : on prépare à partir d'un article pur.`)
  if (prep.portions.length > 0) throw new WorkflowError(`${prep.name} est lui-même un article pur : il ne se prépare pas.`)
  if (prep.parentId !== null && prep.parentId !== sourceId) throw new WorkflowError(`${prep.name} se prépare à partir d'un autre article pur.`)
  const b = base.get(sourceId)
  const coutPur = b && b.entered > 0 ? b.value / b.entered : 0
  const unitCost = (quantityUsed * coutPur) / quantityMade
  return prisma.$transaction(async (tx) => {
    // Le rattachement, s'il manque : le pur devient pur, le préparé devient préparé.
    if (prep.parentId === null) {
      await tx.product.update({ where: { id: sourceId }, data: { kind: 'MERE' } })
      const unite = params.madeUnit?.trim()
        ? await tx.unit.findFirst({ where: { symbol: { equals: params.madeUnit.trim(), mode: 'insensitive' } }, select: { id: true } })
        : null
      await tx.product.update({
        where: { id: productId },
        data: { parentId: sourceId, kind: 'PREPARE', motherQuantity: quantityUsed / quantityMade, ...(unite && { baseUnitId: unite.id }) },
      })
    }
    const p = await tx.preparation.create({
      data: {
        sourceId, productId, quantityUsed, quantityMade, unitCost,
        businessDay: params.day ?? businessDay(), note: params.note?.trim() || null, createdById: params.actorId,
      },
      select: { id: true },
    })
    return { id: p.id, unitCost }
  })
}

/** Retirer une préparation : le pur retrouve ce qu'elle avait pris, le préparé perd ce qu'elle avait donné. */
export async function deletePreparation(id: number) {
  await prisma.preparation.delete({ where: { id } })
  return true
}

/** Les préparations d'une période, les plus récentes d'abord. */
export async function preparations(from: Date | null, to: Date | null) {
  const jour = from || to ? { ...(from && { gte: from }), ...(to && { lte: to }) } : undefined
  return prisma.preparation.findMany({
    where: jour ? { businessDay: jour } : undefined,
    orderBy: [{ businessDay: 'desc' }, { createdAt: 'desc' }],
    take: 500,
    include: {
      source: { include: { baseUnit: true } },
      product: { include: { baseUnit: true } },
      createdBy: { select: { fullName: true } },
    },
  })
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
  const [entries, orders, refills, base, versStock, preps] = await Promise.all([
    type === 'SORTIE' ? [] : prisma.stockEntry.findMany({
      where: jour ? { businessDay: jour } : undefined,
      include: { product: { include: { baseUnit: true } }, createdBy: true, supplier: { select: { name: true } } },
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
    type === 'ENTREE' || type === 'SORTIE' ? [] : prisma.preparation.findMany({
      where: jour ? { businessDay: jour } : undefined,
      include: { source: { include: { baseUnit: true } }, product: { include: { baseUnit: true } }, createdBy: { select: { fullName: true } } },
    }),
  ])
  const cout = (id: number) => { const b = base.get(id); return b && b.entered > 0 ? b.value / b.entered : 0 }
  const valeur = (productId: number, q: number) => { const [sid, qs] = versStock(productId, q); return qs * cout(sid) }
  type Mouvement = {
    id: string; type: 'ENTREE' | 'SORTIE' | 'INVENTAIRE' | 'PREPARATION'; at: Date; businessDay: Date; label: string; detail: string | null
    department: { name: string; color: string } | null; by: string | null; lineCount: number
    quantity: number | null; unitSymbol: string | null; amount: number; orderId: string | null
    /** Le servi complémentaire, quand la sortie en est un : sa fiche est à part. */
    refillId: string | null
  }
  const out: Mouvement[] = []
  for (const e of entries) {
    const inventaire = e.type === 'INVENTAIRE'
    out.push({
      id: `e${e.id}`, type: inventaire ? 'INVENTAIRE' : 'ENTREE', at: e.createdAt, businessDay: e.businessDay,
      label: inventaire ? `Inventaire — ${e.product.name}` : e.product.name,
      detail: [e.supplier?.name, e.reference ? `Facture ${e.reference}` : null, e.note].filter(Boolean).join(' · ') || null,
      department: null, by: e.createdBy.fullName, lineCount: 1,
      quantity: Number(e.quantity), unitSymbol: e.product.baseUnit.symbol,
      amount: Number(e.quantity) * Number(e.unitPrice), orderId: null, refillId: null,
    })
  }
  for (const o of orders) {
    const lignes = o.lines.filter((l) => Number(l.quantityServed ?? 0) > 0)
    out.push({
      id: `o${o.id}`, type: 'SORTIE', at: o.deliveredAt!, businessDay: o.businessDay,
      label: `Bon de livraison n° 1 — ${o.reference}`, detail: null,
      department: o.department, by: o.processedBy?.fullName ?? null, lineCount: lignes.length,
      quantity: null, unitSymbol: null,
      amount: lignes.reduce((s, l) => s + valeur(l.productId, Number(l.quantityServed ?? 0)), 0), orderId: String(o.id), refillId: null,
    })
  }
  for (const r of refills) {
    out.push({
      id: `r${r.id}`, type: 'SORTIE', at: r.deliveredAt!, businessDay: r.order.businessDay,
      label: `Bon du ${r.rank}ᵉ servi — ${r.order.reference}`, detail: null,
      department: r.order.department, by: r.createdBy?.fullName ?? null, lineCount: r.lines.length,
      quantity: null, unitSymbol: null,
      amount: r.lines.reduce((s, l) => s + valeur(l.orderLine.productId, Number(l.quantity)), 0), orderId: String(r.order.id), refillId: String(r.id),
    })
  }
  for (const p of preps) {
    out.push({
      id: `p${p.id}`, type: 'PREPARATION', at: p.createdAt, businessDay: p.businessDay,
      label: `Préparation — ${p.source.name} → ${p.product.name}`,
      detail: `${Number(p.quantityUsed)} ${p.source.baseUnit.symbol} de pur → ${Number(p.quantityMade)} ${p.product.baseUnit.symbol}${p.note ? ` · ${p.note}` : ''}`,
      department: null, by: p.createdBy.fullName, lineCount: 1,
      quantity: Number(p.quantityMade), unitSymbol: p.product.baseUnit.symbol,
      amount: Number(p.quantityUsed) * cout(p.sourceId), orderId: null, refillId: null,
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

/** Les fournisseurs connus, du plus récemment utilisé au plus ancien. */
export async function suppliers() {
  return prisma.supplier.findMany({ orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }], select: { id: true, name: true, phone: true, taxId: true } })
}

/**
 * Une facture entière d'un coup : le fournisseur, puis une entrée par
 * article. Le fournisseur se retrouve par son nom, sans égard à la casse ;
 * un nom inconnu le crée, un nom connu met à jour son téléphone et son
 * matricule si on en donne. Tout ou rien : une ligne refusée ne laisse pas
 * les autres entrées derrière elle.
 */
export async function addStockEntries(params: {
  supplier: { name: string; phone?: string | null; taxId?: string | null } | null
  reference?: string | null
  note?: string | null
  day?: Date | null
  lines: { productId: number; quantity: number; unitPrice: number }[]
  actorId: number
}) {
  const lignes = params.lines
  if (lignes.length === 0) throw new WorkflowError('Aucun article saisi.')
  const vus = new Set<number>()
  for (const l of lignes) {
    if (vus.has(l.productId)) throw new WorkflowError('Un même article figure deux fois sur la facture.')
    vus.add(l.productId)
    if (!Number.isFinite(l.quantity) || l.quantity <= 0) throw new WorkflowError('Quantité invalide.')
    if (!Number.isFinite(l.unitPrice) || l.unitPrice < 0) throw new WorkflowError('Prix unitaire invalide.')
  }
  const produits = await prisma.product.findMany({ where: { id: { in: [...vus] } }, select: { id: true, kind: true, name: true } })
  const parId = new Map(produits.map((p) => [p.id, p]))
  for (const l of lignes) {
    const p = parId.get(l.productId)
    if (!p) throw new WorkflowError('Article introuvable.')
    if (p.kind === 'PREPARE') throw new WorkflowError(`${p.name} est un article préparé : entrez l’article mère.`)
  }
  const nom = params.supplier?.name.trim() ?? ''
  return prisma.$transaction(async (tx) => {
    let supplierId: number | null = null
    if (nom) {
      const phone = params.supplier?.phone?.trim() || null
      const taxId = params.supplier?.taxId?.trim() || null
      const existant = await tx.supplier.findFirst({ where: { name: { equals: nom, mode: 'insensitive' } } })
      const f = existant
        ? await tx.supplier.update({ where: { id: existant.id }, data: { ...(phone && { phone }), ...(taxId && { taxId }) } })
        : await tx.supplier.create({ data: { name: nom, phone, taxId } })
      supplierId = f.id
    }
    const jour = params.day ?? businessDay()
    await tx.stockEntry.createMany({
      data: lignes.map((l) => ({
        productId: l.productId, type: 'ARRIVAGE' as const, quantity: l.quantity, unitPrice: l.unitPrice,
        reference: params.reference?.trim() || null, note: params.note?.trim() || null,
        businessDay: jour, supplierId, createdById: params.actorId,
      })),
    })
    return { count: lignes.length, supplierId }
  }, { timeout: 15_000 })
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
