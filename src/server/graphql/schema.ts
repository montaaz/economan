import 'server-only'
import { createSchema } from 'graphql-yoga'
import { GraphQLError } from 'graphql'
import { prisma } from '@/server/db'
import { businessDay, addDays } from '@/lib/utils'
import type { SessionUser } from '@/server/auth/session'
import {
  createOrder, updateOrder, acceptOrder, cancelAcceptance, setServedLines, deliverOrder,
  receiveOrder, addRefill, cancelService, receiveRefill, WorkflowError,
} from '@/server/services/orders'

export type Ctx = { user: SessionUser | null }

const typeDefs = /* GraphQL */ `
  scalar DateTime
  scalar Date

  enum Role { EMPLOYEE ECONOMAN ADMIN }
  enum OrderStatus { PENDING ACCEPTED DELIVERED RECEIVED CANCELLED }
  enum LineStatus { PENDING VALIDATED ADJUSTED REJECTED }

  type Department {
    id: ID!
    name: String!
    code: String!
    color: String!
    icon: String
    isActive: Boolean!
    userCount: Int!
    productCount: Int!
  }

  type Unit { id: ID! name: String! symbol: String! allowsDecimals: Boolean! }

  type Category { id: ID! name: String! icon: String sortOrder: Int! }

  type Product {
    id: ID!
    reference: String!
    name: String!
    imageUrl: String
    category: Category!
    baseUnit: Unit!
    "Quantité cible pour le département de l'appelant. 0 si non réglée."
    stockFixe: Float!
  }

  "Ligne de la matrice de réglage du stock fixe, côté administration."
  type StockFixeLine {
    product: Product!
    quantity: Float!
  }

  type User {
    id: ID!
    username: String!
    fullName: String!
    role: Role!
    avatarColor: String!
    department: Department
    hasPasskey: Boolean!
  }

  type OrderLine {
    id: ID!
    productId: ID!
    "Cible au moment de l'envoi."
    stockFixe: Float!
    "Quantité réellement comptée par l'employé à la réception."
    quantityReceived: Float
    "Écart entre le servi et le compté. 0 si conforme ou non vérifié."
    receiptGap: Float!
    "Stock compté par l'employé au moment de l'envoi."
    quantityOnHand: Float!
    "Ce qui a été complété lors des services suivants, tous passages confondus."
    quantityRefilled: Float!
    "Complété par des servis que le département a réceptionnés : ce qui est réellement au rayon."
    quantityRefilledReceived: Float!
    "Servi en tout — premier service plus compléments réceptionnés. Nul tant que rien n'est servi."
    quantityServedTotal: Float
    "Le détail par passage : quel rang a servi quelle quantité."
    refills: [LineRefill!]!
    productName: String!
    productRef: String!
    categoryName: String!
    unitSymbol: String!
    quantityAsked: Float!
    quantityServed: Float
    """
    L'état de la ligne une fois les compléments réceptionnés pris en compte :
    une rupture complétée et signée par le département n'en est plus une.
    Un servi seulement préparé ne change rien tant qu'il n'est pas reçu.
    """
    status: LineStatus!
    rejectReason: String
  }

  type Order {
    id: ID!
    reference: String!
    "Lignes en rupture sur ce ticket."
    rejectedCount: Int!
    "Lignes servies en quantité différente."
    adjustedCount: Int!
    "Lignes servies exactement comme demandé."
    validatedCount: Int!
    ticketNumber: Int!
    businessDay: Date!
    status: OrderStatus!
    note: String
    createdAt: DateTime!
    acceptedAt: DateTime
    deliveredAt: DateTime
    receivedAt: DateTime
    department: Department!
    createdBy: User!
    processedBy: User
    "Qui a confirmé la réception — pas forcément l'auteur de la commande."
    receivedBy: User
    "Rang du dernier service complémentaire. 1 si le bon initial est le seul."
    lastRefillRank: Int!
    "Les passages complémentaires, du plus ancien au plus récent."
    refills: [Refill!]!
    "Passages complémentaires que le département n'a pas encore réceptionnés."
    refillsToReceive: Int!
    lines: [OrderLine!]!
    lineCount: Int!
    totalAsked: Float!
    totalServed: Float!
  }

  "Un article et ce qu'un département en a demandé sur toute une journée."
  type DayArticleLine {
    productId: ID!
    productName: String!
    productRef: String!
    categoryName: String!
    unitSymbol: String!
    quantityAsked: Float!
    quantityServed: Float!
    "Nombre de tickets du jour où l'article figure."
    ticketCount: Int!
  }

  "Ce qu'un passage a servi sur une ligne."
  type LineRefill {
    rank: Int!
    quantity: Float!
  }

  "Un passage de service complémentaire."
  type Refill {
    id: ID!
    "2 pour le deuxième service, 3 pour le troisième."
    rank: Int!
    createdAt: DateTime!
    createdBy: User
    "Quand le département a confirmé avoir reçu ce passage. Nul tant qu'il ne l'a pas fait."
    receivedAt: DateTime
    "Qui l'a confirmé — pas forcément celui qui a réceptionné la commande."
    receivedBy: User
    "Nombre d'articles sortis à ce passage."
    lineCount: Int!
    lines: [RefillLine!]!
  }

  type RefillLine {
    lineId: ID!
    productName: String!
    productRef: String!
    categoryName: String!
    unitSymbol: String!
    quantity: Float!
  }

  "Une ligne qui s'écarte de la commande — non livrée ou servie autrement."
  type RuptureLine {
    lineId: ID!
    orderId: ID!
    orderReference: String!
    businessDay: Date!
    department: Department!
    productName: String!
    productRef: String!
    categoryName: String!
    unitSymbol: String!
    "Cible du rayon au moment de l'envoi."
    stockFixe: Float!
    quantityAsked: Float!
    "Ce qui a réellement été servi. 0 sur une rupture."
    quantityServed: Float!
    "Motif saisi par l'économat, s'il l'a renseigné."
    rejectReason: String
  }

  "Les articles d'un département, cumulés sur la journée."
  type DayDepartmentArticles {
    department: Department!
    lines: [DayArticleLine!]!
    articleCount: Int!
    orderCount: Int!
    totalAsked: Float!
    totalServed: Float!
  }

  "Un département et ses commandes pour une journée donnée."
  type DepartmentDay {
    department: Department!
    orders: [Order!]!
    orderCount: Int!
    lineCount: Int!
    totalAsked: Float!
    totalServed: Float!
  }

  type DayBoard {
    "Premier jour de la période (la journée elle-même si aucune plage)."
    day: Date!
    "Dernier jour de la période. Égal au premier pour une journée unique."
    dayTo: Date!
    "Vrai dès que la période couvre plus d'une journée."
    isRange: Boolean!
    departments: [DepartmentDay!]!
    orderCount: Int!
    lineCount: Int!
    totalAsked: Float!
    totalServed: Float!
    pendingCount: Int!
  }

  "L'employé déclare le stock qu'il a en rayon ; le serveur en déduit la quantité."
  input OrderLineInput { productId: ID!, quantityOnHand: Float! }
  input StockFixeInput { productId: ID!, quantity: Float! }
  input RefillInput { lineId: ID!, quantity: Float! }
  input ReceivedLineInput { lineId: ID!, quantityReceived: Float! }
  input ServedLineInput {
    lineId: ID!
    status: LineStatus!
    quantityServed: Float
    rejectReason: String
  }

  type Query {
    me: User
    "Départements actifs — alimente les cartes de la page d'accueil."
    departments: [Department!]!
    "Employés d'un département, pour l'écran de connexion."
    departmentUsers(departmentId: ID!): [User!]!
    "Catalogue visible par le département de l'employé connecté."
    myCatalog: [Product!]!
    "Mes commandes des N derniers jours (3 par défaut)."
    myOrders(days: Int = 3): [Order!]!
    order(id: ID!): Order
    "Tableau d'une journée — ou d'une période si dayTo est fourni."
    dayBoard(day: Date, dayTo: Date): DayBoard!
    "Journées ayant au moins une commande, la plus récente d'abord."
    activeDays(limit: Int = 30): [Date!]!
    "Articles commandés par un département sur une journée ou une période, tous tickets cumulés."
    dayArticles(departmentId: ID!, day: Date, dayTo: Date): [DayArticleLine!]!
    "Articles de tous les départements sur une journée ou une période, groupés par département."
    dayArticlesByDepartment(day: Date, dayTo: Date): [DayDepartmentArticles!]!
    "Stock fixe d'un département, tous ses articles — écran d'administration."
    stockFixeMatrix(departmentId: ID!): [StockFixeLine!]!
    "Lignes non livrées ou ajustées d'une journée. Sans departmentId, tous les services."
    dayRuptures(day: Date, dayTo: Date, departmentId: ID, status: LineStatus): [RuptureLine!]!
  }

  type Mutation {
    submitOrder(lines: [OrderLineInput!]!, note: String): Order!
    "Corrige une commande encore en attente. Refusée dès que l'économat l'a acceptée."
    updateOrder(id: ID!, lines: [OrderLineInput!]!, note: String): Order!
    acceptOrder(id: ID!): Order!
    "Rend une commande acceptée au département : elle repasse en attente et redevient modifiable."
    cancelAcceptance(id: ID!): Order!
    "Service complémentaire : complète une commande déjà livrée. Renvoie le rang du passage."
    addRefill(id: ID!, lines: [RefillInput!]!): Refill!
    "Annule un service. rank = 1 pour le service initial, 2 et plus pour les compléments."
    cancelService(id: ID!, rank: Int!): Order!
    setServedLines(id: ID!, lines: [ServedLineInput!]!): Order!
    deliverOrder(id: ID!): Order!
    "L'employé confirme la réception, en déclarant ce qu'il a compté."
    receiveOrder(id: ID!, lines: [ReceivedLineInput!]): Order!
    "Le département confirme la réception d'un service complémentaire, indépendamment de la commande."
    receiveRefill(id: ID!, rank: Int!): Order!
    "Administration : règle le stock fixe d'un département."
    setStockFixe(departmentId: ID!, lines: [StockFixeInput!]!): Int!
  }
`

