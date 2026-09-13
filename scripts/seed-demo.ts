/** Quelques commandes de démonstration, pour voir les écrans remplis. */
import 'dotenv/config'
import { SignJWT } from 'jose'
import { Client } from 'pg'

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3001'
const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)

async function gql<T>(cookie: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}/api/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json.data as T
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  const { rows } = await db.query(
    `SELECT u.id, u.username, u."fullName", u.role, u."departmentId", d.name AS dept
     FROM users u LEFT JOIN departments d ON d.id=u."departmentId" WHERE u.role='EMPLOYEE'`,
  )
  const { rows: staff } = await db.query(`SELECT id, username, "fullName", role FROM users WHERE username='economat'`)
  await db.end()

  const tok = async (u: Record<string, unknown>) =>
    `economan_session=${await new SignJWT(u)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secret)}`

  const ecoCookie = await tok({
    id: staff[0].id, username: staff[0].username, fullName: staff[0].fullName,
    role: staff[0].role, departmentId: null, departmentName: null,
  })

  for (const u of rows) {
    const cookie = await tok({
      id: u.id, username: u.username, fullName: u.fullName, role: u.role,
      departmentId: u.departmentId, departmentName: u.dept,
    })
    const cat = await gql<{ myCatalog: { id: string }[] }>(cookie, `query { myCatalog { id } }`)
    if (cat.myCatalog.length === 0) continue

    const pick = cat.myCatalog
      .slice(0, 8)
      .map((p) => ({ productId: p.id, quantity: Math.round((Math.random() * 9 + 1) * 2) / 2 }))

    const r = await gql<{ submitOrder: { id: string; reference: string } }>(
      cookie,
      `mutation ($l: [OrderLineInput!]!) { submitOrder(lines: $l) { id reference } }`,
      { l: pick },
    )
    console.log(`${u.dept.padEnd(14)} → ${r.submitOrder.reference}`)

    // On laisse le Bar en attente, on traite les autres pour varier les états.
    if (u.dept !== 'Bar') {
      await gql(ecoCookie, `mutation ($id: ID!) { acceptOrder(id: $id) { id } }`, { id: r.submitOrder.id })
      if (u.dept === 'Cuisine') {
        const full = await gql<{ order: { lines: { id: string }[] } }>(
          ecoCookie,
          `query ($id: ID!) { order(id: $id) { lines { id } } }`,
          { id: r.submitOrder.id },
        )
        await gql(
          ecoCookie,
          `mutation ($id: ID!, $l: [ServedLineInput!]!) { setServedLines(id: $id, lines: $l) { id } }`,
          {
            id: r.submitOrder.id,
            l: [
              { lineId: full.order.lines[0].id, status: 'VALIDATED' },
              { lineId: full.order.lines[1].id, status: 'ADJUSTED', quantityServed: 2 },
              { lineId: full.order.lines[2].id, status: 'REJECTED', rejectReason: 'Rupture fournisseur' },
            ],
          },
        )
        await gql(ecoCookie, `mutation ($id: ID!) { deliverOrder(id: $id) { id } }`, { id: r.submitOrder.id })
      }
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
