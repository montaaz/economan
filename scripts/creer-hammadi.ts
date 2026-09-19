/** Ajoute un second employé au Bar, pour éprouver le partage par département. */
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { Client } from 'pg'

const MOT_DE_PASSE = 'hammadi2026'

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()

  const { rows: [dep] } = await db.query(`SELECT id, name FROM departments WHERE code='BAR'`)
  if (!dep) { console.error('département Bar introuvable'); process.exit(1) }

  const { rows: [existe] } = await db.query(`SELECT id FROM users WHERE username='hammadi'`)
  if (existe) { console.log('le compte hammadi existe déjà'); await db.end(); return }

  const hash = await bcrypt.hash(MOT_DE_PASSE, 10)
  const { rows: [u] } = await db.query(
    `INSERT INTO users (username, "fullName", "passwordHash", role, "departmentId",
                        "avatarColor", "isActive", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,'EMPLOYEE',$4,$5,true,now(),now())
     RETURNING id, username, "fullName"`,
    ['hammadi', 'Hammadi Ben Younes', hash, dep.id, '#14b8a6'],
  )
  console.log(`créé : ${u.fullName} (${u.username}) — ${dep.name}`)
  console.log(`mot de passe : ${MOT_DE_PASSE}`)

  const { rows } = await db.query(
    `SELECT u.username, u."fullName" FROM users u WHERE u."departmentId"=$1 ORDER BY u.username`, [dep.id])
  console.table(rows)
  await db.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
