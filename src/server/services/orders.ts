import 'server-only'
import { prisma } from '@/server/db'
import { Prisma } from '@/generated/prisma/client'
import { businessDay } from '@/lib/utils'
import type { SessionUser } from '@/server/auth/session'
import { resteAServir } from '@/lib/reste'

export class WorkflowError extends Error {}

/// Ce que l'employé saisit : le stock qu'il a réellement en rayon.
export type OrderLineInput = { productId: number; quantityOnHand: number }

/**
 * Rang de chaque article dans la feuille du département.
 *
 * C'est le seul ordre qui fasse autorité : celui que l'administration règle
 * depuis Stock fixe, et que tout le monde doit voir — l'employé qui commande,
 * l'économat qui sert, le magasinier qui lit le bon papier.
 *
 * `Product.sortOrder` ne convient pas : il classe l'article dans sa catégorie,
 * pas dans la feuille, vaut 0 pour la plupart des articles, et serait de toute
 * façon le même pour deux départements qui rangent leurs rayons autrement.
 *
 * Un article sans ligne de feuille passe en fin de liste plutôt que de
 * remonter en tête sur un rang nul.
 */
async function sheetRanks(
  tx: { departmentProduct: { findMany: typeof prisma.departmentProduct.findMany } },
  departmentId: number,
  productIds: number[],
): Promise<Map<number, number>> {
  const rows = await tx.departmentProduct.findMany({
    where: { departmentId, productId: { in: productIds } },
    select: { productId: true, sortOrder: true },
  })
  return new Map(rows.map((r) => [r.productId, r.sortOrder]))
}

/** Rang de repli pour un article absent de la feuille : après tous les autres. */
const HORS_FEUILLE = 1_000_000

/**
 * Enregistre une commande pour le département de l'employé.
 *
 * Règle métier : l'employé doit renseigner toutes les lignes de la feuille,
 * mais seules les quantités > 0 deviennent des lignes de commande. Le 0 est
 * une réponse valide (« je ne prends rien ») qui ne se stocke pas.
 */
export async function createOrder(params: {
  actor: SessionUser
  /** Le département servi : celui de l'employé, ou celui que l'administration choisit. */
  departmentId: number
  lines: OrderLineInput[]
  note?: string | null
  /**
   * Commande urgente de l'administration : la même feuille et le même calcul
   * que l'employé — stock fixe moins stock compté — mais le ticket porte le
   * nom de l'administrateur et se signale partout en bordeaux.
   */
  urgent?: boolean
}) {
  const { departmentId, urgent = false } = params

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
        id: true, name: true, reference: true, baseUnitId: true,
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

    // L'ordre de la feuille est figé dans la ligne : la feuille peut être
    // réorganisée demain, le ticket déjà imprimé doit rester lisible tel quel.
    const rangs = await sheetRanks(tx, departmentId, [...seen])

    // Un rayon ne contient pas plus que sa cible : au-delà, le chiffre est une
    // erreur de saisie. L'accepter donnerait bien 0 à commander, mais figerait
    // un stock faux dans la ligne — celui que l'économat et l'admin liront.
    for (const l of params.lines) {
      const target = parBy.get(l.productId) ?? 0
      if (target > 0 && l.quantityOnHand > target) {
        const p = byId.get(l.productId)
        throw new WorkflowError(
          `${p?.name ?? 'Un article'} : stock fixe de ${target}, vous avez saisi `
            + `${l.quantityOnHand}. Un rayon ne peut pas dépasser sa cible.`,
        )
      }
    }

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
        isUrgent: urgent,
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
              sortOrder: rangs.get(p.id) ?? HORS_FEUILLE,
            }
          }),
        },
      },
      select: { id: true, reference: true, ticketNumber: true },
    })
  }, { timeout: 15_000 })
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
  /** L'auteur : un employé sur son département, ou l'administration sur une commande urgente qu'elle a passée. */
  actor: SessionUser
  lines: OrderLineInput[]
  note?: string | null
}) {
  const { orderId, actor } = params

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

    // Le département servi : celui de l'employé, ou celui de la commande
    // pour l'administration, qui n'en a pas.
    const departmentId = actor.role === 'ADMIN' ? order.departmentId : actor.departmentId
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
        id: true, name: true, reference: true, baseUnitId: true,
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
    const rangs = await sheetRanks(tx, departmentId, [...seen])

    // Un rayon ne contient pas plus que sa cible : au-delà, le chiffre est une
    // erreur de saisie. L'accepter donnerait bien 0 à commander, mais figerait
    // un stock faux dans la ligne — celui que l'économat et l'admin liront.
    for (const l of params.lines) {
      const target = parBy.get(l.productId) ?? 0
      if (target > 0 && l.quantityOnHand > target) {
        const p = byId.get(l.productId)
        throw new WorkflowError(
          `${p?.name ?? 'Un article'} : stock fixe de ${target}, vous avez saisi `
            + `${l.quantityOnHand}. Un rayon ne peut pas dépasser sa cible.`,
        )
      }
    }

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
              sortOrder: rangs.get(p.id) ?? HORS_FEUILLE,
            }
          }),
        },
      },
    })
    return { id: orderId }
  }, { timeout: 15_000 })
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

