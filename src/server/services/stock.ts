import 'server-only'
import { Prisma } from '@/generated/prisma/client'
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
  const [products, base, sorties, versStock, preparees, liens] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      include: { category: true, baseUnit: true, portions: { where: { isActive: true }, include: { baseUnit: true } } },
      orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
    }),
    bases(),
    livraisons(null, null),
    conversion(),
    consommations(),
    // Quand chaque préparé a rejoint sa famille : l'ordre des fiches.
    prisma.$queryRaw<{ id: number; linkedAt: Date | null }[]>`SELECT "id", "linkedAt" FROM "products" WHERE "parentId" IS NOT NULL`,
  ])
  const departementsPar = await departementsDesArticles()
  // Le stock fixe de chaque article, par département : la fiche articles l'affiche.
  const [fixes, compos] = await Promise.all([
    prisma.stockFixe.findMany({ select: { productId: true, departmentId: true, quantity: true } }),
    prisma.preparedComposition.findMany({ select: { productId: true, departmentId: true, quantity: true } }),
  ])
  const composPar = new Map<number, { departmentId: string; quantity: number }[]>()
  for (const c of compos) composPar.set(c.productId, [...(composPar.get(c.productId) ?? []), { departmentId: String(c.departmentId), quantity: Number(c.quantity) }])
  const fixesPar = new Map<number, { departmentId: string; quantity: number }[]>()
  for (const f of fixes) {
    const l = fixesPar.get(f.productId) ?? []
    l.push({ departmentId: String(f.departmentId), quantity: Number(f.quantity) })
    fixesPar.set(f.productId, l)
  }
  const lieLe = new Map(liens.map((l) => [l.id, l.linkedAt]))
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
      categoryId: String(p.categoryId),
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
      linkedAt: prepare ? (lieLe.get(p.id) ?? null) : null,
      departmentIds: (departementsPar.get(p.id) ?? []).map(String),
      stockFixes: fixesPar.get(p.id) ?? [],
      compositions: prepare ? (composPar.get(p.id) ?? []) : [],
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
      await tx.$executeRaw`UPDATE "products" SET "linkedAt" = now() WHERE "id" = ${productId}`
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
  return prisma.$queryRaw<{ id: number; name: string; phone: string | null; taxId: string | null; address: string | null }[]>`
    SELECT "id", "name", "phone", "taxId", "address" FROM "suppliers" WHERE "isActive" ORDER BY "updatedAt" DESC, "name" ASC`
}

export type InvoiceLine = {
  /** L'écriture existante qu'on corrige ; absent pour une ligne nouvelle. */
  id?: number | null
  productId: number
  /** Dans l'unité de stock de l'article. */
  quantity: number
  /** Prix unitaire hors taxes avant remise, par unité de stock. */
  listPrice: number
  discountPct: number
  vatPct: number
}

/**
 * Enregistre une facture : son en-tête, puis ses lignes.
 *
 * La même fonction saisit une facture neuve et corrige une facture déjà
 * entrée. Une ligne qui porte un identifiant corrige son écriture ; une
 * ligne sans identifiant s'ajoute à la facture ; une écriture citée dans
 * `removeIds` en sort — l'administration seule le peut. Tout ou rien.
 *
 * Le stock se valorise au prix net hors taxes : le prix de la facture moins
 * sa remise. La TVA se note pour le total de la facture, pas pour le stock.
 *
 * Deux ou trois écritures en tout, quel que soit le nombre de lignes : une
 * facture de quarante articles ne doit pas dépasser le délai de la
 * transaction sur une base distante.
 */
