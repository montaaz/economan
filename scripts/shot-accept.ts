/** Accepte une commande puis capture l'écran de service ligne par ligne. */
import 'dotenv/config'
import { chromium } from 'playwright'
import { SignJWT } from 'jose'
import { Client } from 'pg'
import { mkdirSync } from 'node:fs'

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3001'
const OUT = process.env.SHOTS_DIR ?? './shots'
const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)

async function main() {
  mkdirSync(OUT, { recursive: true })
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  const { rows: staff } = await db.query(`SELECT * FROM users WHERE username='economat'`)
  const { rows: orders } = await db.query(
    `SELECT id FROM orders WHERE status='PENDING' ORDER BY id LIMIT 1`,
  )
  await db.end()
  const orderId = orders[0].id

  const token = await new SignJWT({
    id: staff[0].id, username: staff[0].username, fullName: staff[0].fullName,
    role: staff[0].role, departmentId: null, departmentName: null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret)

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await ctx.addCookies([{ name: 'economan_session', value: token, domain: 'localhost', path: '/' }])
  const page = await ctx.newPage()

  await page.goto(`${BASE}/economat/commandes/${orderId}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Accepter la commande' }).click()
  await page.waitForTimeout(1500)

  // On coche une ligne servie, une ajustée, une en rupture.
  await page.getByRole('button', { name: 'Valider' }).first().click()
  await page.getByRole('button', { name: 'Ajuster la quantité' }).nth(1).click()
  await page.getByRole('button', { name: 'Rupture' }).nth(2).click()
  await page.waitForTimeout(400)

  await page.screenshot({ path: `${OUT}/eco-service.png` })
  console.log(`${OUT}/eco-service.png  ←  commande ${orderId}`)
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