/**
 * L'économat rend la commande au département : elle repasse en attente.
 *
 * Accepter est un geste courant, et se tromper de ticket l'est aussi. Sans
 * retour en arrière, l'employé ne pouvait plus corriger son stock et devait
 * refaire une commande, qui prenait un second numéro pour la même sortie.
 *
 * Le travail de préparation déjà saisi est effacé : la commande redevient
 * modifiable, et des quantités servies survivant à une feuille recomptée
 * annonceraient une marchandise qui ne correspond plus à rien.
 */
export async function cancelAcceptance(orderId: number) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { status: true, deliveredAt: true, _count: { select: { refills: true } } },
    })
    if (!order) throw new WorkflowError('Commande introuvable.')
    // Une fois le bon émis, la marchandise est peut-être sortie du magasin :
    // on ne réécrit pas l'histoire d'une livraison. Sauf si l'administration
    // l'a rouverte : la commande est de nouveau entre les mains de l'économat,
    // qui peut aussi bien la rendre au département — le bon émis et les
    // servis complémentaires tombent avec, et la commande repart de zéro.
    if (order.status !== 'ACCEPTED') {
      throw new WorkflowError(
        order.status === 'PENDING'
          ? 'Cette commande est déjà en attente.'
          : 'Le bon est déjà émis : cette commande ne peut plus être rendue au département.',
      )
    }

    await tx.orderLine.updateMany({
      where: { orderId },
      data: { status: 'PENDING', quantityServed: null, quantityReceived: null, rejectReason: null },
    })
    if (order._count.refills > 0) await tx.orderRefill.deleteMany({ where: { orderId } })

    return tx.order.update({
      where: { id: orderId },
      data: {
        status: 'PENDING', processedById: null, acceptedAt: null,
        // Rouverte après livraison : la livraison et sa réception n'ont plus lieu d'être.
        deliveredAt: null, receivedAt: null, receivedById: null, receptionNote: null,
      },
      select: { id: true },
    })
  })
}

/**
 * Un service complémentaire : la marchandise manquante est arrivée, l'économat
 * complète ce qui n'avait pas pu sortir.
 *
 * Les quantités s'ajoutent à ce qui a déjà été servi plutôt que de le
 * remplacer : une ligne commandée 12, servie 0 puis complétée de 5, a reçu 5
 * en tout et en attend encore 7. Chaque passage garde sa trace, et son propre
 * bon ne porte que ce qui est sorti ce coup-là.
 */
