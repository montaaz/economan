/**
 * Regroupe les articles d'une même famille sur chaque feuille.
 *
 * Les ajouts successifs ont éparpillé les familles : le Bar comptait
 * 14 familles réparties sur 32 blocs. On conserve l'ordre d'apparition de
 * chaque famille — le premier rang où elle figure — ainsi que l'ordre relatif
 * des articles à l'intérieur : réordonner alphabétiquement bousculerait des
 * feuilles que les employés parcourent de mémoire.
 */
import 'dotenv/config'
import { Client } from 'pg'

const DRY = process.argv.includes('--verifier')

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()

  const { rows: deps } = await db.query(
    `SELECT id, name FROM departments WHERE "isActive" ORDER BY "sortOrder", name`)

  let total = 0
  for (const dep of deps) {
    const { rows } = await db.query(
      `SELECT dp."productId", dp."sortOrder", p."categoryId", c.name AS famille, p.name
         FROM department_products dp
         JOIN products p ON p.id = dp."productId"
         JOIN categories c ON c.id = p."categoryId"
        WHERE dp."departmentId" = $1
        ORDER BY dp."sortOrder"`, [dep.id])
    if (rows.length === 0) { console.log(`${dep.name.padEnd(16)} feuille vide`); continue }

    // Ordre des familles = rang de leur première apparition.
    const ordreFamille: number[] = []
    for (const r of rows) if (!ordreFamille.includes(r.categoryId)) ordreFamille.push(r.categoryId)

    const regroupe = ordreFamille.flatMap((cid) => rows.filter((r: any) => r.categoryId === cid))

    const change = regroupe.some((r, i) => r.productId !== rows[i].productId)
    const blocsAvant = compterBlocs(rows)
    const blocsApres = compterBlocs(regroupe)
    console.log(
      `${dep.name.padEnd(16)} ${String(rows.length).padStart(3)} articles  `
      + `${blocsAvant} → ${blocsApres} blocs (${ordreFamille.length} familles)  `
      + `${change ? (DRY ? 'à regrouper' : 'regroupé') : 'déjà en ordre'}`)

    if (change && !DRY) {
      await db.query('BEGIN')
      for (const [i, r] of regroupe.entries()) {
        await db.query(
          `UPDATE department_products SET "sortOrder" = $1
            WHERE "departmentId" = $2 AND "productId" = $3`, [(i + 1) * 10, dep.id, r.productId])
      }
      await db.query('COMMIT')
      total += 1
    }
  }

  console.log(DRY ? '\n(vérification seule, rien écrit)' : `\n${total} feuille(s) réorganisée(s)`)
  await db.end()
}

function compterBlocs(rows: { categoryId: number }[]) {
  let n = 0, prec = -1
  for (const r of rows) { if (r.categoryId !== prec) { n += 1; prec = r.categoryId } }
  return n
}

main().catch((e) => { console.error(e); process.exit(1) })