export async function saveStockInvoice(params: {
  supplier: { name: string; phone?: string | null; taxId?: string | null; address?: string | null }
  reference?: string | null
  deliveryNote?: string | null
  note?: string | null
  day?: Date | null
  /** L'auteur porté par les écritures ; par défaut, celui qui enregistre. */
  createdById?: number | null
  lines: InvoiceLine[]
  removeIds?: number[]
  actor: { id: number; role: string }
}) {
  const lignes = params.lines
  const aRetirer = [...new Set(params.removeIds ?? [])]
  if (lignes.length === 0) throw new WorkflowError('Aucun article saisi.')
  if (lignes.length > 300) throw new WorkflowError('Trop de lignes sur une seule facture.')
  const nom = params.supplier.name.trim().replace(/\s+/g, ' ')
  if (!nom) throw new WorkflowError('Le nom du fournisseur est obligatoire.')
  if (aRetirer.length > 0 && params.actor.role !== 'ADMIN') {
    throw new WorkflowError('Retirer une entrée est réservé à l’administration.')
  }
  const vus = new Set<number>()
  const idsCorriges = new Set<number>()
  for (const l of lignes) {
    if (vus.has(l.productId)) throw new WorkflowError('Un même article figure deux fois sur la facture.')
    vus.add(l.productId)
    if (!Number.isFinite(l.quantity) || l.quantity <= 0) throw new WorkflowError('Quantité invalide.')
    if (!Number.isFinite(l.listPrice) || l.listPrice < 0) throw new WorkflowError('Prix unitaire invalide.')
    if (!Number.isFinite(l.discountPct) || l.discountPct < 0 || l.discountPct > 100) throw new WorkflowError('Remise invalide : entre 0 et 100 %.')
    if (!Number.isFinite(l.vatPct) || l.vatPct < 0 || l.vatPct > 100) throw new WorkflowError('TVA invalide : entre 0 et 100 %.')
    if (l.id) {
      if (idsCorriges.has(l.id) || aRetirer.includes(l.id)) throw new WorkflowError('Une même écriture figure deux fois.')
      idsCorriges.add(l.id)
    }
  }
  const milli = (n: number) => Math.round(n * 1000) / 1000
  const net = (l: InvoiceLine) => milli(l.listPrice * (1 - l.discountPct / 100))

  return prisma.$transaction(async (tx) => {
    const produits = await tx.product.findMany({ where: { id: { in: [...vus] } }, select: { id: true, kind: true, name: true } })
    const parId = new Map(produits.map((p) => [p.id, p]))
    for (const l of lignes) {
      const p = parId.get(l.productId)
      if (!p) throw new WorkflowError('Article introuvable.')
      if (p.kind === 'PREPARE') throw new WorkflowError(`${p.name} est un article préparé : entrez l’article pur.`)
    }

    // Les écritures qu'on corrige ou retire : toutes des arrivages connus.
    const touchees = [...idsCorriges, ...aRetirer]
    const avant = touchees.length > 0
      ? await tx.$queryRaw<{
          id: number; type: string; productId: number; quantity: unknown; unitPrice: unknown; listPrice: unknown
          discountPct: unknown; vatPct: unknown; reference: string | null; deliveryNote: string | null; note: string | null
          businessDay: Date; supplierId: number | null; createdById: number
          lockedAt: Date | null; lockedById: number | null
        }[]>`SELECT "id", "type"::text, "productId", "quantity", "unitPrice", "listPrice", "discountPct", "vatPct",
               "reference", "deliveryNote", "note", "businessDay", "supplierId", "createdById", "lockedAt", "lockedById"
             FROM "stock_entries" WHERE "id" IN (${Prisma.join(touchees)}) FOR UPDATE`
      : []
    if (avant.length !== touchees.length) throw new WorkflowError('Une des entrées est introuvable : rechargez la page.')
    // Une facture verrouillée ne se corrige plus, administration comprise :
    // on la déverrouille d'abord.
    if (avant.some((e) => e.lockedAt)) throw new WorkflowError(FACTURE_VERROUILLEE)
    if (avant.some((e) => e.type !== 'ARRIVAGE')) throw new WorkflowError('Un inventaire ne se corrige pas : refaites-le depuis l’article.')
    const avantPar = new Map(avant.map((e) => [e.id, e]))

    let auteur: number | null = null
    if (params.createdById) {
      const u = await tx.user.findUnique({ where: { id: params.createdById }, select: { isActive: true, role: true } })
      if (!u || !u.isActive || (u.role !== 'ECONOMAN' && u.role !== 'ADMIN')) {
        throw new WorkflowError('L’auteur doit être un compte actif de l’économat ou de l’administration.')
      }
      auteur = params.createdById
    }

    // Le fournisseur : retrouvé par son nom, sans égard à la casse.
    const phone = params.supplier.phone?.trim() || null
    const taxId = params.supplier.taxId?.trim() || null
    const address = params.supplier.address?.trim() || null
    const existant = await tx.supplier.findFirst({ where: { name: { equals: nom, mode: 'insensitive' } }, select: { id: true } })
    const supplierId = existant ? existant.id : (await tx.supplier.create({ data: { name: nom }, select: { id: true } })).id
    await tx.$executeRaw`
      UPDATE "suppliers" SET
        "phone" = COALESCE(${phone}, "phone"), "taxId" = COALESCE(${taxId}, "taxId"),
        "address" = COALESCE(${address}, "address"), "updatedAt" = now()
      WHERE "id" = ${supplierId}`

    const jour = params.day ?? businessDay()
    const reference = params.reference?.trim() || null
    const bl = params.deliveryNote?.trim() || null
    const note = params.note?.trim() || null
    // …et l'on n'ajoute pas non plus de lignes à une facture verrouillée.
    if (await factureVerrouillee({ supplierId, reference, businessDay: jour }, tx)) {
      throw new WorkflowError(FACTURE_VERROUILLEE)
    }

    if (aRetirer.length > 0) await tx.stockEntry.deleteMany({ where: { id: { in: aRetirer } } })

    // Les photos de la facture suivent son en-tête s'il change.
    const ancienne = avant[0]
    if (ancienne) {
      const jourAvant = new Date(ancienne.businessDay.toISOString().slice(0, 10) + 'T00:00:00.000Z')
      const jourApres = new Date(jour.toISOString().slice(0, 10) + 'T00:00:00.000Z')
      if (ancienne.supplierId !== supplierId || ancienne.reference !== reference || jourAvant.getTime() !== jourApres.getTime()) {
        await tx.invoicePhoto.updateMany({
          where: { supplierId: ancienne.supplierId, reference: ancienne.reference, businessDay: jourAvant },
          data: { supplierId, reference, businessDay: jourApres },
        })
      }
    }

    const corrigees = lignes.filter((l) => l.id)
    if (corrigees.length > 0) {
      const lignesSql = corrigees.map((l) => {
        const a = avantPar.get(l.id!)!
        // La correction ne se date que si quelque chose a vraiment changé.
        const change = a.productId !== l.productId
          || Math.abs(Number(a.quantity) - l.quantity) > 1e-9
          || Math.abs(Number(a.unitPrice) - net(l)) > 1e-9
          || Math.abs(Number(a.discountPct) - l.discountPct) > 1e-9
          || Math.abs(Number(a.vatPct) - l.vatPct) > 1e-9
          || a.reference !== reference || a.deliveryNote !== bl || a.note !== note
          || a.supplierId !== supplierId
          || a.businessDay.toISOString().slice(0, 10) !== jour.toISOString().slice(0, 10)
          || (auteur !== null && a.createdById !== auteur)
        return Prisma.sql`(${l.id}::int, ${l.productId}::int, ${l.quantity}::numeric, ${net(l)}::numeric, ${milli(l.listPrice)}::numeric, ${l.discountPct}::numeric, ${l.vatPct}::numeric, ${change}::boolean)`
      })
      await tx.$executeRaw`
        UPDATE "stock_entries" AS e SET
          "productId" = v.pid, "quantity" = v.q, "unitPrice" = v.net, "listPrice" = v.lp,
          "discountPct" = v.d, "vatPct" = v.t,
          "reference" = ${reference}, "deliveryNote" = ${bl}, "note" = ${note},
          "businessDay" = ${jour}::date, "supplierId" = ${supplierId},
          "createdById" = COALESCE(${auteur}::int, e."createdById"),
          "modifiedAt" = CASE WHEN v.change THEN now() ELSE e."modifiedAt" END,
          "modifiedById" = CASE WHEN v.change THEN ${params.actor.id}::int ELSE e."modifiedById" END
        FROM (VALUES ${Prisma.join(lignesSql)}) AS v(id, pid, q, net, lp, d, t, change)
        WHERE e."id" = v.id`
    }

    const nouvelles = lignes.filter((l) => !l.id)
    if (nouvelles.length > 0) {
      const par = auteur ?? params.actor.id
      await tx.$executeRaw`
        INSERT INTO "stock_entries"
          ("productId", "type", "quantity", "unitPrice", "listPrice", "discountPct", "vatPct",
           "reference", "deliveryNote", "note", "businessDay", "supplierId", "createdById")
        VALUES ${Prisma.join(nouvelles.map((l) => Prisma.sql`(
          ${l.productId}::int, 'ARRIVAGE'::"StockEntryType", ${l.quantity}::numeric, ${net(l)}::numeric, ${milli(l.listPrice)}::numeric,
          ${l.discountPct}::numeric, ${l.vatPct}::numeric,
          ${reference}, ${bl}, ${note}, ${jour}::date, ${supplierId}::int, ${par}::int)`))}`
    }
    return { added: nouvelles.length, updated: corrigees.length, removed: aRetirer.length, supplierId }
  }, { timeout: 20_000 })
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
 * Corrige une entrée déjà saisie : l'article, le fournisseur, la quantité,
 * le prix, la référence, et qui l'a saisie.
 *
 * Une facture mal recopiée se corrige plutôt que de se supprimer et se
 * refaire : l'écriture garde sa date et sa place dans le journal, et porte
 * désormais la date de sa correction et le nom de qui l'a faite. Seul un
 * arrivage se corrige ainsi ; un inventaire se refait.
 *
 * Le stock et le coût moyen se recalculent à la lecture : corriger ici les
 * remet d'aplomb sans autre geste.
 */
export async function updateStockEntry(params: {
  id: number
  productId: number
  supplierName?: string | null
  quantity: number
  unitPrice: number
  reference?: string | null
  createdById?: number | null
  actorId: number
  actorRole: string
}) {
  if (!Number.isFinite(params.quantity) || params.quantity <= 0) throw new WorkflowError('Quantité invalide.')
  if (!Number.isFinite(params.unitPrice) || params.unitPrice < 0) throw new WorkflowError('Prix unitaire invalide.')
  return prisma.$transaction(async (tx) => {
    const entree = await tx.stockEntry.findUnique({ where: { id: params.id }, select: { id: true, type: true, createdById: true } })
    if (!entree) throw new WorkflowError('Entrée introuvable.')
    const [v] = await tx.$queryRaw<{ lockedAt: Date | null }[]>`SELECT "lockedAt" FROM "stock_entries" WHERE "id" = ${params.id}`
    if (v?.lockedAt) throw new WorkflowError(FACTURE_VERROUILLEE)
    if (entree.type !== 'ARRIVAGE') throw new WorkflowError('Un inventaire ne se corrige pas : refaites-le depuis l’article.')
    const article = await tx.product.findUnique({ where: { id: params.productId }, select: { kind: true, name: true } })
    if (!article) throw new WorkflowError('Article introuvable.')
    if (article.kind === 'PREPARE') throw new WorkflowError(`${article.name} est un article préparé : entrez l’article pur.`)

    let supplierId: number | null = null
    const nom = params.supplierName?.trim().replace(/\s+/g, ' ') ?? ''
    if (nom) {
      const existant = await tx.supplier.findFirst({ where: { name: { equals: nom, mode: 'insensitive' } }, select: { id: true } })
      supplierId = existant ? existant.id : (await tx.supplier.create({ data: { name: nom }, select: { id: true } })).id
    }

    let createdById = entree.createdById
    if (params.createdById && params.createdById !== entree.createdById) {
      const auteur = await tx.user.findUnique({ where: { id: params.createdById }, select: { isActive: true, role: true } })
      if (!auteur || !auteur.isActive || (auteur.role !== 'ECONOMAN' && auteur.role !== 'ADMIN')) {
        throw new WorkflowError('L’auteur doit être un compte actif de l’économat ou de l’administration.')
      }
      createdById = params.createdById
    }

    await tx.stockEntry.update({
      where: { id: params.id },
      data: {
        productId: params.productId, supplierId, quantity: params.quantity, unitPrice: params.unitPrice,
        reference: params.reference?.trim() || null, createdById,
      },
    })
    await tx.$executeRaw`UPDATE "stock_entries" SET "modifiedAt" = now(), "modifiedById" = ${params.actorId} WHERE "id" = ${params.id}`
    return { id: params.id }
  }, { timeout: 15_000 })
}

export const FACTURE_VERROUILLEE = 'Facture verrouillée : l’administration doit d’abord la déverrouiller pour qu’on la modifie.'

type Client = Pick<typeof prisma, '$queryRaw'>

/** Une facture (fournisseur, numéro, journée) a-t-elle une ligne verrouillée ? */
export async function factureVerrouillee(cle: { supplierId: number | null; reference: string | null; businessDay: Date }, client: Client = prisma) {
  const lignes = await client.$queryRaw<{ n: number }[]>`
    SELECT 1 AS n FROM "stock_entries"
    WHERE "type" = 'ARRIVAGE' AND "lockedAt" IS NOT NULL AND "businessDay" = ${cle.businessDay}::date
      AND "supplierId" IS NOT DISTINCT FROM ${cle.supplierId}::int AND "reference" IS NOT DISTINCT FROM ${cle.reference}
    LIMIT 1`
  return lignes.length > 0
}

/**
 * Verrouille une facture — l'économat la clôt : elle ne se rouvre plus qu'à
 * l'administration — ou la déverrouille, ce que seule l'administration fait.
 * La facture se désigne par son fournisseur (nom, sans égard à la casse), son
 * numéro et sa journée ; toutes ses lignes prennent le verrou.
 */
export async function verrouillerFacture(params: {
  supplierName: string | null; reference: string | null; day: Date; locked: boolean
  actor: { id: number; role: string }
}) {
  if (!params.locked && params.actor.role !== 'ADMIN') throw new WorkflowError('Seule l’administration déverrouille une facture.')
  const nom = params.supplierName?.trim().replace(/\s+/g, ' ') ?? ''
  let supplierId: number | null = null
  if (nom) {
    const f = await prisma.supplier.findFirst({ where: { name: { equals: nom, mode: 'insensitive' } }, select: { id: true } })
    if (!f) throw new WorkflowError('Facture introuvable : rechargez la page.')
    supplierId = f.id
  }
  const reference = params.reference?.trim() || null
  const n = params.locked
    ? await prisma.$executeRaw`
        UPDATE "stock_entries" SET
          "lockedAt" = COALESCE("lockedAt", now()), "lockedById" = CASE WHEN "lockedAt" IS NULL THEN ${params.actor.id}::int ELSE "lockedById" END
        WHERE "type" = 'ARRIVAGE' AND "businessDay" = ${params.day}::date
          AND "supplierId" IS NOT DISTINCT FROM ${supplierId}::int AND "reference" IS NOT DISTINCT FROM ${reference}`
    : await prisma.$executeRaw`
        UPDATE "stock_entries" SET "lockedAt" = NULL, "lockedById" = NULL
        WHERE "type" = 'ARRIVAGE' AND "businessDay" = ${params.day}::date
          AND "supplierId" IS NOT DISTINCT FROM ${supplierId}::int AND "reference" IS NOT DISTINCT FROM ${reference}`
  if (n === 0) throw new WorkflowError('Facture introuvable : rechargez la page.')
  return n
}

export type ComplementEntree = {
  modifiedAt: Date | null; modifiedBy: string | null
  listPrice: number | null; discountPct: number; vatPct: number
  deliveryNote: string | null; supplierAddress: string | null
  lockedAt: Date | null; lockedBy: string | null
}

/**
 * Ce que la facture ajoute à chaque entrée : sa correction, son prix avant
 * remise, sa remise, sa TVA, son bon de livraison, l'adresse du fournisseur.
 * Lu en une requête pour toute la liste.
 */
export async function complementsDesEntrees(ids: number[]) {
  if (ids.length === 0) return new Map<number, ComplementEntree>()
  const rows = await prisma.$queryRaw<{
    id: number; modifiedAt: Date | null; fullName: string | null; listPrice: unknown
    discountPct: unknown; vatPct: unknown; deliveryNote: string | null; address: string | null
    lockedAt: Date | null; lockedBy: string | null
  }[]>`
    SELECT e."id", e."modifiedAt", u."fullName", e."listPrice", e."discountPct", e."vatPct", e."deliveryNote", s."address",
           e."lockedAt", l."fullName" AS "lockedBy"
    FROM "stock_entries" e
    LEFT JOIN "users" u ON u."id" = e."modifiedById"
    LEFT JOIN "users" l ON l."id" = e."lockedById"
    LEFT JOIN "suppliers" s ON s."id" = e."supplierId"
    WHERE e."id" IN (${Prisma.join(ids)})`
  return new Map(rows.map((r) => [r.id, {
    modifiedAt: r.modifiedAt, modifiedBy: r.fullName,
    listPrice: r.listPrice === null ? null : Number(r.listPrice),
    discountPct: Number(r.discountPct), vatPct: Number(r.vatPct),
    deliveryNote: r.deliveryNote, supplierAddress: r.address,
    lockedAt: r.lockedAt, lockedBy: r.lockedBy,
  } satisfies ComplementEntree]))
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
    const detache = await prisma.product.update({ where: { id: productId }, data: { parentId: null, motherQuantity: null, kind: 'FINI' }, select: { id: true } })
    await prisma.preparedComposition.deleteMany({ where: { productId } })
    await prisma.$executeRaw`UPDATE "products" SET "linkedAt" = NULL WHERE "id" = ${productId}`
    return detache
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
  const avant = await prisma.product.findUnique({ where: { id: productId }, select: { parentId: true } })
  await devenirArticlePur(parentId)
  const lie = await prisma.product.update({ where: { id: productId }, data: { parentId, motherQuantity, kind: 'PREPARE' }, select: { id: true } })
  // La date d'entrée dans la famille ne se pose qu'au rattachement : corriger
  // une quantité ne doit pas faire passer l'article en fin de liste.
  if (avant?.parentId !== parentId) {
    await prisma.$executeRaw`UPDATE "products" SET "linkedAt" = now() WHERE "id" = ${productId}`
  } else {
    await prisma.$executeRaw`UPDATE "products" SET "linkedAt" = now() WHERE "id" = ${productId} AND "linkedAt" IS NULL`
  }
  return lie
}

/**
 * Crée un article préparé qui n'existe pas encore au catalogue.
 *
 * L'économat prépare des articles que personne n'a jamais achetés : le plat
 * d'escalope grillée n'a pas de facture, donc pas de fiche au catalogue. Il
 * naît ici, dans la famille de son article pur — dont il reprend la famille
 * de produits — avec sa composition. La référence suit la numérotation du
 * catalogue.
 */
export async function createPrepared(params: { parentId: number; name: string; unit: string; motherQuantity: number; categoryId?: number | null }) {
  const nom = params.name.trim().replace(/\s+/g, ' ')
  if (nom.length < 2) throw new WorkflowError('Donnez un nom à l’article.')
  if (nom.length > 120) throw new WorkflowError('Nom trop long.')
  if (!Number.isFinite(params.motherQuantity) || params.motherQuantity <= 0) {
    throw new WorkflowError('La quantité contenue dans une unité doit être positive.')
  }
  return prisma.$transaction(async (tx) => {
    const pur = await tx.product.findUnique({ where: { id: params.parentId }, select: { id: true, name: true, categoryId: true, parentId: true, isActive: true } })
    if (!pur || !pur.isActive) throw new WorkflowError('Article pur introuvable.')
    if (pur.parentId) throw new WorkflowError(`${pur.name} est lui-même un article préparé : choisissez son article pur.`)
    const doublon = await tx.product.findFirst({ where: { name: { equals: nom, mode: 'insensitive' } }, select: { name: true } })
    if (doublon) throw new WorkflowError(`« ${doublon.name} » existe déjà au catalogue : choisissez-le dans la liste.`)
    const unite = await tx.unit.findFirst({ where: { symbol: { equals: params.unit.trim(), mode: 'insensitive' } }, select: { id: true } })
    if (!unite) throw new WorkflowError(`L’unité « ${params.unit} » n’existe pas : créez-la d’abord dans les unités.`)
    // La référence : le plus grand numéro du catalogue, plus un — calculé en
    // base, sans charger toutes les références.
    const [{ max }] = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT max("reference"::int) AS max FROM "products" WHERE "reference" ~ '^[0-9]+$'`
    const cree = await tx.product.create({
      data: {
        reference: String((max ?? 0) + 1).padStart(4, '0'),
        name: nom, categoryId: params.categoryId ?? pur.categoryId, baseUnitId: unite.id,
        kind: 'PREPARE', parentId: pur.id, motherQuantity: params.motherQuantity,
      },
      select: { id: true },
    })
    await tx.product.update({ where: { id: pur.id }, data: { kind: 'MERE' } })
    await tx.departmentProduct.deleteMany({ where: { productId: pur.id } })
    await tx.stockFixe.deleteMany({ where: { productId: pur.id } })
    await tx.$executeRaw`UPDATE "products" SET "linkedAt" = now() WHERE "id" = ${cree.id}`
    return cree
  }, { timeout: 15_000 })
}

/**
 * Crée un article dans une famille du catalogue, depuis la fiche articles.
 * Il entre au stock comme n'importe quel article ; il devient « mère » dès
 * qu'on lui rattache un préparé.
 */
export async function createPure(params: { name: string; unit?: string | null; categoryId?: number | null }) {
  const nom = params.name.trim().replace(/\s+/g, ' ')
  if (nom.length < 2) throw new WorkflowError('Donnez un nom à l’article.')
  if (nom.length > 120) throw new WorkflowError('Nom trop long.')
  if (!params.categoryId) throw new WorkflowError('Choisissez la famille de l’article.')
  const categoryId = params.categoryId
  return prisma.$transaction(async (tx) => {
    const doublon = await tx.product.findFirst({ where: { name: { equals: nom, mode: 'insensitive' } }, select: { name: true } })
    if (doublon) throw new WorkflowError(`« ${doublon.name} » existe déjà : choisissez-le dans la liste.`)
    const categorie = await tx.category.findUnique({ where: { id: categoryId }, select: { id: true } })
    if (!categorie) throw new WorkflowError('Famille introuvable.')
    const symbole = params.unit?.trim() || 'kg'
    const unite = await tx.unit.findFirst({ where: { symbol: { equals: symbole, mode: 'insensitive' } }, select: { id: true } })
    if (!unite) throw new WorkflowError(`L’unité « ${symbole} » n’existe pas.`)
    const [{ max }] = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT max("reference"::int) AS max FROM "products" WHERE "reference" ~ '^[0-9]+$'`
    return tx.product.create({
      data: { reference: String((max ?? 0) + 1).padStart(4, '0'), name: nom, categoryId: categorie.id, baseUnitId: unite.id },
      select: { id: true, reference: true },
    })
  }, { timeout: 15_000 })
}

/* --------------------------------------------- familles du catalogue */

function nomDeFamille(name: string) {
  const nom = name.trim().replace(/\s+/g, ' ').toUpperCase()
  if (nom.length < 2) throw new WorkflowError('Donnez un nom à la famille.')
  if (nom.length > 80) throw new WorkflowError('Nom trop long.')
  return nom
}

/** Crée une famille du catalogue (FRUITS DE MER, VOLAILLES…). */
export async function createCategory(name: string) {
  const nom = nomDeFamille(name)
  const doublon = await prisma.category.findFirst({ where: { name: { equals: nom, mode: 'insensitive' } }, select: { name: true } })
  if (doublon) throw new WorkflowError(`La famille « ${doublon.name} » existe déjà.`)
  const [{ max }] = await prisma.$queryRaw<{ max: number | null }[]>`SELECT max("sortOrder") AS max FROM "categories"`
  return prisma.category.create({ data: { name: nom, sortOrder: (max ?? 0) + 10 }, select: { id: true, name: true } })
}

/** Renomme une famille du catalogue. */
export async function renameCategory(id: number, name: string) {
  const nom = nomDeFamille(name)
  const doublon = await prisma.category.findFirst({ where: { name: { equals: nom, mode: 'insensitive' }, NOT: { id } }, select: { name: true } })
  if (doublon) throw new WorkflowError(`La famille « ${doublon.name} » existe déjà.`)
  const { count } = await prisma.category.updateMany({ where: { id }, data: { name: nom } })
  if (count === 0) throw new WorkflowError('Famille introuvable.')
  return id
}

/** Supprime une famille du catalogue — vide : ses articles changent d'abord de famille. */
export async function deleteCategory(id: number) {
  const n = await prisma.product.count({ where: { categoryId: id } })
  if (n > 0) throw new WorkflowError(`Cette famille porte encore ${n} article(s) : déplacez-les d’abord dans une autre famille.`)
  await prisma.$transaction([
    prisma.departmentCategory.deleteMany({ where: { categoryId: id } }),
    prisma.category.deleteMany({ where: { id } }),
  ])
  return true
}

/**
 * Supprime un article depuis la fiche articles.
 *
 * Un article sans historique disparaît. S'il a déjà servi — commandes,
 * entrées de stock, préparations, fiches, ventes déclarées — on ne peut pas
 * l'effacer sans casser ces écritures : il est désactivé et retiré des
 * feuilles de commande, son historique reste. Un article pur qui porte
 * encore des préparés se garde : on les détache ou on les supprime d'abord.
 */
export async function deleteArticle(productId: number, detacherPrepares = false): Promise<'supprime' | 'desactive'> {
  const article = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      name: true,
      _count: { select: { portions: { where: { isActive: true } }, lines: true, stockEntries: true, preparationsMade: true, preparationsFrom: true, recipeLines: true, declaredSales: true } },
    },
  })
  if (!article) throw new WorkflowError('Article introuvable.')
  const n = article._count
  if (n.portions > 0) {
    if (!detacherPrepares) throw new WorkflowError(`${article.name} est la base de ${n.portions} article(s) préparé(s) : confirmez qu’ils soient détachés.`)
    // Ses préparés restent, comme articles ordinaires, sans composition.
    const ids = (await prisma.product.findMany({ where: { parentId: productId }, select: { id: true } })).map((x) => x.id)
    await prisma.$transaction([
      prisma.product.updateMany({ where: { id: { in: ids } }, data: { parentId: null, motherQuantity: null, kind: 'FINI' } }),
      prisma.preparedComposition.deleteMany({ where: { productId: { in: ids } } }),
      prisma.$executeRaw`UPDATE "products" SET "linkedAt" = NULL WHERE "id" IN (${Prisma.join(ids)})`,
      prisma.product.update({ where: { id: productId }, data: { kind: 'FINI' } }),
    ])
  }
  const liens = n.lines + n.stockEntries + n.preparationsMade + n.preparationsFrom + n.recipeLines + n.declaredSales
  if (liens > 0) {
    await prisma.$transaction([
      prisma.product.update({ where: { id: productId }, data: { isActive: false } }),
      prisma.departmentProduct.deleteMany({ where: { productId } }),
      prisma.stockFixe.deleteMany({ where: { productId } }),
    ])
    return 'desactive'
  }
  await prisma.$transaction([
    prisma.departmentProduct.deleteMany({ where: { productId } }),
    prisma.stockFixe.deleteMany({ where: { productId } }),
    prisma.product.delete({ where: { id: productId } }),
  ])
  return 'supprime'
}

