/**
 * Parcours complet : l'employé commande, l'économat sert et livre, l'employé
 * confirme la réception. Chaque étape passe par l'API HTTP réelle.
 */
import 'dotenv/config'
import { SignJWT } from 'jose'
import { Client } from 'pg'

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3001'
const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)

async function session(u: {
  id: number; username: string; fullName: string; role: string
  departmentId: number | null; departmentName: string | null
}) {
  const token = await new SignJWT({ ...u })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret)
  return `economan_session=${token}`
}

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

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    passed++
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed++
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()

  const { rows: users } = await db.query(
    `SELECT u.id, u.username, u."fullName", u.role, u."departmentId", d.name AS dept
     FROM users u LEFT JOIN departments d ON d.id = u."departmentId"`,
  )
  const bar = users.find((u) => u.username === 'bar')!
  const eco = users.find((u) => u.username === 'economat')!
  const admin = users.find((u) => u.username === 'admin')!

  const barCookie = await session({
    id: bar.id, username: bar.username, fullName: bar.fullName, role: bar.role,
    departmentId: bar.departmentId, departmentName: bar.dept,
  })
  const ecoCookie = await session({
    id: eco.id, username: eco.username, fullName: eco.fullName, role: eco.role,
    departmentId: null, departmentName: null,
  })
  const adminCookie = await session({
    id: admin.id, username: admin.username, fullName: admin.fullName, role: admin.role,
    departmentId: null, departmentName: null,
  })

  console.log('\n1. Catalogue du département')
  const cat = await gql<{ myCatalog: { id: string; name: string; baseUnit: { symbol: string } }[] }>(
    barCookie,
    `query { myCatalog { id name reference baseUnit { symbol } category { name } } }`,
  )
  check('catalogue chargé', cat.myCatalog.length > 0, `${cat.myCatalog.length} articles`)

  console.log('\n2. Envoi de la commande (les 0 ne sont pas enregistrés)')
  const picked = cat.myCatalog.slice(0, 4)
  const order = await gql<{ submitOrder: { id: string; reference: string; ticketNumber: number; lineCount: number } }>(
    barCookie,
    `mutation ($lines: [OrderLineInput!]!, $note: String) {
       submitOrder(lines: $lines, note: $note) { id reference ticketNumber lineCount status }
     }`,
    {
      lines: [
        { productId: picked[0].id, quantity: 5 },
        { productId: picked[1].id, quantity: 2.5 },
        { productId: picked[2].id, quantity: 0 }, // doit être ignoré
        { productId: picked[3].id, quantity: 12 },
      ],
      note: 'Test automatisé',
    },
  )
  const o = order.submitOrder
  check('commande créée', !!o.id, o.reference)
  check('les lignes à 0 ne sont pas enregistrées', o.lineCount === 3, `${o.lineCount} lignes sur 4 saisies`)
  check('numéro de ticket attribué', o.ticketNumber >= 1, `n°${o.ticketNumber}`)

  console.log('\n3. Refus d’une commande entièrement à zéro')
  try {
    await gql(barCookie, `mutation ($l: [OrderLineInput!]!) { submitOrder(lines: $l) { id } }`, {
      l: [{ productId: picked[0].id, quantity: 0 }],
    })
    check('commande vide rejetée', false, 'elle a été acceptée')
  } catch (e) {
    check('commande vide rejetée', true, (e as Error).message)
  }

  console.log('\n4. Cloisonnement entre départements')
  try {
    const other = await db.query(
      `SELECT p.id FROM products p
       WHERE p."categoryId" NOT IN (SELECT "categoryId" FROM department_categories WHERE "departmentId"=$1)
       LIMIT 1`,
      [bar.departmentId],
    )
    if (other.rows.length === 0) {
      console.log('  · (toutes les catégories sont affectées au Bar — test non applicable)')
    } else {
      await gql(barCookie, `mutation ($l: [OrderLineInput!]!) { submitOrder(lines: $l) { id } }`, {
        l: [{ productId: String(other.rows[0].id), quantity: 1 }],
      })
      check('article hors département refusé', false, 'il a été accepté')
    }
  } catch (e) {
    check('article hors département refusé', true, (e as Error).message)
  }

  console.log('\n5. Tableau du jour côté économat')
  const board = await gql<{ dayBoard: { orderCount: number; departments: { department: { name: string }; orderCount: number; totalAsked: number }[]; totalAsked: number; pendingCount: number } }>(
    ecoCookie,
    `query { dayBoard { day orderCount lineCount totalAsked totalServed pendingCount
       departments { department { id name } orderCount lineCount totalAsked totalServed
         orders { id reference ticketNumber status } } } }`,
  )
  check('journée groupée par département', board.dayBoard.departments.length > 0,
    `${board.dayBoard.departments.length} département(s), ${board.dayBoard.orderCount} ticket(s)`)
  check('total de la journée calculé', board.dayBoard.totalAsked > 0, `${board.dayBoard.totalAsked} demandé`)
  check('commande en attente signalée', board.dayBoard.pendingCount > 0, `${board.dayBoard.pendingCount} en attente`)

  console.log('\n6. Un employé ne voit pas le tableau de l’économat')
  try {
    await gql(barCookie, `query { dayBoard { orderCount } }`)
    check('accès employé refusé au tableau économat', false, 'accès accordé')
  } catch (e) {
    check('accès employé refusé au tableau économat', true, (e as Error).message)
  }

  console.log('\n7. Traitement par l’économat')
  await gql(ecoCookie, `mutation ($id: ID!) { acceptOrder(id: $id) { id status } }`, { id: o.id })
  check('commande acceptée', true)

  const full = await gql<{ order: { lines: { id: string; quantityAsked: number }[] } }>(
    ecoCookie,
    `query ($id: ID!) { order(id: $id) { id status lines { id quantityAsked } } }`,
    { id: o.id },
  )
  const [l1, l2, l3] = full.order.lines
  await gql(
    ecoCookie,
    `mutation ($id: ID!, $lines: [ServedLineInput!]!) { setServedLines(id: $id, lines: $lines) { id } }`,
    {
      id: o.id,
      lines: [
        { lineId: l1.id, status: 'VALIDATED' },
        { lineId: l2.id, status: 'ADJUSTED', quantityServed: 1 },
        { lineId: l3.id, status: 'REJECTED', rejectReason: 'Rupture de stock' },
      ],
    },
  )
  const served = await gql<{ order: { totalServed: number; lines: { status: string; quantityServed: number | null; rejectReason: string | null }[] } }>(
    ecoCookie,
    `query ($id: ID!) { order(id: $id) { totalServed lines { status quantityServed rejectReason } } }`,
    { id: o.id },
  )
  check('ligne validée', served.order.lines[0].status === 'VALIDATED',
    `servi ${served.order.lines[0].quantityServed}`)
  check('ligne ajustée', served.order.lines[1].status === 'ADJUSTED' && served.order.lines[1].quantityServed === 1,
    `demandé ${l2.quantityAsked} → servi ${served.order.lines[1].quantityServed}`)
  check('ligne en rupture', served.order.lines[2].status === 'REJECTED',
    served.order.lines[2].rejectReason ?? '')

  console.log('\n8. Bon de livraison')
  const delivered = await gql<{ deliverOrder: { status: string } }>(
    ecoCookie,
    `mutation ($id: ID!) { deliverOrder(id: $id) { id status } }`,
    { id: o.id },
  )
  check('commande livrée', delivered.deliverOrder.status === 'DELIVERED', delivered.deliverOrder.status)

  console.log('\n9. Réception par l’employé')
  const received = await gql<{ receiveOrder: { status: string } }>(
    barCookie,
    `mutation ($id: ID!) { receiveOrder(id: $id) { id status } }`,
    { id: o.id },
  )
  check('réception confirmée', received.receiveOrder.status === 'RECEIVED', received.receiveOrder.status)

  console.log('\n10. Mes commandes des 3 derniers jours')
  const mine = await gql<{ myOrders: { id: string; businessDay: string }[] }>(
    barCookie,
    `query { myOrders(days: 3) { id reference businessDay status lineCount } }`,
  )
  check('historique 3 jours', mine.myOrders.length > 0, `${mine.myOrders.length} commande(s)`)

  console.log('\n11. Numérotation des tickets')
  const second = await gql<{ submitOrder: { ticketNumber: number } }>(
    barCookie,
    `mutation ($l: [OrderLineInput!]!) { submitOrder(lines: $l) { id ticketNumber } }`,
    { l: [{ productId: picked[0].id, quantity: 3 }] },
  )
  check('ticket suivant incrémenté', second.submitOrder.ticketNumber === o.ticketNumber + 1,
    `n°${o.ticketNumber} puis n°${second.submitOrder.ticketNumber}`)

  console.log('\n12. Vue administrateur')
  const adminBoard = await gql<{ dayBoard: { orderCount: number; totalAsked: number; totalServed: number } }>(
    adminCookie,
    `query { dayBoard { day orderCount lineCount totalAsked totalServed departments { department { name } orderCount totalAsked } } }`,
  )
  check('tableau admin accessible', adminBoard.dayBoard.orderCount > 0,
    `${adminBoard.dayBoard.orderCount} ticket(s), ${adminBoard.dayBoard.totalAsked} demandé`)

  await db.end()

  console.log(`\n${'─'.repeat(52)}`)
  console.log(`  ${passed} réussis, ${failed} échoués`)
  console.log(`${'─'.repeat(52)}\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('\nÉchec :', e)
  process.exit(1)
})
