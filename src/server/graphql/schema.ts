import 'server-only'
import { createSchema } from 'graphql-yoga'
import { GraphQLError } from 'graphql'
import { prisma } from '@/server/db'
import { businessDay, salesDay, addDays } from '@/lib/utils'
import { resteAServir } from '@/lib/reste'
import type { SessionUser } from '@/server/auth/session'
import {
  createOrder, updateOrder, acceptOrder, cancelAcceptance, setServedLines, deliverOrder,
  receiveOrder, addRefill, cancelService, receiveRefill, WorkflowError,
} from '@/server/services/orders'

export type Ctx = { user: SessionUser | null }

const typeDefs = /* GraphQL */ `
  scalar DateTime
  scalar Date

  enum Role { EMPLOYEE ECONOMAN CONTROLEUR ADMIN }
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

  "Famille de la carte de vente : Pizzas, Boissons chaudes, Desserts…"
  type SalesFamily {
    id: ID!
    name: String!
    icon: String
    sortOrder: Int!
    isActive: Boolean!
    itemCount: Int!
    items: [SalesItem!]!
  }

  "Un article de la carte, tel qu'il sort sur le Z de la caisse."
  type SalesItem {
    id: ID!
    name: String!
    code: String
    price: Float
    sortOrder: Int!
    isActive: Boolean!
    family: SalesFamily!
    "Le service qui vend cet article. Nul s'il n'est rattaché à personne."
    department: Department
  }

  "Le Z d'une journée : ce qui a été vendu, article par article."
  type SalesReport {
    id: ID!
    businessDay: Date!
    note: String
    sourceFile: String
    createdAt: DateTime!
    createdBy: User
    "Nombre d'articles vendus, toutes lignes confondues."
    totalQuantity: Float!
    "Chiffre d'affaires du Z, quand les prix sont renseignés."
    totalAmount: Float!
    lineCount: Int!
    "La recette ventilée par service — le total du Z, service par service."
    byDepartment: [SalesByDepartment!]!
    lines: [SalesReportLine!]!
  }

  type SalesReportLine {
    itemId: ID!
    name: String!
    code: String
    familyName: String!
    departmentId: ID
    departmentName: String
    unitPrice: Float
    quantity: Float!
    amount: Float
  }

  "Ce qu'un service a vendu sur une journée."
  type SalesByDepartment {
    department: Department
    quantity: Float!
    amount: Float!
    lineCount: Int!
  }

  "Ce qu'un département détient et vise pour un article, vu du contrôle."
  type ControlLine {
    productId: ID!
    productName: String!
    productRef: String!
    categoryName: String!
    unitSymbol: String!
    "Cible réglée par l'administration."
    stockFixe: Float!
    "Dernier stock compté par le service, au moment de sa dernière commande."
    countedStock: Float
    "Journée de ce comptage."
    countedOn: Date
    "Commandé ce jour-là."
    quantityAsked: Float
    "Servi par l'économat, compléments reçus compris."
    quantityServed: Float
    "Écart entre la cible et le dernier comptage."
    gap: Float!
  }

  "Le contrôle des stocks d'un département sur une journée."
  type ControlDepartment {
    department: Department!
    lineCount: Int!
    "Articles dont le comptage manque encore."
    uncountedCount: Int!
    lines: [ControlLine!]!
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
    "Stock compté par l'employé au moment de l'envoi."
    quantityOnHand: Float!
    "Ce qui a été complété lors des services suivants, tous passages confondus."
    quantityRefilled: Float!
    "Complété par des servis que le département a réceptionnés : ce qui est réellement au rayon."
    quantityRefilledReceived: Float!
    "Servi en tout — premier service plus compléments réceptionnés. Nul tant que rien n'est servi."
    quantityServedTotal: Float
    "Ce qu'il reste à servir, tous passages confondus."
    remaining: Float!
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
    "Remarque laissée par le département en confirmant la réception."
    receptionNote: String
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
    "Remarque du département à la réception de ce passage."
    receptionNote: String
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
    "Cible du rayon au moment de la commande."
    stockFixe: Float!
    quantityAsked: Float!
    "Ce qui est sorti au premier servi."
    firstServed: Float!
    "Ce qui sort à ce passage."
    quantity: Float!
    "Ce qui reste dû après ce passage, les passages précédents compris."
    remaining: Float!
    "Le motif de rupture du premier servi, s'il y en avait un."
    rejectReason: String
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
  input SalesFamilyInput { name: String!, icon: String, sortOrder: Int }
  input SalesItemInput { familyId: ID!, departmentId: ID, name: String!, code: String, price: Float, sortOrder: Int }
  input SalesLineInput { itemId: ID!, quantity: Float!, amount: Float }
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

    "La carte de vente, familles et articles — écran de saisie du Z et administration."
    salesCard(includeInactive: Boolean = false): [SalesFamily!]!
    "Journée de service des ventes en cours : la veille tant que le service n'a pas fermé."
    currentSalesDay: Date!
    "Le Z d'une journée, s'il a été saisi."
    salesReport(day: Date): SalesReport
    "Les Z enregistrés, du plus récent au plus ancien."
    salesReports(limit: Int = 60, from: Date, to: Date): [SalesReport!]!
    "Contrôle des stocks : ce que chaque service détient et vise, sur une journée."
    stockControl(day: Date, departmentId: ID): [ControlDepartment!]!
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
    "L'employé confirme la réception, avec au besoin une remarque pour l'économat."
    receiveOrder(id: ID!, note: String): Order!
    "Le département confirme la réception d'un servi complémentaire, indépendamment de la commande."
    receiveRefill(id: ID!, rank: Int!, note: String): Order!
    "Administration : règle le stock fixe d'un département."
    setStockFixe(departmentId: ID!, lines: [StockFixeInput!]!): Int!

    "Administration : crée une famille de la carte de vente."
    createSalesFamily(input: SalesFamilyInput!): SalesFamily!
    "Administration : renomme ou réordonne une famille."
    updateSalesFamily(id: ID!, input: SalesFamilyInput!): SalesFamily!
    "Administration : retire une famille de la carte. Refusée si elle porte des articles."
    deleteSalesFamily(id: ID!): Boolean!
    "Ajoute un article à la carte. Administration et contrôle de gestion."
    createSalesItem(input: SalesItemInput!): SalesItem!
    "Modifie un article de la carte. Administration et contrôle de gestion."
    updateSalesItem(id: ID!, input: SalesItemInput!): SalesItem!
    "Retire un article de la carte. Archivé s'il figure déjà sur un Z."
    deleteSalesItem(id: ID!): Boolean!
    "Contrôle de gestion : enregistre le Z d'une journée. Réécrit celui du jour s'il existe."
    saveSalesReport(day: Date, lines: [SalesLineInput!]!, note: String): SalesReport!
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

/** Le contrôle de gestion, et l'administration qui voit tout. */
function requireControl(ctx: Ctx) {
  const u = requireUser(ctx)
  if (u.role !== 'CONTROLEUR' && u.role !== 'ADMIN') {
    throw new GraphQLError('Accès réservé au contrôle de gestion.', {
      extensions: { code: 'FORBIDDEN' },
    })
  }
  return u
}

function requireAdmin(ctx: Ctx) {
  const u = requireUser(ctx)
  if (u.role !== 'ADMIN') {
    throw new GraphQLError('Réservé à l’administration.', { extensions: { code: 'FORBIDDEN' } })
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
      id: true, rank: true, createdAt: true, receivedAt: true, receptionNote: true,
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
    quantityRefilledReceived: (l: LigneServie) => refilledReceived(l),
    quantityServedTotal: (l: LigneServie) =>
      l.quantityServed === null || l.quantityServed === undefined
        ? null
        : Number(l.quantityServed) + refilledReceived(l),
    status: (l: LigneServie) => effectiveStatus(l),
    remaining: (l: LigneServie) => resteAServir(l as never),
    quantityOnHand: (l: { quantityOnHand: unknown }) => Number(l.quantityOnHand ?? 0),
    quantityAsked: (l: { quantityAsked: unknown }) => Number(l.quantityAsked),
    quantityServed: (l: { quantityServed: unknown }) =>
      l.quantityServed === null || l.quantityServed === undefined ? null : Number(l.quantityServed),
  },

  SalesFamily: {
    id: (f: { id: number }) => String(f.id),
    itemCount: (f: { items?: unknown[] }) => f.items?.length ?? 0,
    items: (f: { items?: { sortOrder: number; name: string }[] }) =>
      (f.items ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
  },

  SalesItem: {
    id: (i: { id: number }) => String(i.id),
    department: (i: { department?: unknown }) => i.department ?? null,
    price: (i: { price: unknown }) => (i.price === null || i.price === undefined ? null : Number(i.price)),
  },

  SalesReport: {
    id: (r: { id: number }) => String(r.id),
    lineCount: (r: { lines?: unknown[] }) => r.lines?.length ?? 0,
    totalQuantity: (r: { lines?: { quantity: unknown }[] }) =>
      (r.lines ?? []).reduce((n, l) => n + Number(l.quantity), 0),
    // Le montant d'une ligne prime sur le prix de la carte : le Z fait foi,
    // et un prix changé depuis ne doit pas réécrire une recette passée.
    totalAmount: (r: { lines?: { quantity: unknown; amount: unknown; item?: { price: unknown } }[] }) =>
      (r.lines ?? []).reduce((n, l) => {
        if (l.amount !== null && l.amount !== undefined) return n + Number(l.amount)
        const prix = l.item?.price
        return prix === null || prix === undefined ? n : n + Number(prix) * Number(l.quantity)
      }, 0),
    lines: (r: {
      lines?: {
        itemId: number; quantity: unknown; amount: unknown
        item: {
          name: string; code: string | null; price: unknown; sortOrder: number
          family: { name: string; sortOrder: number }
          department?: { id: number; name: string } | null
        }
      }[]
    }) =>
      (r.lines ?? [])
        .slice()
        .sort((a, b) =>
          a.item.family.sortOrder - b.item.family.sortOrder
          || a.item.family.name.localeCompare(b.item.family.name)
          || a.item.sortOrder - b.item.sortOrder
          || a.item.name.localeCompare(b.item.name))
        .map((l) => ({
          itemId: String(l.itemId),
          name: l.item.name,
          code: l.item.code,
          familyName: l.item.family.name,
          departmentId: l.item.department ? String(l.item.department.id) : null,
          departmentName: l.item.department?.name ?? null,
          unitPrice: l.item.price === null || l.item.price === undefined ? null : Number(l.item.price),
          quantity: Number(l.quantity),
          amount: l.amount === null || l.amount === undefined ? null : Number(l.amount),
        })),

    /**
     * La recette du Z, service par service.
     *
     * Le montant d'une ligne prime sur le prix de la carte : le Z fait foi,
     * et un prix changé depuis ne doit pas réécrire une recette passée. Les
     * articles sans service sont regroupés à part, sous un département nul.
     */
    byDepartment: (r: {
      lines?: {
        quantity: unknown; amount: unknown
        item: { price: unknown; department?: { id: number; name: string; sortOrder?: number } | null }
      }[]
    }) => {
      const par = new Map<string, { department: unknown; quantity: number; amount: number; lineCount: number }>()
      for (const l of r.lines ?? []) {
        const dep = l.item.department ?? null
        const cle = dep ? String(dep.id) : 'sans'
        const e = par.get(cle) ?? { department: dep, quantity: 0, amount: 0, lineCount: 0 }
        const q = Number(l.quantity)
        const montant = l.amount !== null && l.amount !== undefined
          ? Number(l.amount)
          : l.item.price === null || l.item.price === undefined ? 0 : Number(l.item.price) * q
        e.quantity += q
        e.amount += montant
        e.lineCount += 1
        par.set(cle, e)
      }
      return [...par.values()].sort((a, b) => b.amount - a.amount)
    },
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
    //
    // Le reste après ce passage a besoin des passages précédents de chaque
    // ligne : on recharge toujours depuis la base, quel que soit ce que
    // l'appelant avait déjà sous la main.
    lines: async (r: { id: number; rank: number }) => {
      const lines = await prisma.orderRefillLine.findMany({
        where: { refillId: r.id },
        include: {
          orderLine: {
            include: {
              unit: true,
              refills: { select: { quantity: true, refill: { select: { rank: true } } } },
            },
          },
        },
      })
      return lines
        .slice()
        .sort((a, b) => a.orderLine.sortOrder - b.orderLine.sortOrder)
        .map((l) => {
          const ol = l.orderLine
          // Sorti jusqu'à ce passage inclus : le premier servi, plus les
          // compléments de rang inférieur ou égal — le même calcul que le bon.
          const anterieurs = ol.refills
            .filter((x) => (x.refill?.rank ?? 0) <= r.rank)
            .reduce((n, x) => n + Number(x.quantity), 0)
          const sorti = Number(ol.quantityServed ?? 0) + anterieurs
          return {
            lineId: String(l.orderLineId),
            productName: ol.productName,
            productRef: ol.productRef,
            categoryName: ol.categoryName,
            unitSymbol: ol.unit?.symbol ?? '',
            stockFixe: Number(ol.stockFixe ?? 0),
            quantityAsked: Number(ol.quantityAsked),
            firstServed: Number(ol.quantityServed ?? 0),
            quantity: Number(l.quantity),
            remaining: Math.max(Number(ol.quantityAsked) - sorti, 0),
            rejectReason: ol.rejectReason ?? null,
          }
        })
    },
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

    salesCard: (_p: unknown, a: { includeInactive?: boolean }, ctx: Ctx) => {
      // La carte se lit des deux côtés : l'administration la règle, le
      // contrôle la saisit.
      const u = requireUser(ctx)
      if (u.role !== 'ADMIN' && u.role !== 'CONTROLEUR') {
        throw new GraphQLError('Accès réservé au contrôle de gestion.', {
          extensions: { code: 'FORBIDDEN' },
        })
      }
      return prisma.salesFamily.findMany({
        where: a.includeInactive ? {} : { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          items: {
            where: a.includeInactive ? {} : { isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            include: { family: true, department: true },
          },
        },
      })
    },

    currentSalesDay: (_p: unknown, _a: unknown, ctx: Ctx) => {
      requireControl(ctx)
      return salesDay()
    },

    salesReport: (_p: unknown, a: { day?: string }, ctx: Ctx) => {
      requireControl(ctx)
      return prisma.salesReport.findUnique({
        where: { businessDay: a.day ? toDate(a.day) : salesDay() },
        include: {
          createdBy: { include: { department: true } },
          lines: { include: { item: { include: { family: true, department: true } } } },
        },
      })
    },

    salesReports: (_p: unknown, a: { limit?: number; from?: string; to?: string }, ctx: Ctx) => {
      requireControl(ctx)
      const a1 = a.from ? toDate(a.from) : null
      const a2 = a.to ? toDate(a.to) : null
      return prisma.salesReport.findMany({
        where: a1 || a2
          ? { businessDay: { ...(a1 && { gte: a1 }), ...(a2 && { lte: a2 }) } }
          : undefined,
        orderBy: { businessDay: 'desc' },
        take: a.limit ?? 60,
        include: {
          createdBy: { include: { department: true } },
          lines: { include: { item: { include: { family: true, department: true } } } },
        },
      })
    },

    /**
     * Contrôle des stocks : pour chaque service, sa feuille entière avec la
     * cible et le dernier comptage de la journée.
     *
     * Le comptage vient de la commande du jour : c'est là que l'employé
     * déclare ce qu'il a en rayon. Un article sans ligne n'a pas été compté,
     * et sa case reste vide plutôt que d'afficher un zéro trompeur.
     */
    stockControl: async (_p: unknown, a: { day?: string; departmentId?: string }, ctx: Ctx) => {
      requireControl(ctx)
      const day = a.day ? toDate(a.day) : businessDay()

      const departments = await prisma.department.findMany({
        where: {
          isActive: true,
          ...(a.departmentId ? { id: Number(a.departmentId) } : {}),
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      })

      return Promise.all(departments.map(async (department) => {
        const [products, pars, lines] = await Promise.all([
          departmentCatalog(department.id),
          prisma.stockFixe.findMany({
            where: { departmentId: department.id },
            select: { productId: true, quantity: true },
          }),
          // Les lignes de la journée, la commande la plus récente en dernier :
          // c'est son comptage qui fait foi si le service a commandé deux fois.
          prisma.orderLine.findMany({
            where: { order: { departmentId: department.id, businessDay: day } },
            orderBy: [{ order: { ticketNumber: 'asc' } }],
            select: {
              productId: true,
              quantityOnHand: true,
              quantityAsked: true,
              quantityServed: true,
              refills: { select: { quantity: true } },
              order: { select: { businessDay: true } },
            },
          }),
        ])

        const parBy = new Map(pars.map((x) => [x.productId, Number(x.quantity)]))
        const lineBy = new Map(lines.map((l) => [l.productId, l]))

        const out = products.map((prod) => {
          const l = lineBy.get(prod.id)
          const cible = parBy.get(prod.id) ?? 0
          const compte = l ? Number(l.quantityOnHand) : null
          const servi = l
            ? Number(l.quantityServed ?? 0) + l.refills.reduce((n, r) => n + Number(r.quantity), 0)
            : null
          return {
            productId: String(prod.id),
            productName: prod.name,
            productRef: prod.reference,
            categoryName: prod.category?.name ?? '',
            unitSymbol: prod.baseUnit?.symbol ?? '',
            stockFixe: cible,
            countedStock: compte,
            countedOn: l ? l.order.businessDay : null,
            quantityAsked: l ? Number(l.quantityAsked) : null,
            quantityServed: servi,
            // Ce qui manque au rayon pour atteindre sa cible, au moment du
            // comptage. Sans comptage, il n'y a rien à mesurer.
            gap: compte === null ? 0 : Math.max(cible - compte, 0),
          }
        })

        return {
          department,
          lineCount: out.length,
          uncountedCount: out.filter((x) => x.countedStock === null).length,
          lines: out,
        }
      }))
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

    receiveOrder: async (_p: unknown, a: { id: string; note?: string | null }, ctx: Ctx) => {
      const u = requireEmployee(ctx)
      await run(() => receiveOrder(Number(a.id), u, a.note))
      return prisma.order.findUniqueOrThrow({ where: { id: Number(a.id) }, include: ORDER_INCLUDE })
    },

    createSalesFamily: async (
      _p: unknown,
      a: { input: { name: string; icon?: string | null; sortOrder?: number | null } },
      ctx: Ctx,
    ) => {
      requireAdmin(ctx)
      const name = a.input.name.trim()
      if (!name) throw new GraphQLError('Nommez la famille.', { extensions: { code: 'BUSINESS_RULE' } })
      return prisma.salesFamily.create({
        data: { name, icon: a.input.icon?.trim() || null, sortOrder: a.input.sortOrder ?? 0 },
        include: { items: { include: { family: true } } },
      })
    },

    updateSalesFamily: async (
      _p: unknown,
      a: { id: string; input: { name: string; icon?: string | null; sortOrder?: number | null } },
      ctx: Ctx,
    ) => {
      requireAdmin(ctx)
      const name = a.input.name.trim()
      if (!name) throw new GraphQLError('Nommez la famille.', { extensions: { code: 'BUSINESS_RULE' } })
      return prisma.salesFamily.update({
        where: { id: Number(a.id) },
        data: { name, icon: a.input.icon?.trim() || null, sortOrder: a.input.sortOrder ?? 0 },
        include: { items: { include: { family: true } } },
      })
    },

    deleteSalesFamily: async (_p: unknown, a: { id: string }, ctx: Ctx) => {
      requireAdmin(ctx)
      const n = await prisma.salesItem.count({ where: { familyId: Number(a.id) } })
      // Supprimer une famille emporterait ses articles, et avec eux les Z qui
      // les citent : on demande de vider la famille d'abord.
      if (n > 0) {
        throw new GraphQLError(
          `Cette famille porte ${n} article(s) : retirez-les avant de la supprimer.`,
          { extensions: { code: 'BUSINESS_RULE' } },
        )
      }
      await prisma.salesFamily.delete({ where: { id: Number(a.id) } })
      return true
    },

    createSalesItem: async (
      _p: unknown,
      a: { input: { familyId: string; departmentId?: string | null; name: string; code?: string | null; price?: number | null; sortOrder?: number | null } },
      ctx: Ctx,
    ) => {
      // Le contrôle ajoute aussi : un article manquant se découvre le soir,
      // devant la bande de caisse, et attendre l'administration bloquerait
      // la saisie du Z.
      requireControl(ctx)
      const name = a.input.name.trim()
      if (!name) throw new GraphQLError('Nommez l’article.', { extensions: { code: 'BUSINESS_RULE' } })
      if (a.input.price != null && (!Number.isFinite(a.input.price) || a.input.price < 0)) {
        throw new GraphQLError('Prix invalide.', { extensions: { code: 'BUSINESS_RULE' } })
      }
      return prisma.salesItem.create({
        data: {
          familyId: Number(a.input.familyId),
          departmentId: a.input.departmentId ? Number(a.input.departmentId) : null,
          name,
          code: a.input.code?.trim() || null,
          price: a.input.price ?? null,
          sortOrder: a.input.sortOrder ?? 0,
        },
        include: { family: true, department: true },
      })
    },

    updateSalesItem: async (
      _p: unknown,
      a: { id: string; input: { familyId: string; departmentId?: string | null; name: string; code?: string | null; price?: number | null; sortOrder?: number | null } },
      ctx: Ctx,
    ) => {
      requireControl(ctx)
      const name = a.input.name.trim()
      if (!name) throw new GraphQLError('Nommez l’article.', { extensions: { code: 'BUSINESS_RULE' } })
      if (a.input.price != null && (!Number.isFinite(a.input.price) || a.input.price < 0)) {
        throw new GraphQLError('Prix invalide.', { extensions: { code: 'BUSINESS_RULE' } })
      }
      return prisma.salesItem.update({
        where: { id: Number(a.id) },
        data: {
          familyId: Number(a.input.familyId),
          departmentId: a.input.departmentId ? Number(a.input.departmentId) : null,
          name,
          code: a.input.code?.trim() || null,
          price: a.input.price ?? null,
          sortOrder: a.input.sortOrder ?? 0,
        },
        include: { family: true, department: true },
      })
    },

    deleteSalesItem: async (_p: unknown, a: { id: string }, ctx: Ctx) => {
      requireControl(ctx)
      const id = Number(a.id)
      const n = await prisma.salesReportLine.count({ where: { itemId: id } })
      // Un article déjà vendu ne s'efface pas : les Z passés le citent, et
      // les effacer réécrirait des recettes. Il sort de la carte à la place.
      if (n > 0) {
        await prisma.salesItem.update({ where: { id }, data: { isActive: false } })
        return true
      }
      await prisma.salesItem.delete({ where: { id } })
      return true
    },

    /**
     * Enregistre le Z d'une journée.
     *
     * Une seule feuille par journée : réenregistrer remplace la précédente,
     * plutôt que d'empiler deux vérités sur la même date. Les quantités
     * nulles ne sont pas conservées — un article non vendu n'a pas de ligne.
     */
    saveSalesReport: async (
      _p: unknown,
      a: { day?: string; lines: { itemId: string; quantity: number; amount?: number | null }[]; note?: string | null },
      ctx: Ctx,
    ) => {
      const u = requireControl(ctx)
      const day = a.day ? toDate(a.day) : salesDay()

      for (const l of a.lines) {
        if (!Number.isFinite(l.quantity) || l.quantity < 0) {
          throw new GraphQLError('Quantité vendue invalide.', { extensions: { code: 'BUSINESS_RULE' } })
        }
        if (l.amount != null && (!Number.isFinite(l.amount) || l.amount < 0)) {
          throw new GraphQLError('Montant invalide.', { extensions: { code: 'BUSINESS_RULE' } })
        }
      }
      const retenues = a.lines.filter((l) => l.quantity > 0)
      if (retenues.length === 0) {
        throw new GraphQLError('Saisissez au moins une quantité vendue.', {
          extensions: { code: 'BUSINESS_RULE' },
        })
      }

      const connus = await prisma.salesItem.findMany({
        where: { id: { in: retenues.map((l) => Number(l.itemId)) } },
        select: { id: true },
      })
      if (connus.length !== retenues.length) {
        throw new GraphQLError('Article inconnu sur la carte.', { extensions: { code: 'BUSINESS_RULE' } })
      }

      const report = await prisma.$transaction(async (tx) => {
        const existant = await tx.salesReport.findUnique({ where: { businessDay: day } })
        if (existant) {
          await tx.salesReportLine.deleteMany({ where: { reportId: existant.id } })
          return tx.salesReport.update({
            where: { id: existant.id },
            data: {
              note: a.note?.trim() || null,
              createdById: u.id,
              lines: {
                create: retenues.map((l) => ({
                  itemId: Number(l.itemId), quantity: l.quantity, amount: l.amount ?? null,
                })),
              },
            },
            select: { id: true },
          })
        }
        return tx.salesReport.create({
          data: {
            businessDay: day,
            note: a.note?.trim() || null,
            createdById: u.id,
            lines: {
              create: retenues.map((l) => ({
                itemId: Number(l.itemId), quantity: l.quantity, amount: l.amount ?? null,
              })),
            },
          },
          select: { id: true },
        })
      })

      return prisma.salesReport.findUniqueOrThrow({
        where: { id: report.id },
        include: {
          createdBy: { include: { department: true } },
          lines: { include: { item: { include: { family: true, department: true } } } },
        },
      })
    },

    receiveRefill: async (
      _p: unknown,
      a: { id: string; rank: number; note?: string | null },
      ctx: Ctx,
    ) => {
      const u = requireEmployee(ctx)
      await run(() => receiveRefill(Number(a.id), a.rank, u, a.note))
      return prisma.order.findUniqueOrThrow({ where: { id: Number(a.id) }, include: ORDER_INCLUDE })
    },
  },
}

export const schema = createSchema<Ctx>({ typeDefs, resolvers })