/** Range un article dans une autre famille du catalogue. */
export async function setProductCategory(productId: number, categoryId: number) {
  const famille = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } })
  if (!famille) throw new WorkflowError('Famille introuvable.')
  const { count } = await prisma.product.updateMany({ where: { id: productId }, data: { categoryId } })
  if (count === 0) throw new WorkflowError('Article introuvable.')
  return productId
}

/** Le stock fixe d'un article préparé, département par département. */
export async function preparedStockFixe(productId: number) {
  const rows = await prisma.stockFixe.findMany({ where: { productId }, select: { departmentId: true, quantity: true } })
  return rows.map((r) => ({ departmentId: String(r.departmentId), quantity: Number(r.quantity) }))
}

/**
 * Règle le stock fixe d'un article préparé dans ses départements.
 *
 * Sans stock fixe, l'article figure sur la feuille mais ne commande rien :
 * la commande est le stock fixe moins ce que le rayon a en main. Un zéro
 * retire la cible. On ne règle que les départements où l'article figure.
 */
export async function setPreparedStockFixe(productId: number, lines: { departmentId: number; quantity: number }[]) {
  const article = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } })
  if (!article) throw new WorkflowError('Article introuvable.')
  for (const l of lines) {
    if (!Number.isFinite(l.quantity) || l.quantity < 0) throw new WorkflowError('Stock fixe invalide.')
  }
  const permis = new Set((await departementsDesArticles([productId])).get(productId) ?? [])
  const retenues = lines.filter((l) => permis.has(l.departmentId))
  await prisma.$transaction(async (tx) => {
    const aZero = retenues.filter((l) => l.quantity === 0).map((l) => l.departmentId)
    if (aZero.length > 0) await tx.stockFixe.deleteMany({ where: { productId, departmentId: { in: aZero } } })
    for (const l of retenues.filter((x) => x.quantity > 0)) {
      await tx.stockFixe.upsert({
        where: { departmentId_productId: { departmentId: l.departmentId, productId } },
        update: { quantity: l.quantity },
        create: { departmentId: l.departmentId, productId, quantity: l.quantity },
      })
    }
  })
  return retenues.length
}