export async function addRefill(params: {
  orderId: number
  actorId: number
  /** Ce qui sort à ce passage, par ligne. Les quantités nulles sont ignorées. */
  lines: { lineId: number; quantity: number }[]
}) {
  const { orderId, actorId } = params

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        lines: {
          select: {
            id: true, quantityAsked: true, quantityServed: true, productName: true,
            refills: { select: { quantity: true } },
          },
        },
      },
    })
    if (!order) throw new WorkflowError('Commande introuvable.')
    // Avant l'émission du bon, il n'y a rien à compléter : l'économat sert
    // encore, et corrige directement ses quantités.
    if (order.status !== 'DELIVERED' && order.status !== 'RECEIVED') {
      throw new WorkflowError(
        'Le bon de livraison n’est pas encore émis : complétez les quantités du servi en cours.',
      )
    }

    const known = new Map(order.lines.map((l) => [l.id, l]))
    const retenues = params.lines.filter((l) => l.quantity > 0)
    if (retenues.length === 0) {
      throw new WorkflowError('Aucune quantité saisie pour ce servi.')
    }

    for (const l of retenues) {
      const ligne = known.get(l.lineId)
      if (!ligne) throw new WorkflowError('Ligne inconnue pour cette commande.')
      if (!Number.isFinite(l.quantity) || l.quantity < 0) {
        throw new WorkflowError('Quantité invalide.')
      }
      // On ne sert jamais plus que commandé, tous passages confondus : la
      // règle du premier servi vaut pour les suivants.
      const reste = resteAServir(ligne)
      if (l.quantity > reste) {
        throw new WorkflowError(
          `${ligne.productName} : il ne reste que ${reste} à servir sur cette commande.`,
        )
      }
    }

    // Le rang du passage : 2 pour le deuxième service, 3 pour le troisième.
    const dernier = await tx.orderRefill.findFirst({
      where: { orderId },
      orderBy: { rank: 'desc' },
      select: { rank: true },
    })
    const rank = (dernier?.rank ?? 1) + 1

    return tx.orderRefill.create({
      data: {
        orderId,
        rank,
        createdById: actorId,
        lines: { create: retenues.map((l) => ({ orderLineId: l.lineId, quantity: l.quantity })) },
      },
      select: { id: true, rank: true },
    })
  }, { timeout: 15_000 })
}

/**
 * Complète un passage déjà enregistré.
 *
 * Un article oublié au 2ᵉ servi se rattrape dans sa colonne, pas dans celle
 * du 3ᵉ : le magasin l'a sorti à ce passage-là, et le bon doit le dire.
 *
 * Un bon déjà émis n'interdit pas de compléter : il arrive qu'on s'aperçoive
 * d'un oubli après l'impression, et refuser la correction obligerait à
 * inventer un passage qui n'a pas eu lieu. Le papier se réimprime alors. La
 * suppression, elle, reste interdite : elle effacerait ce qui a circulé.
 *
 * Les mêmes gardes que `addRefill` : jamais plus que commandé, tous passages
 * confondus.
 */
export async function completeRefill(params: {
  orderId: number
  rank: number
  lines: { lineId: number; quantity: number }[]
}) {
  const { orderId, rank } = params

  return prisma.$transaction(async (tx) => {
    const refill = await tx.orderRefill.findUnique({
      where: { orderId_rank: { orderId, rank } },
      select: { id: true, deliveredAt: true },
    })
    if (!refill) throw new WorkflowError('Ce servi n’existe pas sur cette commande.')
    // Le bon émis ne ferme pas la porte à une ligne oubliée : elle rejoint
    // le passage qui l'a laissée de côté, et le bon se réimprime. Ce que le
    // bon porte déjà, en revanche, ne se récrit qu'avec l'administration
    // (`setRefillLines`) : on ajoute ici, on ne remplace jamais.
    const retenues = params.lines.filter((l) => l.quantity > 0)
    if (retenues.length === 0) throw new WorkflowError('Aucune quantité saisie pour ce servi.')

    const lignes = await tx.orderLine.findMany({
      where: { orderId, id: { in: retenues.map((l) => l.lineId) } },
      select: {
        id: true, quantityAsked: true, quantityServed: true, productName: true,
        refills: { select: { quantity: true } },
      },
    })
    const known = new Map(lignes.map((l) => [l.id, l]))

    for (const l of retenues) {
      const ligne = known.get(l.lineId)
      if (!ligne) throw new WorkflowError('Ligne inconnue pour cette commande.')
      if (!Number.isFinite(l.quantity) || l.quantity < 0) {
        throw new WorkflowError('Quantité invalide.')
      }
      const reste = resteAServir(ligne)
      if (l.quantity > reste) {
        throw new WorkflowError(
          `${ligne.productName} : il ne reste que ${reste} à servir sur cette commande.`,
        )
      }
    }

    // Une ligne déjà servie à ce passage s'additionne plutôt que de se
    // remplacer : deux corrections successives ne doivent pas s'effacer.
    // Une seule écriture pour toutes les lignes : ligne par ligne, un gros
    // complément dépassait le délai de la transaction sur une base distante.
    await tx.$executeRaw`
      INSERT INTO "order_refill_lines" ("refillId", "orderLineId", "quantity")
      VALUES ${Prisma.join(retenues.map((l) => Prisma.sql`(${refill.id}::int, ${l.lineId}::int, ${l.quantity}::numeric)`))}
      ON CONFLICT ("refillId", "orderLineId")
      DO UPDATE SET "quantity" = "order_refill_lines"."quantity" + EXCLUDED."quantity"`

    return { id: refill.id, rank }
  })
}

