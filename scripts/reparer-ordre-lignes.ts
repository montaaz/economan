/**
 * Recale l'ordre des lignes de commande sur la feuille de leur département.
 *
 * Les lignes écrites avant le correctif portaient `Product.sortOrder` — le
 * rang de l'article dans sa catégorie, nul pour la plupart — au lieu du rang
 * dans la feuille du département. Les articles s'affichaient donc dans
 * l'ordre où l'employé les avait cochés, différent d'un ticket à l'autre.
 *
 * Lancer avec --apply pour écrire ; sans l'option, le script ne fait que
 * rendre compte de ce qu'il changerait.
 */
import 'dotenv/config'
import { Client } from 'pg'

const APPLY = process.argv.includes('--apply')
const HORS_FEUILLE = 1_000_000

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()

  const { rows: lignes } = await db.query<{
    id: number; orderId: number; reference: string; productName: string
    ancien: number; feuille: number | null
  }>(`
    SELECT l.id, l."orderId", o.reference, l."productName",
           l."sortOrder" AS ancien, dp."sortOrder" AS feuille
    FROM order_lines l
    JOIN orders o ON o.id = l."orderId"
    LEFT JOIN department_products dp
      ON dp."productId" = l."productId" AND dp."departmentId" = o."departmentId"
    ORDER BY l.id`)

  const aChanger = lignes.filter((l) => (l.feuille ?? HORS_FEUILLE) !== l.ancien)
  const horsFeuille = lignes.filter((l) => l.feuille === null)

  console.log(`${lignes.length} lignes de commande, ${new Set(lignes.map((l) => l.orderId)).size} commandes`)
  console.log(`  à recaler : ${aChanger.length}`)
  console.log(`  absentes de la feuille de leur département : ${horsFeuille.length}`)
  if (horsFeuille.length > 0) {
    for (const l of horsFeuille.slice(0, 10)) {
      console.log(`    ${l.reference} · ${l.productName}`)
    }
    if (horsFeuille.length > 10) console.log(`    … et ${horsFeuille.length - 10} autres`)
  }

  if (!APPLY) {
    console.log('\nSimulation seule. Relancer avec --apply pour écrire.')
    await db.end()
    return
  }

  await db.query('BEGIN')
  try {
    for (const l of aChanger) {
      await db.query('UPDATE order_lines SET "sortOrder" = $1 WHERE id = $2', [
        l.feuille ?? HORS_FEUILLE, l.id,
      ])
    }
    await db.query('COMMIT')
    console.log(`\n${aChanger.length} lignes recalées.`)
  } catch (e) {
    await db.query('ROLLBACK')
    throw e
  }
  await db.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