/**
 * Les départements qui peuvent commander chaque article préparé.
 *
 * Deux façons d'y figurer, comme pour tout article : sur la feuille du
 * département, ligne à ligne ; ou, pour un département sans feuille, par
 * sa famille. On rend l'appartenance réelle, quelle que soit la façon.
 */
export async function departementsDesArticles(ids?: number[]): Promise<Map<number, number[]>> {
  const filtre = ids ? { id: { in: ids } } : {}
  const [articles, lignes, avecFeuille, familles] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true, kind: { not: 'MERE' }, ...filtre }, select: { id: true, categoryId: true } }),
    prisma.departmentProduct.findMany({ where: ids ? { productId: { in: ids } } : {}, select: { productId: true, departmentId: true } }),
    prisma.departmentProduct.groupBy({ by: ['departmentId'] }),
    prisma.departmentCategory.findMany({ select: { departmentId: true, categoryId: true } }),
  ])
  const feuille = new Set(avecFeuille.map((d) => d.departmentId))
  // Index : la feuille de chaque article, et les départements sans feuille
  // qui suivent chaque famille.
  const parArticle = new Map<number, number[]>()
  for (const l of lignes) parArticle.set(l.productId, [...(parArticle.get(l.productId) ?? []), l.departmentId])
  const parFamille = new Map<number, number[]>()
  for (const f of familles) if (!feuille.has(f.departmentId)) parFamille.set(f.categoryId, [...(parFamille.get(f.categoryId) ?? []), f.departmentId])
  const out = new Map<number, number[]>()
  for (const p of articles) {
    const ids = new Set<number>([...(parArticle.get(p.id) ?? []), ...(parFamille.get(p.categoryId) ?? [])])
    out.set(p.id, [...ids].sort((a, b) => a - b))
  }
  return out
}