/**
 * Annule un service sur une commande.
 *
 * `rank` vaut 1 pour le premier service — celui porté par les lignes de la
 * commande — et 2, 3… pour les passages complémentaires.
 *
 * Annuler le premier remet les quantités servies à zéro : les lignes
 * redeviennent entièrement dues. Un bon déjà imprimé ne correspondra plus à ce
 * que dit l'application, mais c'est un choix assumé : mieux vaut corriger une
 * erreur de saisie que de vivre avec.
 */
export async function cancelService(params: {
  orderId: number
  rank: number
  /** Restreint l'annulation à ces lignes ; toutes si absent. */
  lineIds?: number[]
}) {
  const { orderId, rank } = params

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    })
    if (!order) throw new WorkflowError('Commande introuvable.')

    if (rank > 1) {
      const refill = await tx.orderRefill.findUnique({
        where: { orderId_rank: { orderId, rank } },
        select: { id: true, receivedAt: true, deliveredAt: true },
      })
      if (!refill) throw new WorkflowError('Ce servi n’existe pas sur cette commande.')
      // Le bon est parti avec la marchandise : l'effacer ferait mentir un
      // papier qui circule. La garde vit ici, pas seulement dans l'écran.
      if (refill.deliveredAt) {
        throw new WorkflowError(
          'Le bon de livraison de ce servi est émis : il ne peut plus être supprimé.',
        )
      }
      // Le département a signé pour cette marchandise : l'effacer réécrirait
      // ce qu'il a reçu. La garde vit ici, pas seulement dans l'écran, pour
      // qu'aucun appel direct ne puisse contourner la confirmation.
      if (refill.receivedAt) {
        throw new WorkflowError(
          'Ce servi a été réceptionné par le département : il ne peut plus être supprimé.',
        )
      }
      // Supprimer le passage suffit : ses lignes tombent en cascade, et le
      // cumul de chaque article se recalcule à partir de ce qui reste.
      await tx.orderRefill.delete({ where: { id: refill.id } })
      return { orderId, rank }
    }

    // Premier service : les quantités vivent sur les lignes de la commande.
    // On les remet à zéro et on rend chaque ligne à son état d'attente.
    await tx.orderLine.updateMany({
      where: {
        orderId,
        ...(params.lineIds?.length ? { id: { in: params.lineIds } } : {}),
      },
      data: { quantityServed: null, status: 'PENDING', rejectReason: null },
    })
    return { orderId, rank }
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
  // Une seule écriture pour toutes les lignes : cent allers-retours vers une
  // base distante dépassaient les cinq secondes de la transaction.
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        lines: {
          select: {
            id: true, quantityAsked: true, productName: true,
            refills: { select: { quantity: true } },
          },
        },
      },
    })
    if (!order) throw new WorkflowError('Commande introuvable.')
    if (order.status !== 'ACCEPTED' && order.status !== 'PENDING') {
      throw new WorkflowError('Cette commande n’est plus modifiable.')
    }
    const known = new Map(order.lines.map((l) => [l.id, l]))
    const maj: { id: number; status: ServedLine['status']; qty: number; reason: string | null }[] = []

    for (const s of served) {
      const line = known.get(s.lineId)
      if (!line) throw new WorkflowError('Ligne inconnue pour cette commande.')

      // Sur une commande rouverte, des compléments sont peut-être déjà
      // partis : le premier servi ne peut pas les ignorer, sinon « Tout
      // valider » ferait sortir plus que commandé. Le plafond du premier
      // servi, c'est la commande moins ce qui a déjà été complété.
      const complements = line.refills.reduce((n, r) => n + Number(r.quantity), 0)
      const plafond = Math.max(Number(line.quantityAsked) - complements, 0)

      const qty =
        s.status === 'REJECTED'
          ? 0
          : s.status === 'VALIDATED'
            ? plafond
            : Number(s.quantityServed ?? 0)

      if (s.status === 'ADJUSTED') {
        if (!Number.isFinite(qty) || qty < 0) {
          throw new WorkflowError('Quantité servie invalide.')
        }
        // On ne sert jamais plus que ce qui a été commandé : la quantité
        // demandée vaut déjà « stock fixe moins ce qui reste en rayon », donc
        // en servir davantage ferait dépasser sa cible au département — qui
        // n'a rien demandé de plus.
        if (qty > plafond) {
          throw new WorkflowError(
            complements > 0
              ? `${line.productName} : ${complements} déjà servi(s) en complément, au plus ${plafond} au premier servi.`
              : `Impossible de servir plus que la quantité commandée (${Number(line.quantityAsked)}).`,
          )
        }
      }

      // L'état découle des quantités, pas du bouton pressé : « ajusté » à la
      // quantité commandée est un servi complet, « ajusté » à zéro est une
      // rupture. Sinon la ligne resterait comptée en écart alors qu'il n'y a
      // plus rien à servir — ou l'inverse.
      // L'état enregistré est celui du premier servi seul ; les compléments
      // n'entrent que dans l'état effectif, calculé à la lecture.
      const status: ServedLine['status'] =
        qty >= Number(line.quantityAsked) ? 'VALIDATED' : qty <= 0 ? 'REJECTED' : 'ADJUSTED'

      maj.push({ id: s.lineId, status, qty, reason: status === 'REJECTED' ? (s.rejectReason?.trim() || 'Rupture') : null })
    }

    if (maj.length > 0) {
      await tx.$executeRaw`
        UPDATE "order_lines" AS l
        SET "status" = v.status::"LineStatus", "quantityServed" = v.qty, "rejectReason" = v.reason
        FROM (VALUES ${Prisma.join(maj.map((m) => Prisma.sql`(${m.id}::int, ${m.status}::text, ${m.qty}::numeric, ${m.reason}::text)`))}) AS v(id, status, qty, reason)
        WHERE l.id = v.id`
    }

    if (order.status === 'PENDING') {
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'ACCEPTED', processedById: actorId, acceptedAt: new Date() },
      })
    }
    return { id: orderId }
  }, { timeout: 15_000 })
}

