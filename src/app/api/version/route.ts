import { NextResponse } from 'next/server'
import { readSession } from '@/server/auth/session'
import { prisma } from '@/server/db'

export const dynamic = 'force-dynamic'

/**
 * L'empreinte des données : une seule requête, légère, qui change dès que
 * quelque chose bouge — une commande passée, acceptée, servie, livrée,
 * reçue ; un stock, un article, un réglage. Les pages la comparent toutes
 * les quelques secondes et ne se rafraîchissent que si elle a changé.
 */
export async function GET() {
  const u = await readSession()
  if (!u) return NextResponse.json({ v: null }, { status: 401 })
  const [r] = await prisma.$queryRaw<{ v: string }[]>`
    SELECT concat_ws('|',
      (SELECT concat(count(*), ':', max("updatedAt"), ':', max("acceptedAt"), ':', max("deliveredAt"), ':', max("receivedAt")) FROM orders),
      (SELECT concat(count(*), ':', max("createdAt"), ':', max("deliveredAt"), ':', max("receivedAt")) FROM order_refills),
      (SELECT concat(count(*), ':', sum(coalesce(l."quantityServed", 0)), ':', sum(length(l.status::text)), ':', sum(l."quantityAsked"))
         FROM order_lines l JOIN orders o ON o.id = l."orderId" WHERE o."businessDay" >= current_date - 3),
      (SELECT concat(count(*), ':', max("createdAt")) FROM stock_entries),
      (SELECT concat(count(*), ':', max("updatedAt")) FROM stock_fixe),
      (SELECT max("updatedAt") FROM stock_fixe_sets),
      (SELECT max("updatedAt") FROM stock_checks),
      (SELECT concat(count(*), ':', max("updatedAt")) FROM products),
      (SELECT concat(count(*), ':', max("updatedAt")) FROM categories),
      (SELECT concat(count(*), ':', sum("sortOrder"), ':', count("displayName"), ':', sum(coalesce("unitPrice", 0))) FROM department_products),
      (SELECT max("updatedAt") FROM departments),
      (SELECT max("updatedAt") FROM declared_sales),
      (SELECT max("updatedAt") FROM sales_reports),
      (SELECT max("updatedAt") FROM recipes),
      (SELECT max("updatedAt") FROM suppliers),
      (SELECT max("updatedAt") FROM users),
      (SELECT max("updatedAt") FROM order_schedule)
    ) AS v`
  return NextResponse.json({ v: r?.v ?? '' }, { headers: { 'cache-control': 'no-store' } })
}