/**
 * Règle les départements qui peuvent commander un article préparé.
 *
 * L'article entre sur la feuille des départements cochés, à la suite de sa
 * famille, et sort de celle des autres — avec son stock fixe, qui n'a plus
 * lieu d'être. Un département sans feuille suit ses familles : on écrit
 * d'abord sa feuille telle qu'il la voit aujourd'hui, article par article,
 * pour que l'ajout d'un seul article ne lui retire pas tous les autres.
 */
export async function setPreparedDepartments(productId: number, departmentIds: number[]) {
  const voulus = new Set(departmentIds)
  return prisma.$transaction(async (tx) => {
    const article = await tx.product.findUnique({ where: { id: productId }, select: { kind: true, categoryId: true, name: true } })
    if (!article) throw new WorkflowError('Article introuvable.')
    if (article.kind === 'MERE') throw new WorkflowError(`${article.name} est un article pur : il ne se commande pas, seuls ses préparés vont aux départements.`)
    const departements = await tx.department.findMany({ where: { isActive: true }, select: { id: true } })
    const connus = new Set(departements.map((d) => d.id))
    for (const id of voulus) if (!connus.has(id)) throw new WorkflowError('Un des départements est inconnu ou désactivé.')

    for (const { id: departmentId } of departements) {
      let feuille = await tx.departmentProduct.findMany({
        where: { departmentId }, orderBy: { sortOrder: 'asc' },
        select: { productId: true, sortOrder: true, product: { select: { categoryId: true } } },
      })
      const parFamille = feuille.length === 0
        ? (await tx.departmentCategory.count({ where: { departmentId, categoryId: article.categoryId } })) > 0
        : false
      const present = feuille.length > 0 ? feuille.some((r) => r.productId === productId) : parFamille
      const voulu = voulus.has(departmentId)
      if (present === voulu) continue

      // Le département suivait ses familles : on fige sa feuille telle quelle.
      if (feuille.length === 0) {
        const catalogue = await tx.product.findMany({
          where: { isActive: true, category: { departments: { some: { departmentId } } } },
          select: { id: true, categoryId: true },
          orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
        })
        if (catalogue.length > 0) {
          await tx.departmentProduct.createMany({
            data: catalogue.map((p, i) => ({ departmentId, productId: p.id, sortOrder: (i + 1) * 10 })),
            skipDuplicates: true,
          })
        }
        feuille = catalogue.map((p, i) => ({ productId: p.id, sortOrder: (i + 1) * 10, product: { categoryId: p.categoryId } }))
      }

      if (voulu) {
        // À la suite de sa famille, ou en fin de feuille si elle n'y est pas.
        let apres: number | null = null
        for (const r of feuille) if (r.product.categoryId === article.categoryId) apres = r.sortOrder
        if (apres !== null) {
          await tx.departmentProduct.updateMany({ where: { departmentId, sortOrder: { gt: apres } }, data: { sortOrder: { increment: 10 } } })
        }
        await tx.departmentProduct.upsert({
          where: { departmentId_productId: { departmentId, productId } },
          update: {},
          create: { departmentId, productId, sortOrder: apres !== null ? apres + 5 : (feuille.at(-1)?.sortOrder ?? 0) + 10 },
        })
      } else {
        await tx.departmentProduct.deleteMany({ where: { departmentId, productId } })
        await tx.stockFixe.deleteMany({ where: { departmentId, productId } })
        await tx.preparedComposition.deleteMany({ where: { departmentId, productId } })
      }
    }
    return [...voulus].sort((a, b) => a - b)
  }, { timeout: 20_000 })
}

