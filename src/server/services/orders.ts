import 'server-only'
import { prisma } from '@/server/db'
import { businessDay } from '@/lib/utils'
import type { SessionUser } from '@/server/auth/session'

export class WorkflowError extends Error {}

/// Ce que l'employé saisit : le stock qu'il a réellement en rayon.
export type OrderLineInput = { productId: number; quantityOnHand: number }

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
  const departmentId = params.actor.departmentId

  const seen = new Set<number>()
  for (const l of params.lines) {
    if (seen.has(l.productId)) {
      throw new WorkflowError('Un même article figure deux fois dans la commande.')
    }
    if (!Number.isFinite(l.quantityOnHand) || l.quantityOnHand < 0) {
      throw new WorkflowError('Stock saisi invalide.')
    }
    seen.add(l.productId)
  }
  if (seen.size === 0) throw new WorkflowError('Aucune ligne saisie.')

  const day = businessDay()

  return prisma.$transaction(async (tx) => {
    // Garde-fou : on revérifie côté serveur que chaque article appartient bien
    // à une catégorie affectée au département — le client peut mentir.
    // Même règle que l'affichage : une feuille explicite prime sur les
    // catégories, sinon un article retiré de la feuille resterait commandable.
    const hasSheet =
      (await tx.departmentProduct.count({ where: { departmentId } })) > 0

    const allowed = await tx.product.findMany({
      where: {
        id: { in: [...seen] },
        isActive: true,
        ...(hasSheet
          ? { departments: { some: { departmentId } } }
          : { category: { departments: { some: { departmentId } } } }),
      },
      select: {
        id: true, name: true, reference: true, baseUnitId: true, sortOrder: true,
        category: { select: { name: true } },
      },
    })
    if (allowed.length !== seen.size) {
      throw new WorkflowError('Un des articles n’est pas disponible pour votre département.')
    }
    const byId = new Map(allowed.map((p) => [p.id, p]))

    // Le stock fixe est relu en base, jamais pris du client : c'est lui qui
    // fixe la quantité commandée, et seule l'administration le règle.
    const pars = await tx.stockFixe.findMany({
      where: { departmentId, productId: { in: [...seen] } },
      select: { productId: true, quantity: true },
    })
    const parBy = new Map(pars.map((p) => [p.productId, Number(p.quantity)]))

    // Quantité = stock fixe − stock compté, jamais négative. Un article sans
    // stock fixe vaut 0 : rien n'est commandé tant que l'admin ne l'a pas réglé.
    const computed = params.lines
      .map((l) => {
        const target = parBy.get(l.productId) ?? 0
        const asked = Math.max(target - l.quantityOnHand, 0)
        return { ...l, target, asked }
      })
      .filter((l) => l.asked > 0)

    if (computed.length === 0) {
      throw new WorkflowError(
        'Vos stocks couvrent déjà le stock fixe — il n’y a rien à commander.',
      )
    }

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
          create: computed.map((l) => {
            const p = byId.get(l.productId)!
            return {
              productId: p.id,
              unitId: p.baseUnitId,
              productName: p.name,
              productRef: p.reference,
              categoryName: p.category.name,
              stockFixe: l.target,
              quantityOnHand: l.quantityOnHand,
              quantityAsked: l.asked,
              sortOrder: p.sortOrder,
            }
          }),
        },
      },
      select: { id: true, reference: true, ticketNumber: true },
    })
  })
}

/**
 * L'employé corrige une commande que l'économat n'a pas encore prise en main.
 *
 * Les lignes sont remplacées, pas fusionnées : l'employé recompte toute sa
 * feuille, donc un article absent du nouvel envoi est un article qu'il ne veut
 * plus. Le ticket garde son numéro et sa référence — l'économat a pu
 * l'imprimer, et renuméroter ferait circuler deux papiers pour une commande.
 *
 * La garde est ici, pas seulement à l'écran : le statut peut changer entre le
 * moment où la page s'affiche et celui où l'employé valide.
 */
