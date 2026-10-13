'use client'

import { Printer } from 'lucide-react'
import { formatQty } from '@/lib/utils'

type Feuille = { id: number; nom: string; couleur: string; lignes: { nom: string; famille: string; unite: string; fixe: number | null; prix: number | null }[] }

/**
 * Imprime ce qui est affiché : un département, ou tous (chacun sur sa page).
 * Les prix sont ceux en base : rechargez après une saisie pour les voir.
 */
export function ImprimerPrix({ feuilles, titre }: { feuilles: Feuille[]; titre: string }) {
  const imprimer = () => {
    const esc = (x: string) => x.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
    const dt = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} DT`
    const sections = feuilles.map((f, k) => {
      let corps = ''
      f.lignes.forEach((l, i) => {
        if (i === 0 || f.lignes[i - 1].famille !== l.famille) corps += `<tr class="fam"><td colspan="4">${esc(l.famille)}</td></tr>`
        corps += `<tr><td class="n">${i + 1}</td><td>${esc(l.nom)}</td><td>${l.fixe === null ? '—' : `${formatQty(l.fixe)} ${esc(l.unite)}`}</td><td><b>${l.prix === null ? '—' : `${dt(l.prix)} / ${esc(l.unite)}`}</b></td></tr>`
      })
      return `<section${k > 0 ? ' class="saut"' : ''}><h2><span style="background:${f.couleur}"></span>${esc(f.nom)} <small>${f.lignes.length} articles</small></h2>
        <table><thead><tr><th>#</th><th>Article</th><th>Stock fixe</th><th>Prix U</th></tr></thead><tbody>${corps}</tbody></table></section>`
    }).join('')
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Prix U — ${esc(titre)}</title><style>
      @page{size:A4 portrait;margin:0} html,body{margin:0} body{padding:10mm 9mm;font-family:Inter,Arial,sans-serif;color:#0f1e33;font-size:9pt}
      h1{font-size:15pt;margin:0 0 6px} h2{font-size:12pt;margin:6px 0 4px;display:flex;align-items:center;gap:6px} h2 span{width:10px;height:10px;border-radius:3px;display:inline-block} h2 small{font-weight:400;color:#4a5f7d;font-size:9pt}
      table{width:100%;border-collapse:collapse} thead{display:table-header-group} th{background:#0f1e33;color:#fff;font-size:8pt;text-transform:uppercase;padding:4px 6px;text-align:right} th:nth-child(2){text-align:left}
      td{padding:3px 6px;border-bottom:1px solid #d5dfee;text-align:right;white-space:nowrap} td:nth-child(2){text-align:left;white-space:normal} td.n{color:#4a5f7d;width:24px}
      tr.fam td{background:#e8eefa;font-weight:800;font-size:8pt;text-transform:uppercase;text-align:left} tr{page-break-inside:avoid} .saut{break-before:page}
    </style></head><body><h1>Prix U — ${esc(titre)}</h1>${sections}<script>window.onload=()=>{window.print()}</script></body></html>`)
    w.document.close()
  }
  return (
    <button type="button" onClick={imprimer}
      className="ml-auto inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-b from-[#4f6ef7] to-[#3b4fd8] px-4 text-[0.9rem] font-bold text-white shadow-[0_10px_24px_-10px_rgb(59_79_216/0.8)] hover:brightness-110">
      <Printer className="size-4" /> Imprimer {feuilles.length > 1 ? 'tout' : feuilles[0]?.nom ?? ''}
    </button>
  )
}