/**
 * Renomme un article préparé.
 *
 * L'économat nomme ce qu'il prépare : « ESCALOPE CUISINE 2.000 » devient
 * « ESCALOPE CUISINE 1.500 » le jour où la portion change. Seuls les
 * préparés se renomment d'ici ; le reste du catalogue appartient à
 * l'administration. Les commandes passées gardent le nom qu'elles portaient
 * à l'envoi : renommer ne récrit aucun bon.
 */
export async function renamePrepared(productId: number, name: string, unit?: string | null) {
  const propre = name.trim().replace(/\s+/g, ' ')
  if (propre.length < 2) throw new WorkflowError('Nom trop court.')
  if (propre.length > 120) throw new WorkflowError('Nom trop long.')
  const article = await prisma.product.findUnique({ where: { id: productId }, select: { kind: true } })
  if (!article) throw new WorkflowError('Article introuvable.')
  const doublon = await prisma.product.findFirst({
    where: { name: { equals: propre, mode: 'insensitive' }, NOT: { id: productId } },
    select: { name: true },
  })
  if (doublon) throw new WorkflowError(`« ${doublon.name} » existe déjà.`)
  // L'unité dans laquelle on compte le préparé : portion, kilo, pièce… Elle
  // se choisit parmi celles du catalogue ; le stock déjà compté ne bouge
  // pas, il se lit simplement dans la nouvelle unité.
  let baseUnitId: number | undefined
  const symbole = unit?.trim()
  if (symbole) {
    const u = await prisma.unit.findFirst({ where: { symbol: { equals: symbole, mode: 'insensitive' } }, select: { id: true } })
    if (!u) throw new WorkflowError(`L’unité « ${symbole} » n’existe pas : créez-la d’abord dans les unités.`)
    baseUnitId = u.id
  }
  return prisma.product.update({ where: { id: productId }, data: { name: propre, ...(baseUnitId && { baseUnitId }) }, select: { id: true } })
}

