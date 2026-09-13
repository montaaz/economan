/** Capture une page précise, pour vérifier un écran en cours de mise au point. */
import 'dotenv/config'
import { chromium } from 'playwright'
import { SignJWT } from 'jose'
import { Client } from 'pg'
import { mkdirSync } from 'node:fs'

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3001'
const OUT = process.env.SHOTS_DIR ?? './shots'
const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)

async function main() {
  const [username, path, name, widthRaw] = process.argv.slice(2)
  mkdirSync(OUT, { recursive: true })

  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  const { rows } = await db.query(
    `SELECT u.id, u.username, u."fullName", u.role, u."departmentId", d.name AS dept
     FROM users u LEFT JOIN departments d ON d.id=u."departmentId" WHERE u.username=$1`,
    [username],
  )
  const u = rows[0]
  const { rows: orders } = await db.query(
    `SELECT o.id, d.code FROM orders o JOIN departments d ON d.id=o."departmentId" ORDER BY o.id`,
  )
  await db.end()

  const token = await new SignJWT({
    id: u.id, username: u.username, fullName: u.fullName, role: u.role,
    departmentId: u.departmentId, departmentName: u.dept,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret)

  // `:orderId` est remplacé par la première commande, `:cuiOrder` par celle de la cuisine.
  const resolved = path
    .replace(':orderId', String(orders[0]?.id ?? 1))
    .replace(':cuiOrder', String(orders.find((o) => o.code === 'CUI')?.id ?? orders[0]?.id ?? 1))

  const width = Number(widthRaw ?? 1440)
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width, height: width > 700 ? 1000 : 900 } })
  await ctx.addCookies([{ name: 'economan_session', value: token, domain: 'localhost', path: '/' }])
  const page = await ctx.newPage()
  await page.goto(`${BASE}${resolved}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
  console.log(`${OUT}/${name}.png  ←  ${resolved}`)
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