/* ------------------------------------------------------------------ gardes */

function requireUser(ctx: Ctx): SessionUser {
  if (!ctx.user) throw new GraphQLError('Vous n’êtes pas connecté.', { extensions: { code: 'UNAUTHENTICATED' } })
  return ctx.user
}

function requireEmployee(ctx: Ctx) {
  const u = requireUser(ctx)
  if (u.role !== 'EMPLOYEE' || !u.departmentId) {
    throw new GraphQLError('Aucun département ne vous est attribué.', { extensions: { code: 'FORBIDDEN' } })
  }
  return u as SessionUser & { departmentId: number }
}

function requireStaff(ctx: Ctx) {
  const u = requireUser(ctx)
  if (u.role !== 'ECONOMAN' && u.role !== 'ADMIN') {
    throw new GraphQLError('Accès réservé à l’économat.', { extensions: { code: 'FORBIDDEN' } })
  }
  return u
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof WorkflowError) {
      throw new GraphQLError(e.message, { extensions: { code: 'BUSINESS_RULE' } })
    }
    throw e
  }
}

/**
 * Les articles qu'un département peut commander.
 *
 * Une feuille définie article par article (`department_products`) prime sur
 * les catégories : certains services commandent le sucre glace mais pas les
 * spaghettis, alors que les deux partagent une catégorie. Sans feuille
 * explicite, on retombe sur les catégories affectées.
 */
