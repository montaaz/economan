import 'dotenv/config'
import pg from 'pg'
import { SignJWT } from 'jose'
const B = 'http://localhost:3100'
const k = new TextEncoder().encode(process.env.AUTH_SECRET)
const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect()
const user = async (id) => { const u = (await db.query(`select u.id, u.username, u."fullName", u.role, u."departmentId", d.name dn from users u left join departments d on d.id=u."departmentId" where u.id=$1`, [id])).rows[0]
  return new SignJWT({ id: u.id, username: u.username, fullName: u.fullName, role: u.role, departmentId: u.departmentId, departmentName: u.dn }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(k) }
const EMP = await user(7), ECO = await user(2), ADM = await user(1)
const gql = async (tok, query, variables = {}) => {
  const r = await fetch(B + '/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json', cookie: `economan_session=${tok}`, origin: B }, body: JSON.stringify({ query, variables }) })
  const j = await r.json(); if (j.errors) throw new Error(j.errors.map((e) => e.message).join(' | ')); return j.data
}
const ok = (cond, msg) => console.log(cond ? '  ✔' : '  ✘', msg)
const counter0 = (await db.query(`select "lastNumber" from ticket_counters where "departmentId"=25 order by "businessDay" desc limit 1`)).rows[0]
let orderId
try {
  console.log('1. Employé ménage : commande')
  const P = { DINOL: 875, GRESYL: 944, SPONTEX: 1255 }
  const o = (await gql(EMP, `mutation($l:[OrderLineInput!]!){ submitOrder(lines:$l){ id reference status lines { id productId productName quantityAsked stockFixe } } }`,
    { l: [{ productId: P.DINOL, quantityOnHand: 4 }, { productId: P.GRESYL, quantityOnHand: 0 }, { productId: P.SPONTEX, quantityOnHand: 10 }] })).submitOrder
  orderId = o.id
  ok(o.status === 'PENDING', `commande ${o.reference} en attente`)
  ok(o.lines.length === 2, `2 lignes (SPONTEX couvert, non commandé) → ${o.lines.map((l) => `${l.productName} ${l.quantityAsked}`).join(', ')}`)
  const dinol = o.lines.find((l) => String(l.productId) === String(P.DINOL)), gresyl = o.lines.find((l) => String(l.productId) === String(P.GRESYL))
  ok(Number(dinol.quantityAsked) === 6 && Number(gresyl.quantityAsked) === 5, 'quantités = stock fixe − stock (10−4=6, 5−0=5)')
  ok(dinol.productName === 'DINOL', `nom de la feuille ménage sur la ligne (« ${dinol.productName} »)`)

  console.log('2. Économat : accepter, servir (ajusté + rupture), livrer')
  await gql(ECO, `mutation($id:ID!){ acceptOrder(id:$id){ id status } }`, { id: orderId })
  const s = (await gql(ECO, `mutation($id:ID!,$l:[ServedLineInput!]!){ setServedLines(id:$id, lines:$l){ id status lines { id status quantityServed } } }`,
    { id: orderId, l: [{ lineId: dinol.id, status: 'ADJUSTED', quantityServed: 4 }, { lineId: gresyl.id, status: 'REJECTED', rejectReason: 'Rupture fournisseur' }] })).setServedLines
  ok(s.lines.some((l) => l.status === 'ADJUSTED') && s.lines.some((l) => l.status === 'REJECTED'), `servi : ${s.lines.map((l) => l.status).join(', ')}`)
  const d = (await gql(ECO, `mutation($id:ID!){ deliverOrder(id:$id){ status } }`, { id: orderId })).deliverOrder
  ok(d.status === 'DELIVERED', `bon de livraison émis → ${d.status}`)

  console.log('3. Employé : réception')
  const r = (await gql(EMP, `mutation($id:ID!){ receiveOrder(id:$id){ status } }`, { id: orderId })).receiveOrder
  ok(r.status === 'RECEIVED', `réceptionnée → ${r.status}`)

  console.log('4. Écarts : servi complémentaire (2ᵉ servi) + bon + réception')
  const rf = (await gql(ECO, `mutation($id:ID!,$l:[RefillInput!]!){ addRefill(id:$id, lines:$l){ rank } }`, { id: orderId, l: [{ lineId: dinol.id, quantity: 2 }, { lineId: gresyl.id, quantity: 5 }] })).addRefill
  ok(rf.rank === 2, `2ᵉ servi créé (rang ${rf.rank})`)
  const jour = (await db.query(`select "businessDay"::text j from orders where id=$1`, [orderId])).rows[0].j
  const n = (await gql(ECO, `mutation($d:ID!,$j:Date!,$r:[Int!]!){ deliverRefills(departmentId:$d, day:$j, ranks:$r) }`, { d: 25, j: jour, r: [2] })).deliverRefills
  ok(n >= 1, `bon du 2ᵉ servi émis (${n})`)
  await gql(EMP, `mutation($id:ID!){ receiveRefill(id:$id, rank:2){ status } }`, { id: orderId })
  const fin = (await gql(ADM, `query($ids:[ID!]!){ orders(ids:$ids){ status lines { productName status quantityAsked quantityServedTotal remaining } } }`, { ids: [orderId] })).orders[0]
  ok(fin.lines.every((l) => Number(l.remaining) === 0), `tout soldé : ${fin.lines.map((l) => `${l.productName} ${l.quantityServedTotal}/${l.quantityAsked} reste ${l.remaining} (${l.status})`).join(' · ')}`)

  console.log('5. Pages par rôle')
  for (const [tok, nom, pages] of [[EMP, 'employé', ['/employe', '/employe/commande', '/employe/commandes', `/employe/commandes/${orderId}`]], [ECO, 'économat', ['/economat', '/economat/commandes', `/economat/commandes/${orderId}`, '/economat/ecarts?type=tous', '/economat/stock', '/economat/historique', '/economat/fiche-articles', '/economat/servis']], [ADM, 'admin', ['/admin', '/admin/stock-fixe', '/admin/ecarts?type=tous', '/admin/historique', '/admin/fournisseurs', '/admin/departements', '/admin/utilisateurs', '/admin/carte-vente', '/admin/horaires']]]) {
    const res = []
    for (const u of pages) { const x = await fetch(B + u, { headers: { cookie: `economan_session=${tok}` }, redirect: 'manual' }); res.push(`${u} ${x.status}`) }
    ok(res.every((x) => / (200)$/.test(x)), `${nom} : ${res.filter((x) => !/ 200$/.test(x)).join(', ') || 'toutes en 200'}`)
  }
} catch (e) { console.log('  ✘ ERREUR :', e.message) }
finally {
  if (orderId) { await db.query(`delete from orders where id=$1`, [orderId]) }
  if (counter0) await db.query(`update ticket_counters set "lastNumber"=$1 where "departmentId"=25 and "businessDay"=(select max("businessDay") from ticket_counters where "departmentId"=25)`, [counter0.lastNumber])
  else await db.query(`delete from ticket_counters where "departmentId"=25 and "businessDay"=current_date`)
  console.log('nettoyé : commande de test supprimée')
  await db.end()
}