/**
 * Rouvre une commande livrée ou réceptionnée — le geste de l'administration.
 *
 * Le bon émis fige le premier servi pour l'économat. Quand il faut pourtant
 * corriger une quantité, l'administration rend la commande à l'état accepté :
 * l'économat retrouve son tableau modifiable et réémet le bon. Les heures de
 * livraison et de réception restent en place, pour pouvoir refermer la
 * commande dans l'état exact où elle était si la réouverture était une erreur.
 */
export async function reopenOrder(orderId: number) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } })
    if (!order) throw new WorkflowError('Commande introuvable.')
    if (order.status !== 'DELIVERED' && order.status !== 'RECEIVED') {
      throw new WorkflowError(
        order.status === 'ACCEPTED'
          ? 'Cette commande est déjà ouverte.'
          : 'Seule une commande livrée ou réceptionnée peut être rouverte.',
      )
    }
    return tx.order.update({
      where: { id: orderId },
      data: { status: 'ACCEPTED' },
      select: { id: true },
    })
  })
}

/**
 * Referme une commande rouverte, dans l'état où elle était : réceptionnée si
 * le département avait signé, livrée sinon. Réservé à l'administration.
 */
export async function closeOrder(orderId: number) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { status: true, deliveredAt: true, receivedAt: true },
    })
    if (!order) throw new WorkflowError('Commande introuvable.')
    if (order.status !== 'ACCEPTED' || !order.deliveredAt) {
      throw new WorkflowError('Cette commande n’a pas été rouverte : rien à refermer.')
    }
    return tx.order.update({
      where: { id: orderId },
      data: { status: order.receivedAt ? 'RECEIVED' : 'DELIVERED' },
      select: { id: true },
    })
  })
}

