import 'server-only'
import { prisma } from '@/server/db'

/**
 * Les feuilles de commande vierges : pour chaque département, ses articles
 * dans l'ordre de sa feuille (ses noms propres, ses familles), et une colonne
 * « Commande » vide à remplir à la main. Toujours lues en base au moment de
 * l'impression : un article ajouté, renommé ou déplacé y est aussitôt.
 */
export async function feuillesCommandeHtml(departmentIds: number[] | 'tous'): Promise<string> {
  const deps = await prisma.department.findMany({
    where: { isActive: true, ...(departmentIds === 'tous' ? {} : { id: { in: departmentIds } }) },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, color: true, activeStockFixe: true },
  })
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

  const pages: string[] = []
  for (const d of deps) {
    // Le stock fixe en service : la table stock_fixe porte toujours le jeu actif.
    const [feuille, fixes] = await Promise.all([
      prisma.departmentProduct.findMany({
        where: { departmentId: d.id, product: { isActive: true, kind: { not: 'MERE' } } },
        orderBy: { sortOrder: 'asc' },
        select: { productId: true, displayName: true, product: { select: { name: true, category: { select: { name: true } }, baseUnit: { select: { symbol: true } } } } },
      }),
      prisma.stockFixe.findMany({ where: { departmentId: d.id }, select: { productId: true, quantity: true } }),
    ])
    const fixeDe = new Map(fixes.map((f) => [f.productId, Number(f.quantity)]))
    const lignes = feuille.map((r) => ({
      nom: r.displayName ?? r.product.name,
      famille: r.product.category.name,
      unite: r.product.baseUnit.symbol,
      fixe: fixeDe.get(r.productId) ?? null,
    }))
    if (lignes.length === 0) continue

    let corps = ''
    lignes.forEach((l, k) => {
      if (k === 0 || lignes[k - 1].famille !== l.famille) {
        const nb = lignes.filter((x) => x.famille === l.famille).length
        corps += `<tr class="fam"><td colspan="4">${esc(l.famille)} <span>(${nb})</span></td></tr>`
      }
      const fixe = l.fixe === null ? '—' : `${Number.isInteger(l.fixe) ? l.fixe : String(l.fixe).replace('.', ',')} <small>${esc(l.unite)}</small>`
      corps += `<tr><td class="num">${k + 1}</td><td class="art">${esc(l.nom)}</td><td class="fixe">${fixe}</td><td class="vide"></td></tr>`
    })
    pages.push(`<section class="feuille">
      <header>
        <div><h1><span class="pastille" style="background:${esc(d.color)}"></span>${esc(d.name)}</h1><div class="sous">Feuille de commande · ${lignes.length} articles · stock fixe ${d.activeStockFixe} en service</div></div>
        <div class="sous" style="text-align:right">Ticket de commande</div>
      </header>
      <div class="champs"><span>Date :</span><span>Heure :</span><span>Demandeur :</span></div>
      <table>
        <thead><tr><th class="num">#</th><th>Article</th><th class="fixe">Stock fixe</th><th class="vide">Commande</th></tr></thead>
        <tbody>${corps}</tbody>
      </table>
    </section>`)
  }

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
    body { font-family: Inter, 'Segoe UI', Arial, sans-serif; color: #0f1e33; font-size: 10.5pt; margin: 0 }
    .feuille + .feuille { break-before: page }
    header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid #0f1e33; padding-bottom: 6px }
    h1 { font-size: 20pt; margin: 0; letter-spacing: .02em; text-transform: uppercase }
    .pastille { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 8px; vertical-align: middle }
    .sous { font-size: 9pt; color: #4a5f7d; margin-top: 2px }
    .champs { display: flex; gap: 18px; margin: 10px 0 8px; font-size: 10pt }
    .champs span { flex: 1; border-bottom: 1px solid #8796ad; padding-bottom: 3px }
    table { width: 100%; border-collapse: collapse; table-layout: fixed }
    thead { display: table-header-group }
    thead th { background: #0f1e33; color: #fff; font-size: 9pt; text-transform: uppercase; letter-spacing: .05em; padding: 5px 6px; text-align: left }
    th.num, td.num { width: 30px; text-align: right }
    th.fixe, td.fixe { width: 95px; text-align: right }
    td.fixe { font-weight: 700 }
    td.fixe small { font-weight: 400; color: #4a5f7d }
    th.vide, td.vide { width: 140px }
    td { padding: 5px 6px; border-bottom: 1px solid #d5dfee; vertical-align: middle }
    td.num { color: #4a5f7d; font-size: 9pt }
    td.art { font-weight: 600 }
    td.vide { border-left: 1.5px solid #0f1e33; border-right: 1.5px solid #0f1e33 }
    tr { page-break-inside: avoid }
    tr.fam td { background: #e8eefa; font-weight: 800; font-size: 9pt; text-transform: uppercase; letter-spacing: .05em; padding: 4px 6px; border-bottom: 1px solid #b9c8e0 }
    tr.fam td span { font-weight: 400; color: #4a5f7d }
    .vide-doc { padding: 40px; text-align: center; color: #4a5f7d }
  </style></head><body>${pages.join('') || '<p class="vide-doc">Aucun article sur la feuille de ce département.</p>'}</body></html>`
}
