'use client'

import * as React from 'react'
import Link from 'next/link'
import { Printer, AlertTriangle, Layers, Search } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { correspond, normaliser } from '@/lib/search'
import { GlassCard, TableWrap, Th, Td } from '@/components/ui/glass'
import { FamilyBand } from '@/components/ui/family-band'
import { cn, formatQty } from '@/lib/utils'

export type Ligne = {
  id: string; nom: string; reference: string; famille: string; unite: string
  fixe: number; restant: number | null; commande: number; servi: number; prix: number | null
}
export type Rayon = { id: number; nom: string; couleur: string; lignes: Ligne[] }

/** Un montant en dinars, trois décimales comme les millimes. */
const dt = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} DT`
const totalLigne = (l: Ligne) => (l.prix ?? 0) * l.servi
const totalRayon = (r: Rayon) => r.lignes.reduce((n, l) => n + totalLigne(l), 0)

/**
 * Les commandes servies, valorisées : pour chaque article, Prix U × Servi, et
 * le total du département ; le total général quand il y en a plusieurs.
 */
export function Valorisation({ rayons: tousRayons, departements, initial, periode }: {
  rayons: Rayon[]
  departements: { id: number; nom: string; couleur: string; icon: string | null }[]
  /** Le département choisi au menu ; null : tous. */
  initial: number | null
  periode: string
}) {
  // Le filtre par département et la recherche agissent sur ce qui est chargé ;
  // l'impression reprend exactement ce qui est affiché.
  const [filtre, setFiltre] = React.useState<number | null>(initial)
  const [recherche, setRecherche] = React.useState('')
  const mot = normaliser(recherche)
  const rayons = tousRayons
    .filter((r) => filtre === null || r.id === filtre)
    .map((r) => ({ ...r, lignes: r.lignes.filter((l) => correspond(mot, l.nom, l.reference, l.famille)) }))
    .filter((r) => r.lignes.length > 0)
  const titre = filtre === null ? 'Tous les départements' : (departements.find((d) => d.id === filtre)?.nom ?? '')
  const general = rayons.reduce((n, r) => n + totalRayon(r), 0)
  const sansPrix = rayons.reduce((n, r) => n + r.lignes.filter((l) => l.prix === null && l.servi > 0).length, 0)

  const imprimer = () => {
    const esc = (x: string) => x.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
    const q = (v: number | null, u: string) => (v === null ? '—' : `${formatQty(v)} ${esc(u)}`)
    const sections = rayons.map((r, k) => {
      let corps = ''
      r.lignes.forEach((l, i) => {
        if (i === 0 || r.lignes[i - 1].famille !== l.famille) corps += `<tr class="fam"><td colspan="8">${esc(l.famille)}</td></tr>`
        corps += `<tr><td class="n">${i + 1}</td><td>${esc(l.nom)}</td><td>${q(l.fixe, l.unite)}</td><td>${q(l.restant, l.unite)}</td><td>${q(l.commande, l.unite)}</td><td><b>${q(l.servi, l.unite)}</b></td><td>${l.prix === null ? '—' : dt(l.prix)}</td><td class="t">${l.prix === null ? '—' : dt(totalLigne(l))}</td></tr>`
      })
      return `<section${k > 0 ? ' class="saut"' : ''}><h2><span style="background:${r.couleur}"></span>${esc(r.nom)}</h2>
        <table><thead><tr><th>#</th><th>Article</th><th>Fixe</th><th>Restant</th><th>Commande</th><th>Servi</th><th>Prix U</th><th>Total</th></tr></thead><tbody>${corps}</tbody></table>
        <p class="tot">Total ${esc(r.nom)} : <b>${dt(totalRayon(r))}</b></p></section>`
    }).join('')
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Commandes valorisées — ${esc(titre)}</title><style>
      @page{size:A4 portrait;margin:0} html,body{margin:0} body{padding:10mm 9mm;font-family:Inter,Arial,sans-serif;color:#0f1e33;font-size:8.5pt}
      h1{font-size:15pt;margin:0} .s{color:#4a5f7d;font-size:9pt;margin:2px 0 10px} h2{font-size:12pt;margin:8px 0 4px;display:flex;align-items:center;gap:6px} h2 span{width:10px;height:10px;border-radius:3px;display:inline-block}
      table{width:100%;border-collapse:collapse} thead{display:table-header-group} th{background:#0f1e33;color:#fff;font-size:7.5pt;text-transform:uppercase;padding:4px 5px;text-align:right} th:nth-child(2){text-align:left}
      td{padding:3px 5px;border-bottom:1px solid #d5dfee;text-align:right;white-space:nowrap} td:nth-child(2){text-align:left;white-space:normal} td.n{color:#4a5f7d} td.t{font-weight:700}
      tr.fam td{background:#e8eefa;font-weight:800;font-size:7.5pt;text-transform:uppercase;text-align:left} tr{page-break-inside:avoid}
      .tot{text-align:right;font-size:10pt;margin:6px 0 0} .saut{break-before:page} .gen{margin-top:12px;border-top:2px solid #0f1e33;padding-top:6px;text-align:right;font-size:12pt}
    </style></head><body><h1>Commandes valorisées — ${esc(titre)}</h1><div class="s">${esc(periode)}</div>${sections}
      ${rayons.length > 1 ? `<p class="gen">Total général : <b>${dt(general)}</b></p>` : ''}
      <script>window.onload=()=>{window.print()}</script></body></html>`)
    w.document.close()
  }

  const servis = new Set(tousRayons.map((r) => r.id))
  const onglet = (actif: boolean) => cn('inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[0.86rem] font-medium transition-colors disabled:opacity-40',
    actif ? 'border-accent/40 bg-accent/12 text-accent' : 'border-[rgb(var(--glass-edge)/0.28)] bg-white/60 text-fg-muted hover:text-fg')

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setFiltre(null)} className={onglet(filtre === null)}>
            <span className="grid size-6 place-items-center rounded-lg bg-accent text-white"><Layers className="size-3.5" /></span> Tout
          </button>
          {departements.map((d) => (
            <button key={d.id} type="button" onClick={() => setFiltre(d.id)} disabled={!servis.has(d.id)} className={onglet(filtre === d.id)}>
              <span className="grid size-6 place-items-center rounded-lg text-white" style={{ background: d.couleur }}><Icon name={d.icon ?? 'Building2'} className="size-3.5" /></span>
              {d.nom}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un article…" className="field h-11 w-full pl-10" />
        </div>
      </div>
      {rayons.length === 0 ? (
        <GlassCard className="p-6 text-center text-[0.9rem] text-fg-muted">
          {tousRayons.length === 0 ? 'Aucune commande servie sur cette journée : choisissez une autre date.' : 'Aucun article ne correspond.'}
        </GlassCard>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={imprimer} disabled={rayons.length === 0}
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-b from-[#4f6ef7] to-[#3b4fd8] px-5 text-[1rem] font-bold text-white shadow-[0_10px_24px_-10px_rgb(59_79_216/0.8)] hover:brightness-110">
          <Printer className="size-5" /> Imprimer
        </button>
        <span className="rounded-xl bg-ok/12 px-4 py-2.5 text-[1rem] font-bold text-ok">
          {rayons.length > 1 ? 'Total général' : 'Total'} : {dt(general)}
        </span>
        {sansPrix > 0 ? (
          <Link href="/admin/prix" className="inline-flex items-center gap-1.5 rounded-xl bg-warn/12 px-3 py-2 text-[0.82rem] font-semibold text-warn hover:underline">
            <AlertTriangle className="size-4" /> {sansPrix} article(s) servi(s) sans Prix U — les compléter
          </Link>
        ) : null}
      </div>

      {rayons.map((r) => (
        <GlassCard key={r.id} overflowVisible>
          <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5"
            style={{ background: `linear-gradient(120deg, ${r.couleur}1f, transparent 70%)` }}>
            <p className="flex items-center gap-2 text-[1.05rem] font-bold text-fg">
              <span className="size-3 rounded-[4px]" style={{ background: r.couleur }} /> {r.nom}
              <span className="text-[0.78rem] font-medium text-fg-subtle">{r.lignes.length} articles</span>
            </p>
            <Link href={`/admin/prix?dep=${r.id}`} className="text-[0.78rem] font-semibold text-accent hover:underline">Modifier les prix</Link>
          </div>
          <TableWrap minWidth="52rem">
            <thead>
              <tr>
                <Th className="w-10 text-right">#</Th>
                <Th className="w-full">Article</Th>
                <Th className="text-right">Stock fixe</Th>
                <Th className="text-right">Restant</Th>
                <Th className="text-right">Commande</Th>
                <Th className="text-right">Servi</Th>
                <Th className="text-right">Prix U</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
              {r.lignes.map((l, i) => (
                <React.Fragment key={l.id}>
                  {i === 0 || r.lignes[i - 1].famille !== l.famille ? (
                    <FamilyBand name={l.famille} count={r.lignes.filter((x) => x.famille === l.famille).length} colSpan={8} />
                  ) : null}
                  <tr>
                    <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{i + 1}</Td>
                    <Td className="max-w-0">
                      <p className="truncate text-[0.85rem] font-medium text-fg">{l.nom}</p>
                      <p className="font-mono text-[0.7rem] text-fg-subtle">{l.reference}</p>
                    </Td>
                    <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">{formatQty(l.fixe)} {l.unite}</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums text-info">{l.restant === null ? '—' : `${formatQty(l.restant)} ${l.unite}`}</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">{formatQty(l.commande)} {l.unite}</Td>
                    <Td className="whitespace-nowrap text-right font-semibold tabular-nums text-ok">{formatQty(l.servi)} {l.unite}</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">{l.prix === null ? <span className="text-warn">—</span> : dt(l.prix)}</Td>
                    <Td className="whitespace-nowrap text-right font-bold tabular-nums text-fg">{l.prix === null ? '—' : dt(totalLigne(l))}</Td>
                  </tr>
                </React.Fragment>
              ))}
              <tr className="bg-[rgb(var(--glass-edge)/0.1)]">
                <Td colSpan={7} className="text-right text-[0.9rem] font-bold uppercase tracking-wide text-fg-muted">Total {r.nom}</Td>
                <Td className="whitespace-nowrap text-right text-[1rem] font-extrabold tabular-nums text-ok">{dt(totalRayon(r))}</Td>
              </tr>
            </tbody>
          </TableWrap>
        </GlassCard>
      ))}
    </div>
  )
}
