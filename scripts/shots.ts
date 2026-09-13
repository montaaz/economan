/** Capture les écrans clés en mobile, tablette et bureau. */
import 'dotenv/config'
import { chromium, type Browser } from 'playwright'
import { SignJWT } from 'jose'
import { Client } from 'pg'
import { mkdirSync } from 'node:fs'

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3001'
const OUT = process.env.SHOTS_DIR ?? './shots'
const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)

const SIZES = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablette', width: 834, height: 1112 },
  { name: 'bureau', width: 1440, height: 900 },
]

async function token(u: Record<string, unknown>) {
  return new SignJWT(u)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret)
}

async function shoot(browser: Browser, name: string, path: string, cookie?: string) {
  for (const s of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height } })
    if (cookie) {
      await ctx.addCookies([
        { name: 'economan_session', value: cookie, domain: 'localhost', path: '/' },
      ])
    }
    const page = await ctx.newPage()
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${OUT}/${name}-${s.name}.png`, fullPage: false })
    console.log(`  ${name}-${s.name}.png`)
    await ctx.close()
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  const { rows } = await db.query(
    `SELECT u.id, u.username, u."fullName", u.role, u."departmentId", d.name AS dept
     FROM users u LEFT JOIN departments d ON d.id=u."departmentId"`,
  )
  const bar = rows.find((r) => r.username === 'bar')!
  const eco = rows.find((r) => r.username === 'economat')!
  const admin = rows.find((r) => r.username === 'admin')!
  await db.end()

  const barTok = await token({
    id: bar.id, username: bar.username, fullName: bar.fullName, role: bar.role,
    departmentId: bar.departmentId, departmentName: bar.dept,
  })
  const ecoTok = await token({
    id: eco.id, username: eco.username, fullName: eco.fullName, role: eco.role,
    departmentId: null, departmentName: null,
  })
  const adminTok = await token({
    id: admin.id, username: admin.username, fullName: admin.fullName, role: admin.role,
    departmentId: null, departmentName: null,
  })

  const browser = await chromium.launch()
  console.log('\nCaptures :')
  await shoot(browser, '01-accueil', '/')
  await shoot(browser, '02-login-departement', `/login/${bar.departmentId}`)
  await shoot(browser, '03-commande', '/employe/commande', barTok)
  await shoot(browser, '04-mes-commandes', '/employe', barTok)
  await shoot(browser, '05-economat', '/economat', ecoTok)
  await shoot(browser, '06-admin', '/admin', adminTok)
  await shoot(browser, '07-affectations', '/admin/affectations', adminTok)
  await shoot(browser, '08-departements', '/admin/departements', adminTok)
  await shoot(browser, '09-utilisateurs', '/admin/utilisateurs', adminTok)
  await shoot(browser, '10-compte', '/employe/compte', barTok)
  await browser.close()
  console.log(`\n→ ${OUT}\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