async function departmentCatalog(departmentId: number) {
  const explicit = await prisma.departmentProduct.findMany({
    where: { departmentId, product: { isActive: true } },
    orderBy: { sortOrder: 'asc' },
    include: { product: { include: { category: true, baseUnit: true } } },
  })
  if (explicit.length > 0) return explicit.map((e) => e.product)

  return prisma.product.findMany({
    where: { isActive: true, category: { departments: { some: { departmentId } } } },
    include: { category: true, baseUnit: true },
    orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
  })
}

/** Une ligne de commande avec ses compléments, telle que Prisma la charge. */
type LigneServie = {
  status: string
  quantityAsked: unknown
  quantityServed: unknown
  refills?: { quantity: unknown; refill?: { receivedAt?: Date | null } | null }[]
}

/** Ce que les servis complémentaires réceptionnés ont apporté à une ligne. */
function refilledReceived(l: LigneServie): number {
  return (l.refills ?? [])
    .filter((r) => r.refill?.receivedAt)
    .reduce((n, r) => n + Number(r.quantity), 0)
}

/**
 * L'état d'une ligne, compléments reçus compris.
 *
 * Une rupture complétée par un servi que le département a signé n'en est plus
 * une : la marchandise est au rayon. Complétée en partie, elle devient un
 * ajustement. Un servi seulement préparé ne change rien : rien n'est encore
 * arrivé, et l'économat doit pouvoir le voir encore — et l'annuler.
 */
function effectiveStatus(l: LigneServie): string {
  if (l.status !== 'REJECTED' && l.status !== 'ADJUSTED') return l.status
  const recu = refilledReceived(l)
  if (recu <= 0) return l.status
  const total = Number(l.quantityServed ?? 0) + recu
  return total >= Number(l.quantityAsked) ? 'VALIDATED' : 'ADJUSTED'
}

const ORDER_INCLUDE = {
  department: true,
  createdBy: { include: { department: true } },
  processedBy: { include: { department: true } },
  receivedBy: { include: { department: true } },
  // Qui a servi et qui a réceptionné chaque passage : l'écran du département
  // les affiche, et le compte des passages à réceptionner en dépend.
  refills: {
    select: {
      id: true, rank: true, createdAt: true, receivedAt: true,
      createdBy: { include: { department: true } },
      receivedBy: { include: { department: true } },
    },
    orderBy: { rank: 'asc' as const },
  },
  // `refills` alimente quantityRefilled : sans lui, le reste à servir
  // d'une ligne déjà complétée serait faux.
  lines: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      unit: true,
      // `receivedAt` décide de l'état effectif : seul un complément reçu
      // efface une rupture.
      refills: {
        select: { quantity: true, refill: { select: { rank: true, receivedAt: true } } },
      },
    },
  },
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v
  if (typeof v === 'string') return new Date(`${v}T00:00:00.000Z`)
  return businessDay()
}

/**
 * Résout une période de consultation.
 *
 * Sans `dayTo`, la période se réduit à la journée : le filtre reste une
 * égalité, identique au comportement d'origine. Avec `dayTo`, on borne
 * l'intervalle aux deux extrémités incluses.
 *
 * Les bornes sont réordonnées si elles arrivent à l'envers : choisir « du 14
 * au 10 » est une manipulation courante dans deux champs de date, et rendre
 * une liste vide laisserait croire qu'aucune commande n'existe.
 */