/** Change la nature d'un article : fini ou mère. Un préparé passe par `setProductPortion`. */
export async function setProductKind(productId: number, kind: 'FINI' | 'MERE') {
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { portions: { select: { id: true } }, name: true } })
  if (!p) throw new WorkflowError('Article introuvable.')
  if (kind === 'FINI' && p.portions.length > 0) {
    throw new WorkflowError(`${p.name} a des articles préparés : détachez-les avant d’en faire un article fini.`)
  }
  if (kind === 'MERE') { await devenirArticlePur(productId); return { id: productId } }
  return prisma.product.update({ where: { id: productId }, data: { kind, parentId: null, motherQuantity: null }, select: { id: true } })
}

/**
 * Un article pur — l'escalope achetée au kilo — ne se commande jamais : seuls
 * ses préparés vont aux départements. Il quitte donc les feuilles de commande
 * et perd son stock fixe en devenant pur.
 */
export async function devenirArticlePur(productId: number) {
  await prisma.$transaction([
    prisma.product.update({ where: { id: productId }, data: { kind: 'MERE', parentId: null, motherQuantity: null } }),
    prisma.departmentProduct.deleteMany({ where: { productId } }),
    prisma.stockFixe.deleteMany({ where: { productId } }),
    prisma.preparedComposition.deleteMany({ where: { productId } }),
  ])
}