export async function updateOrder(params: {
  orderId: number
  actor: SessionUser & { departmentId: number }
  lines: OrderLineInput[]
  note?: string | null
}) {
  const { orderId, actor } = params
  const departmentId = actor.departmentId

  const seen = new Set<number>()
  for (const l of params.lines) {
    if (seen.has(l.productId)) {
      throw new WorkflowError('Un même article figure deux fois dans la commande.')
    }
    if (!Number.isFinite(l.quantityOnHand) || l.quantityOnHand < 0) {
      throw new WorkflowError('Stock saisi invalide.')
    }
    seen.add(l.productId)
  }
  if (seen.size === 0) throw new WorkflowError('Aucune ligne saisie.')

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { status: true, departmentId: true, createdById: true },
    })
    if (!order) throw new WorkflowError('Commande introuvable.')

    // Sa commande, son département : un employé ne corrige pas celle d'un autre.
    if (order.createdById !== actor.id || order.departmentId !== departmentId) {
      throw new WorkflowError('Cette commande n’est pas la vôtre.')
    }
    if (order.status !== 'PENDING') {
      throw new WorkflowError(
        'L’économat a déjà pris cette commande en charge : elle n’est plus modifiable.',
      )
    }

    const hasSheet = (await tx.departmentProduct.count({ where: { departmentId } })) > 0
    const allowed = await tx.product.findMany({
      where: {
        id: { in: [...seen] },
        isActive: true,
        ...(hasSheet
          ? { departments: { some: { departmentId } } }
          : { category: { departments: { some: { departmentId } } } }),
      },
      select: {
        id: true, name: true, reference: true, baseUnitId: true, sortOrder: true,
        category: { select: { name: true } },
      },
    })
    if (allowed.length !== seen.size) {
      throw new WorkflowError('Un des articles n’est pas disponible pour votre département.')
    }
    const byId = new Map(allowed.map((p) => [p.id, p]))

    const pars = await tx.stockFixe.findMany({
      where: { departmentId, productId: { in: [...seen] } },
      select: { productId: true, quantity: true },
    })
    const parBy = new Map(pars.map((p) => [p.productId, Number(p.quantity)]))

    // Même calcul qu'à la création : la quantité se déduit du stock fixe lu en
    // base, jamais de ce que le client envoie.
    const computed = params.lines
      .map((l) => {
        const target = parBy.get(l.productId) ?? 0
        return { ...l, target, asked: Math.max(target - l.quantityOnHand, 0) }
      })
      .filter((l) => l.asked > 0)

    if (computed.length === 0) {
      throw new WorkflowError(
        'Vos stocks couvrent déjà le stock fixe — il n’y a rien à commander.',
      )
    }

    await tx.orderLine.deleteMany({ where: { orderId } })
    await tx.order.update({
      where: { id: orderId },
      data: {
        note: params.note?.trim() || null,
        lines: {
          create: computed.map((l) => {
            const p = byId.get(l.productId)!
            return {
              productId: p.id,
              unitId: p.baseUnitId,
              productName: p.name,
              productRef: p.reference,
              categoryName: p.category.name,
              stockFixe: l.target,
              quantityOnHand: l.quantityOnHand,
              quantityAsked: l.asked,
              sortOrder: p.sortOrder,
            }
          }),
        },
      },
    })
    return { id: orderId }
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

    // Chaque ligne doit avoir été examinée. Valider en silence ce qui n'a pas
    // été touché ferait signer un bon pour des articles que personne n'a
    // vérifiés en rayon — et masquerait une rupture jamais constatée.
    // « Tout valider » reste là pour traiter une commande conforme d'un clic.
    const pending = order.lines.filter((l) => l.status === 'PENDING').length
    if (pending > 0) {
      throw new WorkflowError(
        `${pending} ligne(s) non traitée(s). Validez-les, ajustez-les ou marquez-les `
        + `en rupture avant d’émettre le bon.`,
      )
    }

    return tx.order.update({
      where: { id: orderId },
      data: { status: 'DELIVERED', deliveredAt: new Date(), processedById: actorId },
      select: { id: true },
    })
  })
}

/// Ce que l'employé déclare avoir compté, ligne par ligne.
export type ReceivedLine = { lineId: number; quantityReceived: number }

/**
 * L'employé confirme la réception — le dossier se clôt.
 *
 * Les quantités comptées sont facultatives : une commande peut être reçue sans
 * vérification détaillée. Quand elles sont fournies, chaque ligne conserve ce
 * qui a été réellement reçu, et l'écart avec la quantité servie reste lisible
 * par l'économat et la direction.
 */
export async function receiveOrder(
  orderId: number,
  actor: SessionUser,
  received?: ReceivedLine[],
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        departmentId: true,
        lines: { select: { id: true, quantityServed: true, status: true } },
      },
    })
    if (!order) throw new WorkflowError('Commande introuvable.')
    if (order.departmentId !== actor.departmentId) {
      throw new WorkflowError('Cette commande ne concerne pas votre département.')
    }
    if (order.status !== 'DELIVERED') {
      throw new WorkflowError('Cette commande n’a pas encore été livrée.')
    }

    const known = new Map(order.lines.map((l) => [l.id, l]))

    if (received && received.length > 0) {
      for (const r of received) {
        if (!known.has(r.lineId)) {
          throw new WorkflowError('Ligne inconnue pour cette commande.')
        }
        if (!Number.isFinite(r.quantityReceived) || r.quantityReceived < 0) {
          throw new WorkflowError('Quantité reçue invalide.')
        }
        await tx.orderLine.update({
          where: { id: r.lineId },
          data: { quantityReceived: r.quantityReceived },
        })
      }
    } else {
      // Sans vérification détaillée, on considère reçu ce qui a été servi :
      // la colonne ne doit pas rester vide et laisser croire à un oubli.
      for (const l of order.lines) {
        if (l.status === 'REJECTED') continue
        await tx.orderLine.update({
          where: { id: l.id },
          data: { quantityReceived: l.quantityServed ?? 0 },
        })
      }
    }

    return tx.order.update({
      where: { id: orderId },
      data: { status: 'RECEIVED', receivedAt: new Date() },
      select: { id: true },
    })
  })
}