function resolvePeriod(day?: string, dayTo?: string) {
  const a = day ? toDate(day) : businessDay()
  if (!dayTo) return { from: a, to: a, isRange: false }

  const b = toDate(dayTo)
  const [from, to] = a <= b ? [a, b] : [b, a]
  return { from, to, isRange: from.getTime() !== to.getTime() }
}

/** Filtre Prisma correspondant à une période : égalité si journée unique. */
function periodFilter(p: { from: Date; to: Date; isRange: boolean }) {
  return p.isRange ? { gte: p.from, lte: p.to } : p.from
}

/* --------------------------------------------------------------- resolvers */

/**
 * Articles d'un département sur une journée ou une période, tous tickets cumulés.
 *
 * Un même article peut figurer sur plusieurs tickets : on somme les
 * quantités et on compte les tickets, pour distinguer « 3 × 5 » de « 1 × 15 ».
 * Partagé par la vue d'un département et par celle de la journée entière.
 */
async function cumulerArticles(
  period: { from: Date; to: Date; isRange: boolean },
  departmentId: number,
) {
    const lines = await prisma.orderLine.findMany({
      where: {
        order: { businessDay: periodFilter(period), departmentId: departmentId },
      },
      select: {
        productId: true,
        productName: true,
        productRef: true,
        categoryName: true,
        quantityAsked: true,
        quantityServed: true,
        orderId: true,
        sortOrder: true,
        unit: { select: { symbol: true } },
      },
    })

    // Un même article peut figurer sur plusieurs tickets du jour : on somme,
    // et on compte les tickets pour distinguer « 3 × 5 » de « 1 × 15 ».
    const byProduct = new Map<
      number,
      {
        productId: number
        productName: string
        productRef: string
        categoryName: string
        unitSymbol: string
        quantityAsked: number
        quantityServed: number
        sortOrder: number
        orders: Set<number>
      }
    >()

    for (const l of lines) {
      const row = byProduct.get(l.productId)
      if (row) {
        row.quantityAsked += Number(l.quantityAsked)
        row.quantityServed += Number(l.quantityServed ?? 0)
        row.orders.add(l.orderId)
        continue
      }
      byProduct.set(l.productId, {
        productId: l.productId,
        productName: l.productName,
        productRef: l.productRef,
        categoryName: l.categoryName,
        unitSymbol: l.unit?.symbol ?? '',
        quantityAsked: Number(l.quantityAsked),
        quantityServed: Number(l.quantityServed ?? 0),
        sortOrder: l.sortOrder,
        orders: new Set([l.orderId]),
      })
    }

    // L'ordre de la feuille du département, comme partout ailleurs : un
    // classement alphabétique donnait à ces écrans une liste que le magasinier
    // ne retrouvait sur aucun de ses rayons.
    return [...byProduct.values()]
      .map((r) => ({ ...r, ticketCount: r.orders.size }))
      .sort((x, y) => x.sortOrder - y.sortOrder || x.productName.localeCompare(y.productName))
}

