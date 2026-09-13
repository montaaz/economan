/** Rendu papier : émule @media print et exporte un PDF. */
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
  const { rows: delivered } = await db.query(
    `SELECT id FROM orders WHERE status IN ('DELIVERED','RECEIVED') ORDER BY id LIMIT 1`,
  )
  await db.end()

  const token = await new SignJWT({
    id: staff[0].id, username: staff[0].username, fullName: staff[0].fullName,
    role: staff[0].role, departmentId: null, departmentName: null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret)

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1200 } })
  await ctx.addCookies([{ name: 'economan_session', value: token, domain: 'localhost', path: '/' }])
  const page = await ctx.newPage()
  await page.goto(`${BASE}/economat/commandes/${delivered[0].id}`, { waitUntil: 'networkidle' })
  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/bon-livraison.png`, fullPage: true })
  console.log(`${OUT}/bon-livraison.png  ←  commande ${delivered[0].id}`)
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