/**
 * Récrit les lignes d'un servi : quantité par ligne, zéro pour retirer.
 *
 * `completeRefill` additionne — c'est le geste de l'économat qui rattrape un
 * oubli. Ici on corrige : depuis la fiche du servi, l'administration pose la
 * quantité exacte, retire une ligne, en ajoute une. Un servi dont le bon est
 * émis ou que le département a signé ne se corrige pas : on le rouvre
 * d'abord, ou l'on n'y touche plus. Un servi vidé de toutes ses lignes
 * disparaît : un passage sans marchandise n'a pas eu lieu.
 */
export async function setRefillLines(params: {
  refillId: number
  lines: { lineId: number; quantity: number }[]
}) {
  return prisma.$transaction(async (tx) => {
    const refill = await tx.orderRefill.findUnique({
      where: { id: params.refillId },
      select: { id: true, rank: true, orderId: true, deliveredAt: true, receivedAt: true },
    })
    if (!refill) throw new WorkflowError('Ce servi n’existe pas.')
    if (refill.receivedAt) {
      throw new WorkflowError(`Le ${refill.rank}ᵉ servi a été réceptionné par le département : il ne se modifie plus.`)
    }
    if (refill.deliveredAt) {
      throw new WorkflowError(`Le bon de livraison du ${refill.rank}ᵉ servi est émis : rouvrez-le avant de le modifier.`)
    }

    const lignes = await tx.orderLine.findMany({
      where: { orderId: refill.orderId, id: { in: params.lines.map((l) => l.lineId) } },
      select: {
        id: true, quantityAsked: true, quantityServed: true, productName: true,
        refills: { select: { quantity: true, refillId: true } },
      },
    })
    const known = new Map(lignes.map((l) => [l.id, l]))

    for (const l of params.lines) {
      const ligne = known.get(l.lineId)
      if (!ligne) throw new WorkflowError('Ligne inconnue pour cette commande.')
      if (!Number.isFinite(l.quantity) || l.quantity < 0) throw new WorkflowError('Quantité invalide.')
      // Le plafond : ce que les autres passages laissent encore à servir,
      // ce servi-ci mis à part puisqu'on le récrit.
      const autres = ligne.refills
        .filter((r) => r.refillId !== refill.id)
        .reduce((n, r) => n + Number(r.quantity), 0)
      const plafond = Math.max(Number(ligne.quantityAsked) - Number(ligne.quantityServed ?? 0) - autres, 0)
      if (l.quantity > plafond) {
        throw new WorkflowError(`${ligne.productName} : au plus ${plafond} à servir sur ce passage.`)
      }
    }

    // Deux écritures en tout, quel que soit le nombre de lignes.
    const aEffacer = params.lines.filter((l) => l.quantity <= 0).map((l) => l.lineId)
    const aPoser = params.lines.filter((l) => l.quantity > 0)
    if (aEffacer.length > 0) {
      await tx.orderRefillLine.deleteMany({ where: { refillId: refill.id, orderLineId: { in: aEffacer } } })
    }
    if (aPoser.length > 0) {
      await tx.$executeRaw`
        INSERT INTO "order_refill_lines" ("refillId", "orderLineId", "quantity")
        VALUES ${Prisma.join(aPoser.map((l) => Prisma.sql`(${refill.id}::int, ${l.lineId}::int, ${l.quantity}::numeric)`))}
        ON CONFLICT ("refillId", "orderLineId")
        DO UPDATE SET "quantity" = EXCLUDED."quantity"`
    }

    const restantes = await tx.orderRefillLine.count({ where: { refillId: refill.id } })
    if (restantes === 0) {
      await tx.orderRefill.delete({ where: { id: refill.id } })
      return { id: refill.id, supprime: true, orderId: refill.orderId }
    }
    return { id: refill.id, supprime: false, orderId: refill.orderId }
  }, { timeout: 15_000 })
}

/**
 * Supprime une commande encore en attente.
 *
 * Tant que l'économat n'y a pas touché, une commande passée par erreur —
 * une urgence qui n'en était pas une — n'a pas à rester sur le tableau. Son
 * auteur la retire, ou l'administration ; passé l'acceptation, elle ne se
 * supprime plus, elle se traite. Le numéro de ticket reste consommé : deux
 * commandes ne portent jamais le même.
 */
