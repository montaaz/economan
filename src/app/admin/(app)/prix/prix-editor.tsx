'use client'

import * as React from 'react'
import { Search, Check, Loader2, AlertCircle } from 'lucide-react'
import { GlassCard, TableWrap, Th, Td } from '@/components/ui/glass'
import { FamilyBand } from '@/components/ui/family-band'
import { useToast } from '@/components/ui/toast'
import { correspond, normaliser } from '@/lib/search'
import { formatQty } from '@/lib/utils'
import { enregistrerPrix } from './actions'

type Ligne = { productId: number; nom: string; reference: string; famille: string; unite: string; fixe: number | null; prix: number | null }

/** Les prix d'une feuille : on tape, ça s'enregistre une seconde après la dernière frappe. */
export function PrixEditor({ departmentId, departmentName, lignes }: { departmentId: number; departmentName: string; lignes: Ligne[] }) {
  const { push } = useToast()
  const depart = React.useMemo(() => Object.fromEntries(lignes.map((l) => [l.productId, l.prix === null ? '' : String(l.prix)])), [lignes])
  const [valeurs, setValeurs] = React.useState<Record<number, string>>(depart)
  const enBase = React.useRef<Record<number, string>>(depart)
  const valeursRef = React.useRef(valeurs)
  React.useEffect(() => { valeursRef.current = valeurs }, [valeurs])
  const [etat, setEtat] = React.useState<'repos' | 'attente' | 'envoi' | 'ok' | 'erreur'>('repos')
  const minuteur = React.useRef<number | null>(null)
  const [recherche, setRecherche] = React.useState('')

  const envoyer = React.useCallback(async () => {
    const changes = Object.entries(valeursRef.current).filter(([id, v]) => v !== enBase.current[Number(id)])
    if (changes.length === 0) return setEtat('repos')
    setEtat('envoi')
    const r = await enregistrerPrix(departmentId, changes.map(([id, v]) => ({ productId: Number(id), prix: v === '' ? null : Number(v) })))
    if (!r.ok) { setEtat('erreur'); push('error', r.error ?? 'Enregistrement impossible.'); return }
    for (const [id, v] of changes) enBase.current[Number(id)] = v
    setEtat('ok')
  }, [departmentId, push])

  const saisir = (id: number, brut: string) => {
    const v = brut.replace(',', '.')
    if (v !== '' && !/^\d*\.?\d{0,3}$/.test(v)) return
    setValeurs((s) => ({ ...s, [id]: v }))
    setEtat('attente')
    if (minuteur.current) window.clearTimeout(minuteur.current)
    minuteur.current = window.setTimeout(() => void envoyer(), 1000)
  }

  const mot = normaliser(recherche)
  const visibles = lignes.filter((l) => correspond(mot, l.nom, l.reference, l.famille))
  const renseignes = lignes.filter((l) => (valeurs[l.productId] ?? '') !== '').length

  return (
    <GlassCard overflowVisible>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
        <div>
          <p className="text-[0.95rem] font-bold text-fg">{departmentName}</p>
          <p className="text-[0.75rem] text-fg-subtle">{renseignes} prix renseigné(s) sur {lignes.length}</p>
        </div>
        <span className="flex items-center gap-1.5 text-[0.8rem] text-fg-muted">
          {etat === 'envoi' || etat === 'attente' ? <><Loader2 className="size-4 animate-spin" /> Enregistrement…</>
            : etat === 'erreur' ? <><AlertCircle className="size-4 text-danger" /> Erreur</>
              : <><Check className="size-4 text-ok" /> À jour</>}
        </span>
      </div>
      <div className="relative border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
        <Search className="pointer-events-none absolute left-7 top-1/2 size-4 -translate-y-1/2 text-fg-subtle sm:left-8" />
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un article…" className="field h-11 w-full pl-10" />
      </div>
      <TableWrap minWidth="0">
        <thead>
          <tr>
            <Th className="w-10 text-right">#</Th>
            <Th className="w-full">Article</Th>
            <Th className="text-right">Stock fixe</Th>
            <Th className="text-right">Prix U <span className="normal-case tracking-normal text-fg-subtle">(DT)</span></Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
          {visibles.map((l, i) => (
            <React.Fragment key={l.productId}>
              {i === 0 || visibles[i - 1].famille !== l.famille ? (
                <FamilyBand name={l.famille} count={visibles.filter((x) => x.famille === l.famille).length} colSpan={4} />
              ) : null}
              <tr>
                <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{lignes.indexOf(l) + 1}</Td>
                <Td className="max-w-0">
                  <p className="truncate text-[0.85rem] font-medium text-fg">{l.nom}</p>
                  <p className="font-mono text-[0.7rem] text-fg-subtle">{l.reference}</p>
                </Td>
                <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">{l.fixe === null ? '—' : `${formatQty(l.fixe)} ${l.unite}`}</Td>
                <Td className="text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <input
                      inputMode="decimal"
                      value={valeurs[l.productId] ?? ''}
                      onChange={(e) => saisir(l.productId, e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      placeholder="0"
                      aria-label={`Prix U de ${l.nom}`}
                      className="field h-9 w-24 px-2 py-0 text-right text-[0.85rem] font-semibold tabular-nums"
                    />
                    <span className="whitespace-nowrap text-[0.75rem] text-fg-subtle">DT / {l.unite}</span>
                  </span>
                </Td>
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </TableWrap>
    </GlassCard>
  )
}