/** Donne à une famille son article pur : il y est rangé, et ne se commande plus. */
export async function setFamilyPure(categoryId: number, productId: number) {
  const [famille, article] = await Promise.all([
    prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } }),
    prisma.product.findUnique({ where: { id: productId }, select: { parentId: true, name: true } }),
  ])
  if (!famille) throw new WorkflowError('Famille introuvable.')
  if (!article) throw new WorkflowError('Article introuvable.')
  if (article.parentId) throw new WorkflowError(`${article.name} est un article préparé : il ne peut pas être l’article pur d’une famille.`)
  await prisma.product.update({ where: { id: productId }, data: { categoryId } })
  await devenirArticlePur(productId)
  return productId
}

/**
 * La composition d'un préparé, département par département : ce que contient
 * une unité de l'article pur, pour chaque département qui le commande. La
 * contenance de l'article (`motherQuantity`) suit la première, pour les
 * écrans qui n'en lisent qu'une.
 */
export async function setPreparedCompositions(productId: number, lines: { departmentId: number; quantity: number }[]) {
  const article = await prisma.product.findUnique({ where: { id: productId }, select: { kind: true, parentId: true, name: true } })
  if (!article) throw new WorkflowError('Article introuvable.')
  if (article.kind !== 'PREPARE' || !article.parentId) throw new WorkflowError(`${article.name} n’est pas un article préparé : choisissez d’abord son article pur.`)
  for (const l of lines) {
    if (!Number.isFinite(l.quantity) || l.quantity <= 0) throw new WorkflowError('Chaque département doit avoir une quantité positive.')
  }
  const tries = [...lines].sort((a, b) => a.departmentId - b.departmentId)
  await prisma.$transaction([
    prisma.preparedComposition.deleteMany({ where: { productId } }),
    ...(tries.length > 0 ? [prisma.preparedComposition.createMany({ data: tries.map((l) => ({ productId, departmentId: l.departmentId, quantity: l.quantity })) })] : []),
    ...(tries.length > 0 ? [prisma.product.update({ where: { id: productId }, data: { motherQuantity: tries[0].quantity } })] : []),
  ])
  return tries.length
}
