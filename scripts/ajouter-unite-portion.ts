/** Ajoute l'unité « Portion » (p) au catalogue d'unités. */
import 'dotenv/config'
import { Client } from 'pg'

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()

  // Une portion se compte à l'entier : pas de décimales, comme Unité ou Paquet.
  const { rows } = await db.query(
    `INSERT INTO units (name, symbol, "allowsDecimals")
     VALUES ('Portion', 'p', false)
     ON CONFLICT DO NOTHING
     RETURNING id, name, symbol`,
  )
  if (rows.length === 0) {
    const { rows: existing } = await db.query(
      `SELECT id, name, symbol FROM units WHERE symbol='p' OR name='Portion'`)
    console.log('déjà présente :', existing)
  } else {
    console.log('créée :', rows[0])
  }

  const { rows: all } = await db.query(`SELECT name, symbol FROM units ORDER BY name`)
  console.log('unités :', all.map((u) => `${u.name} (${u.symbol})`).join(', '))
  await db.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
