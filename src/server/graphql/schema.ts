import 'server-only'
import { createSchema } from 'graphql-yoga'
import { GraphQLError } from 'graphql'
import { prisma } from '@/server/db'
import { businessDay, addDays } from '@/lib/utils'
import type { SessionUser } from '@/server/auth/session'
import {
  createOrder, updateOrder, acceptOrder, setServedLines, deliverOrder, receiveOrder, WorkflowError,
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
    productName: String!
    productRef: String!
    categoryName: String!
    unitSymbol: String!
    quantityAsked: Float!
    quantityServed: Float
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
  }

  type Mutation {
    submitOrder(lines: [OrderLineInput!]!, note: String): Order!
    "Corrige une commande encore en attente. Refusée dès que l'économat l'a acceptée."
    updateOrder(id: ID!, lines: [OrderLineInput!]!, note: String): Order!
    acceptOrder(id: ID!): Order!
    setServedLines(id: ID!, lines: [ServedLineInput!]!): Order!
    deliverOrder(id: ID!): Order!
    "L'employé confirme la réception, en déclarant ce qu'il a compté."
    receiveOrder(id: ID!, lines: [ReceivedLineInput!]): Order!
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

const ORDER_INCLUDE = {
  department: true,
  createdBy: { include: { department: true } },
  processedBy: { include: { department: true } },
  lines: { orderBy: { sortOrder: 'asc' as const }, include: { unit: true } },
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
        orders: new Set([l.orderId]),
      })
    }

    return [...byProduct.values()]
      .map((r) => ({ ...r, ticketCount: r.orders.size }))
      .sort(
        (x, y) =>
          x.categoryName.localeCompare(y.categoryName) ||
          x.productName.localeCompare(y.productName),
      )
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
    unitSymbol: (l: { unit?: { symbol: string } }) => l.unit?.symbol ?? '',
    stockFixe: (l: { stockFixe: unknown }) => Number(l.stockFixe ?? 0),
    quantityReceived: (l: { quantityReceived: unknown }) =>
      l.quantityReceived === null || l.quantityReceived === undefined
        ? null
        : Number(l.quantityReceived),
    receiptGap: (l: { quantityReceived: unknown; quantityServed: unknown }) => {
      // Tant que rien n'est compté, il n'y a pas d'écart à signaler.
      if (l.quantityReceived === null || l.quantityReceived === undefined) return 0
      return Number(l.quantityReceived) - Number(l.quantityServed ?? 0)
    },
    quantityOnHand: (l: { quantityOnHand: unknown }) => Number(l.quantityOnHand ?? 0),
    quantityAsked: (l: { quantityAsked: unknown }) => Number(l.quantityAsked),
    quantityServed: (l: { quantityServed: unknown }) =>
      l.quantityServed === null || l.quantityServed === undefined ? null : Number(l.quantityServed),
  },

  Order: {
    lineCount: (o: { lines?: unknown[] }) => o.lines?.length ?? 0,
    rejectedCount: (o: { lines?: { status: string }[] }) =>
      (o.lines ?? []).filter((l) => l.status === 'REJECTED').length,
    adjustedCount: (o: { lines?: { status: string }[] }) =>
      (o.lines ?? []).filter((l) => l.status === 'ADJUSTED').length,
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
  },
}

export const schema = createSchema<Ctx>({ typeDefs, resolvers })