export async function deleteOrder(orderId: number, actor: SessionUser) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { status: true, createdById: true, reference: true },
    })
    if (!order) throw new WorkflowError('Commande introuvable.')
    // L'employé ne retire que sa commande, et seulement tant que l'économat
    // ne l'a pas prise. L'administration retire n'importe quel ticket : les
    // lignes, les servis complémentaires et leurs lignes partent avec lui,
    // et ce qui avait été livré ne compte plus comme sorti du stock.
    if (actor.role !== 'ADMIN') {
      if (order.status !== 'PENDING') {
        throw new WorkflowError('L’économat a déjà pris cette commande en charge : elle ne se supprime plus.')
      }
      if (order.createdById !== actor.id) throw new WorkflowError('Cette commande n’est pas la vôtre.')
    }
    await tx.order.delete({ where: { id: orderId } })
    return { id: orderId, reference: order.reference }
  })
}

/** Plusieurs tickets d'un coup, pour l'administration : tout ou rien. */
export async function deleteOrders(orderIds: number[]) {
  const ids = [...new Set(orderIds)].filter((n) => Number.isInteger(n) && n > 0)
  if (ids.length === 0) throw new WorkflowError('Aucune commande à supprimer.')
  const r = await prisma.order.deleteMany({ where: { id: { in: ids } } })
  return r.count
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
      // Une commande rouverte puis relivrée repart pour signature : ce qui a
      // changé depuis n'a pas encore été compté par le département.
      data: {
        status: 'DELIVERED', deliveredAt: new Date(), processedById: actorId,
        receivedAt: null, receivedById: null, receptionNote: null,
      },
      select: { id: true },
    })
  }, { timeout: 15_000 })
}

/**
 * L'employé confirme la réception — le dossier se clôt.
 *
 * Pas de comptage ligne par ligne : le département signe pour la livraison
 * d'un bloc, et laisse au besoin une remarque à l'économat — « il manque un
 * carton », « les bouteilles sont arrivées cassées ». Une phrase suffit là
 * où cent cases à remplir décourageaient de vérifier.
 */
export async function receiveOrder(orderId: number, actor: SessionUser, note?: string | null) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
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

    // Qui a réceptionné : n'importe quel employé du service peut confirmer,
    // et ce n'est pas toujours l'auteur de la commande. Sans ce nom, on ne
    // saurait plus à qui demander ce qui s'est passé à la livraison.
    return tx.order.update({
      where: { id: orderId },
      data: {
        status: 'RECEIVED',
        receivedAt: new Date(),
        receivedById: actor.id,
        receptionNote: note?.trim() || null,
      },
      select: { id: true },
    })
  }, { timeout: 15_000 })
}

/**
 * Le département confirme avoir reçu un service complémentaire.
 *
 * Cette réception est indépendante de celle de la commande : la marchandise
 * d'un 2ᵉ service arrive après coup, souvent quand le dossier est déjà clos.
 * Sans cette signature, personne ne saurait si le complément est bien parvenu
 * au rayon — et l'économat pourrait effacer un passage dont la marchandise
 * est déjà en cuisine.
 */
export async function receiveRefill(
  orderId: number,
  rank: number,
  actor: SessionUser,
  note?: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const refill = await tx.orderRefill.findUnique({
      where: { orderId_rank: { orderId, rank } },
      select: { id: true, receivedAt: true, order: { select: { departmentId: true } } },
    })
    if (!refill) throw new WorkflowError('Ce servi n’existe pas sur cette commande.')
    if (refill.order.departmentId !== actor.departmentId) {
      throw new WorkflowError('Cette commande ne concerne pas votre département.')
    }
    // Une seule signature : la refaire écraserait le nom et l'heure de la
    // première, qui sont précisément ce qu'on veut pouvoir retrouver.
    if (refill.receivedAt) {
      throw new WorkflowError('Ce servi a déjà été réceptionné.')
    }
    return tx.orderRefill.update({
      where: { id: refill.id },
      data: { receivedAt: new Date(), receivedById: actor.id, receptionNote: note?.trim() || null },
      select: { id: true, rank: true },
    })
  })
}
