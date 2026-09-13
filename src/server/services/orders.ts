import 'server-only'
import { prisma } from '@/server/db'
import { businessDay } from '@/lib/utils'
import type { SessionUser } from '@/server/auth/session'

export class WorkflowError extends Error {}

export type OrderLineInput = { productId: number; quantity: number }

/**
 * Enregistre une commande pour le département de l'employé.
 *
 * Règle métier : l'employé doit renseigner toutes les lignes de la feuille,
 * mais seules les quantités > 0 deviennent des lignes de commande. Le 0 est
 * une réponse valide (« je ne prends rien ») qui ne se stocke pas.
 */
export async function createOrder(params: {
  actor: SessionUser & { departmentId: number }
  lines: OrderLineInput[]
  note?: string | null
}) {
  const lines = params.lines.filter((l) => l.quantity > 0)
  if (lines.length === 0) {
    throw new WorkflowError('Toutes les quantités sont à zéro — il n’y a rien à commander.')
  }

  const seen = new Set<number>()
  for (const l of lines) {
    if (seen.has(l.productId)) {
      throw new WorkflowError('Un même article figure deux fois dans la commande.')
    }
    if (!Number.isFinite(l.quantity) || l.quantity < 0) {
      throw new WorkflowError('Quantité invalide.')
    }
    seen.add(l.productId)
  }

  const day = businessDay()
  const departmentId = params.actor.departmentId

  return prisma.$transaction(async (tx) => {
    // Garde-fou : on revérifie côté serveur que chaque article appartient bien
    // à une catégorie affectée au département — le client peut mentir.
    const allowed = await tx.product.findMany({
      where: {
        id: { in: [...seen] },
        isActive: true,
        category: { departments: { some: { departmentId } } },
      },
      select: {
        id: true, name: true, reference: true, baseUnitId: true, sortOrder: true,
        category: { select: { name: true } },
      },
    })
    if (allowed.length !== lines.length) {
      throw new WorkflowError('Un des articles n’est pas disponible pour votre département.')
    }
    const byId = new Map(allowed.map((p) => [p.id, p]))

    // Numéro de ticket : un upsert atomique sur le compteur du jour évite que
    // deux commandes simultanées réclament le même numéro.
    const counter = await tx.$queryRaw<{ lastNumber: number }[]>`
      INSERT INTO ticket_counters ("businessDay", "departmentId", "lastNumber")
      VALUES (${day}::date, ${departmentId}, 1)
      ON CONFLICT ("businessDay", "departmentId")
      DO UPDATE SET "lastNumber" = ticket_counters."lastNumber" + 1
      RETURNING "lastNumber"
    `
    const ticketNumber = counter[0].lastNumber

    const dept = await tx.department.findUniqueOrThrow({
      where: { id: departmentId },
      select: { code: true },
    })
    const reference = `${dept.code}-${day.toISOString().slice(0, 10).replace(/-/g, '')}-${String(
      ticketNumber,
    ).padStart(3, '0')}`

    return tx.order.create({
      data: {
        reference,
        ticketNumber,
        businessDay: day,
        departmentId,
        createdById: params.actor.id,
        status: 'PENDING',
        note: params.note?.trim() || null,
        lines: {
          create: lines.map((l) => {
            const p = byId.get(l.productId)!
            return {
              productId: p.id,
              unitId: p.baseUnitId,
              productName: p.name,
              productRef: p.reference,
              categoryName: p.category.name,
              quantityAsked: l.quantity,
              sortOrder: p.sortOrder,
            }
          }),
        },
      },
      select: { id: true, reference: true, ticketNumber: true },
    })
  })
}

/** L'économat ouvre la commande et commence à la servir. */
export async function acceptOrder(orderId: number, actorId: number) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } })
  if (!order) throw new WorkflowError('Commande introuvable.')
  if (order.status !== 'PENDING') {
    throw new WorkflowError('Cette commande a déjà été prise en charge.')
  }
  return prisma.order.update({
    where: { id: orderId },
    data: { status: 'ACCEPTED', processedById: actorId, acceptedAt: new Date() },
    select: { id: true },
  })
}

export type ServedLine = {
  lineId: number
  status: 'VALIDATED' | 'ADJUSTED' | 'REJECTED'
  quantityServed?: number | null
  rejectReason?: string | null
}

/** Enregistre le détail servi ligne par ligne. */
export async function setServedLines(orderId: number, actorId: number, served: ServedLine[]) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { status: true, lines: { select: { id: true, quantityAsked: true } } },
    })
    if (!order) throw new WorkflowError('Commande introuvable.')
    if (order.status !== 'ACCEPTED' && order.status !== 'PENDING') {
      throw new WorkflowError('Cette commande n’est plus modifiable.')
    }
    const known = new Map(order.lines.map((l) => [l.id, l]))

    for (const s of served) {
      const line = known.get(s.lineId)
      if (!line) throw new WorkflowError('Ligne inconnue pour cette commande.')

      const qty =
        s.status === 'REJECTED'
          ? 0
          : s.status === 'VALIDATED'
            ? Number(line.quantityAsked)
            : Number(s.quantityServed ?? 0)

      if (s.status === 'ADJUSTED' && (!Number.isFinite(qty) || qty < 0)) {
        throw new WorkflowError('Quantité servie invalide.')
      }

      await tx.orderLine.update({
        where: { id: s.lineId },
        data: {
          status: s.status,
          quantityServed: qty,
          rejectReason: s.status === 'REJECTED' ? (s.rejectReason?.trim() || 'Rupture') : null,
        },
      })
    }

    if (order.status === 'PENDING') {
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'ACCEPTED', processedById: actorId, acceptedAt: new Date() },
      })
    }
    return { id: orderId }
  })
}

/** Bon de livraison émis : la marchandise part vers le département. */
export async function deliverOrder(orderId: number, actorId: number) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { status: true, lines: { select: { id: true, status: true, quantityAsked: true } } },
    })
    if (!order) throw new WorkflowError('Commande introuvable.')
    if (order.status !== 'ACCEPTED') {
      throw new WorkflowError('Acceptez la commande avant de la livrer.')
    }

    // Les lignes jamais touchées sont réputées servies telles que demandées :
    // l'économat n'a pas à cliquer 500 fois pour valider une commande conforme.
    const untouched = order.lines.filter((l) => l.status === 'PENDING')
    for (const l of untouched) {
      await tx.orderLine.update({
        where: { id: l.id },
        data: { status: 'VALIDATED', quantityServed: l.quantityAsked },
      })
    }

    return tx.order.update({
      where: { id: orderId },
      data: { status: 'DELIVERED', deliveredAt: new Date(), processedById: actorId },
      select: { id: true },
    })
  })
}

/** L'employé confirme la réception — le dossier se clôt. */
export async function receiveOrder(orderId: number, actor: SessionUser) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, departmentId: true },
  })
  if (!order) throw new WorkflowError('Commande introuvable.')
  if (order.departmentId !== actor.departmentId) {
    throw new WorkflowError('Cette commande ne concerne pas votre département.')
  }
  if (order.status !== 'DELIVERED') {
    throw new WorkflowError('Cette commande n’a pas encore été livrée.')
  }
  return prisma.order.update({
    where: { id: orderId },
    data: { status: 'RECEIVED', receivedAt: new Date() },
    select: { id: true },
  })
}