const resolvers = {
  Date: {
    serialize: (v: Date | string) =>
      typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10),
    parseValue: (v: string) => toDate(v),
  },
  DateTime: {
    serialize: (v: Date | string) => (typeof v === 'string' ? v : v.toISOString()),
    parseValue: (v: string) => new Date(v),
  },

  Department: {
    userCount: (d: { id: number }) => prisma.user.count({ where: { departmentId: d.id, isActive: true } }),
    productCount: (d: { id: number }) =>
      prisma.product.count({
        where: { isActive: true, category: { departments: { some: { departmentId: d.id } } } },
      }),
  },

  User: {
    hasPasskey: async (u: { id: number }) =>
      (await prisma.credential.count({ where: { userId: u.id } })) > 0,
  },

  OrderLine: {
    quantityRefilled: (l: { refills?: { quantity: unknown }[] }) =>
      (l.refills ?? []).reduce((s, r) => s + Number(r.quantity), 0),
    refills: (l: { refills?: { quantity: unknown; refill?: { rank: number } }[] }) =>
      (l.refills ?? [])
        .map((r) => ({ rank: r.refill?.rank ?? 0, quantity: Number(r.quantity) }))
        .sort((a, b) => a.rank - b.rank),
    unitSymbol: (l: { unit?: { symbol: string } }) => l.unit?.symbol ?? '',
    stockFixe: (l: { stockFixe: unknown }) => Number(l.stockFixe ?? 0),
    quantityReceived: (l: { quantityReceived: unknown }) =>
      l.quantityReceived === null || l.quantityReceived === undefined
        ? null
        : Number(l.quantityReceived),
    quantityRefilledReceived: (l: LigneServie) => refilledReceived(l),
    quantityServedTotal: (l: LigneServie) =>
      l.quantityServed === null || l.quantityServed === undefined
        ? null
        : Number(l.quantityServed) + refilledReceived(l),
    status: (l: LigneServie) => effectiveStatus(l),
    receiptGap: (l: LigneServie & { quantityReceived: unknown }) => {
      // Tant que rien n'est compté, il n'y a pas d'écart à signaler.
      if (l.quantityReceived === null || l.quantityReceived === undefined) return 0
      // Le reçu s'additionne à chaque servi signé : l'écart se mesure donc
      // contre tout ce qui a été servi et reçu, pas contre le premier passage.
      return Number(l.quantityReceived) - Number(l.quantityServed ?? 0) - refilledReceived(l)
    },
    quantityOnHand: (l: { quantityOnHand: unknown }) => Number(l.quantityOnHand ?? 0),
    quantityAsked: (l: { quantityAsked: unknown }) => Number(l.quantityAsked),
    quantityServed: (l: { quantityServed: unknown }) =>
      l.quantityServed === null || l.quantityServed === undefined ? null : Number(l.quantityServed),
  },

  Refill: {
    // Une carte de la liste ne montre que le nombre : compter en base évite
    // de charger les lignes de chaque passage pour les jeter ensuite.
    lineCount: async (r: { id: number; lines?: unknown[] }) =>
      r.lines ? r.lines.length : prisma.orderRefillLine.count({ where: { refillId: r.id } }),
    // La ligne de passage ne porte qu'une quantité : le reste vient de la
    // ligne de commande, figée à l'envoi.
    //
    // Les lignes ne sont chargées que si on les demande : une commande porte
    // ses passages sans leurs lignes, et les charger sur chaque ticket du
    // tableau de bord ferait ramener des quantités que personne n'affiche.
    lines: async (r: {
      id: number
      lines?: {
        orderLineId: number
        quantity: unknown
        orderLine: {
          productName: string; productRef: string; categoryName: string
          sortOrder: number; unit?: { symbol: string } | null
        }
      }[]
    }) =>
      (r.lines ?? await prisma.orderRefillLine.findMany({
        where: { refillId: r.id },
        include: { orderLine: { include: { unit: true } } },
      }))
        .slice()
        .sort((a, b) => a.orderLine.sortOrder - b.orderLine.sortOrder)
        .map((l) => ({
          lineId: String(l.orderLineId),
          productName: l.orderLine.productName,
          productRef: l.orderLine.productRef,
          categoryName: l.orderLine.categoryName,
          unitSymbol: l.orderLine.unit?.symbol ?? '',
          quantity: Number(l.quantity),
        })),
  },

  Order: {
    // Le prochain passage se numérote après celui-ci.
    lastRefillRank: (o: { refills?: { rank: number }[] }) =>
      (o.refills ?? []).reduce((n, r) => Math.max(n, r.rank), 1),
    refills: (o: { refills?: { rank: number }[] }) =>
      (o.refills ?? []).slice().sort((a, b) => a.rank - b.rank),
    refillsToReceive: (o: { refills?: { receivedAt: unknown }[] }) =>
      (o.refills ?? []).filter((r) => !r.receivedAt).length,
    lineCount: (o: { lines?: unknown[] }) => o.lines?.length ?? 0,
    // Les comptes suivent l'état effectif : une rupture reçue en complément
    // sort du rouge, et le « Tout » de la journée redescend d'autant.
    rejectedCount: (o: { lines?: LigneServie[] }) =>
      (o.lines ?? []).filter((l) => effectiveStatus(l) === 'REJECTED').length,
    adjustedCount: (o: { lines?: LigneServie[] }) =>
      (o.lines ?? []).filter((l) => effectiveStatus(l) === 'ADJUSTED').length,
    validatedCount: (o: { lines?: LigneServie[] }) =>
      (o.lines ?? []).filter((l) => effectiveStatus(l) === 'VALIDATED').length,
    totalAsked: (o: { lines?: { quantityAsked: unknown }[] }) =>
      (o.lines ?? []).reduce((s, l) => s + Number(l.quantityAsked), 0),
    totalServed: (o: { lines?: { quantityServed: unknown }[] }) =>
      (o.lines ?? []).reduce((s, l) => s + Number(l.quantityServed ?? 0), 0),
  },

  Query: {
    me: (_p: unknown, _a: unknown, ctx: Ctx) =>
      ctx.user ? prisma.user.findUnique({ where: { id: ctx.user.id }, include: { department: true } }) : null,

    departments: () =>
      prisma.department.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),

    departmentUsers: (_p: unknown, a: { departmentId: string }) =>
      prisma.user.findMany({
        where: { departmentId: Number(a.departmentId), isActive: true, role: 'EMPLOYEE' },
        orderBy: { fullName: 'asc' },
        include: { department: true },
      }),

    myCatalog: async (_p: unknown, _a: unknown, ctx: Ctx) => {
      const u = requireEmployee(ctx)
      const [products, pars] = await Promise.all([
        departmentCatalog(u.departmentId),
        prisma.stockFixe.findMany({
          where: { departmentId: u.departmentId },
          select: { productId: true, quantity: true },
        }),
      ])
      const parBy = new Map(pars.map((p) => [p.productId, Number(p.quantity)]))
      // Un article sans réglage vaut 0 : il s'affiche, mais ne sera pas commandé.
      return products.map((p) => ({ ...p, stockFixe: parBy.get(p.id) ?? 0 }))
    },

    myOrders: (_p: unknown, a: { days?: number }, ctx: Ctx) => {
      const u = requireEmployee(ctx)
      // « les 3 derniers jours » = aujourd'hui plus les deux précédents.
      const since = addDays(businessDay(), -((a.days ?? 3) - 1))
      return prisma.order.findMany({
        // Toutes les commandes du département, pas seulement les siennes : un
        // service se relaie, et savoir si un collègue a déjà commandé évite de
        // passer deux tickets pour les mêmes articles. La liste affiche
        // l'auteur de chacune, et corriger reste réservé à celui qui l'a
        // passée — voir n'est pas modifier.
        where: { departmentId: u.departmentId, businessDay: { gte: since } },
        include: ORDER_INCLUDE,
        orderBy: [{ businessDay: 'desc' }, { ticketNumber: 'desc' }],
      })
    },

    order: async (_p: unknown, a: { id: string }, ctx: Ctx) => {
      const u = requireUser(ctx)
      const order = await prisma.order.findUnique({ where: { id: Number(a.id) }, include: ORDER_INCLUDE })
      if (!order) return null
      if (u.role === 'EMPLOYEE' && order.departmentId !== u.departmentId) {
        throw new GraphQLError('Accès refusé à cette commande.', { extensions: { code: 'FORBIDDEN' } })
      }
      return order
    },

    activeDays: async (_p: unknown, a: { limit?: number }, ctx: Ctx) => {
      requireStaff(ctx)
      const rows = await prisma.order.findMany({
        distinct: ['businessDay'],
        select: { businessDay: true },
        orderBy: { businessDay: 'desc' },
        take: a.limit ?? 30,
      })
      return rows.map((r) => r.businessDay)
    },

    stockFixeMatrix: async (_p: unknown, a: { departmentId: string }, ctx: Ctx) => {
      requireUser(ctx)
      const u = ctx.user!
      if (u.role !== 'ADMIN') {
        throw new GraphQLError('Réglage réservé à l’administration.', {
          extensions: { code: 'FORBIDDEN' },
        })
      }
      const departmentId = Number(a.departmentId)
      const [products, pars] = await Promise.all([
        departmentCatalog(departmentId),
        prisma.stockFixe.findMany({
          where: { departmentId },
          select: { productId: true, quantity: true },
        }),
      ])
      const parBy = new Map(pars.map((p) => [p.productId, Number(p.quantity)]))
      return products.map((p) => ({
        product: { ...p, stockFixe: parBy.get(p.id) ?? 0 },
        quantity: parBy.get(p.id) ?? 0,
      }))
    },

    dayArticles: async (
      _p: unknown,
      a: { departmentId: string; day?: string; dayTo?: string },
      ctx: Ctx,
    ) => {
      requireStaff(ctx)
      return cumulerArticles(resolvePeriod(a.day, a.dayTo), Number(a.departmentId))
    },

    dayRuptures: async (
      _p: unknown,
      a: { day?: string; dayTo?: string; departmentId?: string; status?: 'REJECTED' | 'ADJUSTED' },
      ctx: Ctx,
    ) => {
      requireStaff(ctx)
      const period = resolvePeriod(a.day, a.dayTo)
      const lines = await prisma.orderLine.findMany({
        where: {
          // Les ruptures par défaut ; les ajustements sur demande. Ce sont les
          // deux écarts à la commande, qui se consultent de la même façon.
          status: a.status ?? 'REJECTED',
          order: {
            businessDay: periodFilter(period),
            // La liste suit le filtre de l'écran : montrer les ruptures des
            // autres services sous un filtre « Bar » contredirait la page.
            ...(a.departmentId ? { departmentId: Number(a.departmentId) } : {}),
          },
        },
        select: {
          id: true,
          status: true,
          productName: true,
          productRef: true,
          categoryName: true,
          stockFixe: true,
          quantityAsked: true,
          quantityServed: true,
          rejectReason: true,
          sortOrder: true,
          unit: { select: { symbol: true } },
          refills: { select: { quantity: true, refill: { select: { receivedAt: true } } } },
          order: {
            select: {
              id: true, reference: true, businessDay: true,
              department: true,
            },
          },
        },
        // Par département puis par feuille : on lit les manques rayon par
        // rayon, comme on les constate en magasin.
        orderBy: [
          { order: { departmentId: 'asc' } },
          { order: { businessDay: 'asc' } },
          { sortOrder: 'asc' },
        ],
      })
      // Même règle que les comptes : une rupture complétée et reçue n'y
      // figure plus, une rupture complétée en partie passe en ajustée.
      return lines.filter((l) => effectiveStatus(l) === (a.status ?? 'REJECTED')).map((l) => ({
        lineId: String(l.id),
        orderId: String(l.order.id),
        orderReference: l.order.reference,
        businessDay: l.order.businessDay,
        department: l.order.department,
        productName: l.productName,
        productRef: l.productRef,
        categoryName: l.categoryName,
        unitSymbol: l.unit?.symbol ?? '',
        stockFixe: Number(l.stockFixe),
        quantityAsked: Number(l.quantityAsked),
        quantityServed: Number(l.quantityServed ?? 0),
        rejectReason: l.rejectReason,
      }))
    },

    dayArticlesByDepartment: async (
      _p: unknown,
      a: { day?: string; dayTo?: string },
      ctx: Ctx,
    ) => {
      requireStaff(ctx)
      const period = resolvePeriod(a.day, a.dayTo)

      // On ne liste que les départements ayant commandé : un service sans
      // ticket n'a rien à montrer et allongerait la vue pour rien.
      const groups = await prisma.order.groupBy({
        by: ['departmentId'],
        where: { businessDay: periodFilter(period) },
        _count: { _all: true },
      })
      if (groups.length === 0) return []

      const departments = await prisma.department.findMany({
        where: { id: { in: groups.map((g) => g.departmentId) } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      })

      const result = []
      for (const d of departments) {
        const lines = await cumulerArticles(period, d.id)
        result.push({
          department: d,
          lines,
          articleCount: lines.length,
          orderCount: groups.find((g) => g.departmentId === d.id)?._count._all ?? 0,
          totalAsked: lines.reduce((s, l) => s + l.quantityAsked, 0),
          totalServed: lines.reduce((s, l) => s + l.quantityServed, 0),
        })
      }
      return result
    },

    dayBoard: async (_p: unknown, a: { day?: string; dayTo?: string }, ctx: Ctx) => {
      requireStaff(ctx)
      const period = resolvePeriod(a.day, a.dayTo)

      const [departments, orders] = await Promise.all([
        prisma.department.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
        prisma.order.findMany({
          where: { businessDay: periodFilter(period) },
          include: ORDER_INCLUDE,
          // Sur une période, le jour prime : les tickets d'une même journée
          // restent groupés et dans leur ordre de numérotation.
          orderBy: [{ departmentId: 'asc' }, { businessDay: 'asc' }, { ticketNumber: 'asc' }],
        }),
      ])

      const byDept = new Map<number, typeof orders>()
      for (const o of orders) {
        const list = byDept.get(o.departmentId)
        if (list) list.push(o)
        else byDept.set(o.departmentId, [o])
      }

      const sum = (list: typeof orders, pick: (l: (typeof orders)[0]['lines'][0]) => number) =>
        list.reduce((s, o) => s + o.lines.reduce((t, l) => t + pick(l), 0), 0)

      const groups = departments
        .map((d) => {
          const list = byDept.get(d.id) ?? []
          return {
            department: d,
            orders: list,
            orderCount: list.length,
            lineCount: list.reduce((s, o) => s + o.lines.length, 0),
            totalAsked: sum(list, (l) => Number(l.quantityAsked)),
            totalServed: sum(list, (l) => Number(l.quantityServed ?? 0)),
          }
        })
        // Un département sans commande du jour n'a pas à occuper l'écran.
        .filter((g) => g.orderCount > 0)

      return {
        day: period.from,
        dayTo: period.to,
        isRange: period.isRange,
        departments: groups,
        orderCount: orders.length,
        lineCount: groups.reduce((s, g) => s + g.lineCount, 0),
        totalAsked: groups.reduce((s, g) => s + g.totalAsked, 0),
        totalServed: groups.reduce((s, g) => s + g.totalServed, 0),
        pendingCount: orders.filter((o) => o.status === 'PENDING').length,
      }
    },
  },

  Mutation: {
    submitOrder: async (
      _p: unknown,
      a: { lines: { productId: string; quantityOnHand: number }[]; note?: string },
      ctx: Ctx,
    ) => {
      const u = requireEmployee(ctx)
      const created = await run(() =>
        createOrder({
          actor: u,
          lines: a.lines.map((l) => ({
            productId: Number(l.productId),
            quantityOnHand: l.quantityOnHand,
          })),
          note: a.note,
        }),
      )
      return prisma.order.findUniqueOrThrow({ where: { id: created.id }, include: ORDER_INCLUDE })
    },

    updateOrder: async (
      _p: unknown,
      a: { id: string; lines: { productId: string; quantityOnHand: number }[]; note?: string },
      ctx: Ctx,
    ) => {
      const u = requireEmployee(ctx)
      const done = await run(() =>
        updateOrder({
          orderId: Number(a.id),
          actor: u,
          lines: a.lines.map((l) => ({
            productId: Number(l.productId),
            quantityOnHand: l.quantityOnHand,
          })),
          note: a.note,
        }),
      )
      return prisma.order.findUniqueOrThrow({ where: { id: done.id }, include: ORDER_INCLUDE })
    },

    acceptOrder: async (_p: unknown, a: { id: string }, ctx: Ctx) => {
      const u = requireStaff(ctx)
      await run(() => acceptOrder(Number(a.id), u.id))
      return prisma.order.findUniqueOrThrow({ where: { id: Number(a.id) }, include: ORDER_INCLUDE })
    },

    addRefill: async (
      _p: unknown,
      a: { id: string; lines: { lineId: string; quantity: number }[] },
      ctx: Ctx,
    ) => {
      const u = requireStaff(ctx)
      const refill = await run(() =>
        addRefill({
          orderId: Number(a.id),
          actorId: u.id,
          lines: a.lines.map((l) => ({ lineId: Number(l.lineId), quantity: l.quantity })),
        }),
      )
      return prisma.orderRefill.findUniqueOrThrow({
        where: { id: refill.id },
        include: {
          createdBy: { include: { department: true } },
          lines: { include: { orderLine: { include: { unit: true } } } },
        },
      })
    },

    cancelService: async (_p: unknown, a: { id: string; rank: number }, ctx: Ctx) => {
      requireStaff(ctx)
      await run(() => cancelService({ orderId: Number(a.id), rank: a.rank }))
      return prisma.order.findUniqueOrThrow({ where: { id: Number(a.id) }, include: ORDER_INCLUDE })
    },

    cancelAcceptance: async (_p: unknown, a: { id: string }, ctx: Ctx) => {
      requireStaff(ctx)
      await run(() => cancelAcceptance(Number(a.id)))
      return prisma.order.findUniqueOrThrow({ where: { id: Number(a.id) }, include: ORDER_INCLUDE })
    },

    setServedLines: async (
      _p: unknown,
      a: { id: string; lines: { lineId: string; status: 'VALIDATED' | 'ADJUSTED' | 'REJECTED'; quantityServed?: number; rejectReason?: string }[] },
      ctx: Ctx,
    ) => {
      const u = requireStaff(ctx)
      await run(() =>
        setServedLines(
          Number(a.id),
          u.id,
          a.lines.map((l) => ({
            lineId: Number(l.lineId),
            status: l.status,
            quantityServed: l.quantityServed,
            rejectReason: l.rejectReason,
          })),
        ),
      )
      return prisma.order.findUniqueOrThrow({ where: { id: Number(a.id) }, include: ORDER_INCLUDE })
    },

    deliverOrder: async (_p: unknown, a: { id: string }, ctx: Ctx) => {
      const u = requireStaff(ctx)
      await run(() => deliverOrder(Number(a.id), u.id))
      return prisma.order.findUniqueOrThrow({ where: { id: Number(a.id) }, include: ORDER_INCLUDE })
    },

    setStockFixe: async (
      _p: unknown,
      a: { departmentId: string; lines: { productId: string; quantity: number }[] },
      ctx: Ctx,
    ) => {
      const u = requireUser(ctx)
      if (u.role !== 'ADMIN') {
        throw new GraphQLError('Réglage réservé à l’administration.', {
          extensions: { code: 'FORBIDDEN' },
        })
      }
      const departmentId = Number(a.departmentId)

      for (const l of a.lines) {
        if (!Number.isFinite(l.quantity) || l.quantity < 0) {
          throw new GraphQLError('Quantité de stock fixe invalide.', {
            extensions: { code: 'BUSINESS_RULE' },
          })
        }
      }

      // Un stock fixe à 0 n'a rien à stocker : on supprime la ligne plutôt que
      // de garder des zéros qui alourdissent la table sans rien signifier.
      const toZero = a.lines.filter((l) => l.quantity === 0).map((l) => Number(l.productId))
      const toSet = a.lines.filter((l) => l.quantity > 0)

      await prisma.$transaction([
        prisma.stockFixe.deleteMany({
          where: { departmentId, productId: { in: toZero } },
        }),
        ...toSet.map((l) =>
          prisma.stockFixe.upsert({
            where: {
              departmentId_productId: { departmentId, productId: Number(l.productId) },
            },
            update: { quantity: l.quantity },
            create: { departmentId, productId: Number(l.productId), quantity: l.quantity },
          }),
        ),
      ])

      return toSet.length
    },

    receiveOrder: async (
      _p: unknown,
      a: { id: string; lines?: { lineId: string; quantityReceived: number }[] },
      ctx: Ctx,
    ) => {
      const u = requireEmployee(ctx)
      await run(() =>
        receiveOrder(
          Number(a.id),
          u,
          a.lines?.map((l) => ({
            lineId: Number(l.lineId),
            quantityReceived: l.quantityReceived,
          })),
        ),
      )
      return prisma.order.findUniqueOrThrow({ where: { id: Number(a.id) }, include: ORDER_INCLUDE })
    },

    receiveRefill: async (_p: unknown, a: { id: string; rank: number }, ctx: Ctx) => {
      const u = requireEmployee(ctx)
      await run(() => receiveRefill(Number(a.id), a.rank, u))
      return prisma.order.findUniqueOrThrow({ where: { id: Number(a.id) }, include: ORDER_INCLUDE })
    },
  },
}

export const schema = createSchema<Ctx>({ typeDefs, resolvers })
