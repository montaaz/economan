'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Les couleurs des jeux, les mêmes que sur la page Stock fixe. */
const COULEURS: Record<number, { fond: string; encre: string; doux: string }> = {
  1: { fond: '#3b82f6', encre: '#1d4ed8', doux: '#eff6ff' },
  2: { fond: '#8b5cf6', encre: '#6d28d9', doux: '#f5f3ff' },
  3: { fond: '#f59e0b', encre: '#b45309', doux: '#fffbeb' },
}

/**
 * Le choix de la colonne Fixe : le stock fixe de la journée, ou l'un des
 * trois jeux. Une carte qui flotte hors du tableau (sans être coupée par
 * son défilement), un jeu par ligne, à sa couleur.
 */
export function ChoixFixe({ valeur, actif, onChange }: {
  valeur: 0 | 1 | 2 | 3
  /** Le jeu en service. */
  actif?: number
  onChange: (v: 0 | 1 | 2 | 3) => void
}) {
  const [ouvert, setOuvert] = React.useState(false)
  const bouton = React.useRef<HTMLButtonElement>(null)
  const carte = React.useRef<HTMLDivElement>(null)
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null)

  React.useLayoutEffect(() => {
    if (!ouvert) return
    const maj = () => {
      const r = bouton.current?.getBoundingClientRect(); if (!r) return
      setPos({ top: r.bottom + 6, left: Math.min(Math.max(8, r.left + r.width / 2 - 120), window.innerWidth - 248) })
    }
    maj()
    window.addEventListener('scroll', maj, true); window.addEventListener('resize', maj)
    return () => { window.removeEventListener('scroll', maj, true); window.removeEventListener('resize', maj) }
  }, [ouvert])
  React.useEffect(() => {
    if (!ouvert) return
    const clic = (e: MouseEvent) => { const t = e.target as Node; if (!bouton.current?.contains(t) && !carte.current?.contains(t)) setOuvert(false) }
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false) }
    document.addEventListener('mousedown', clic); document.addEventListener('keydown', echap)
    return () => { document.removeEventListener('mousedown', clic); document.removeEventListener('keydown', echap) }
  }, [ouvert])

  const c = valeur ? COULEURS[valeur] : null
  const choisir = (v: 0 | 1 | 2 | 3) => { onChange(v); setOuvert(false) }
  const ligne = (v: 0 | 1 | 2 | 3, titre: string, sous: string, pastille: React.ReactNode) => (
    <button key={v} type="button" role="option" aria-selected={valeur === v} onClick={() => choisir(v)}
      className={cn('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-[rgb(var(--glass-edge)/0.12)]', valeur === v && 'bg-[rgb(var(--glass-edge)/0.12)]')}>
      {pastille}
      <span className="min-w-0 flex-1">
        <span className="block text-[0.86rem] font-bold normal-case tracking-normal text-fg">{titre}</span>
        <span className="block text-[0.72rem] font-medium normal-case tracking-normal text-fg-subtle">{sous}</span>
      </span>
      {valeur === v ? <Check className="size-4 shrink-0 text-accent" /> : null}
    </button>
  )

  return (
    <>
      <button ref={bouton} type="button" onClick={() => setOuvert((o) => !o)} aria-haspopup="listbox" aria-expanded={ouvert}
        aria-label="Quel stock fixe afficher"
        className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.72rem] font-bold uppercase tracking-wider transition-[box-shadow,filter] hover:brightness-105',
          c ? 'text-white shadow-sm' : 'bg-white text-fg-muted ring-1 ring-[rgb(var(--glass-edge)/0.4)] hover:ring-accent/50')}
        style={c ? { background: c.fond } : undefined}>
        {valeur ? `Fixe ${valeur}` : 'Fixe'}
        <ChevronDown className={cn('size-3.5 transition-transform', ouvert && 'rotate-180')} />
      </button>
      {ouvert && pos ? createPortal(
        <div ref={carte} role="listbox" aria-label="Stock fixe affiché"
          className="fixed z-[70] w-60 rounded-2xl border border-[rgb(var(--glass-edge)/0.3)] bg-white p-1.5 shadow-[0_18px_48px_-12px_rgb(15_30_51/0.35)]"
          style={{ top: pos.top, left: pos.left }}>
          <p className="px-2.5 pb-1 pt-1.5 text-[0.66rem] font-bold uppercase tracking-[0.1em] text-fg-subtle">Colonne Fixe</p>
          {ligne(0, 'Fixe de la journée', 'Celui de la commande du jour',
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[rgb(var(--glass-edge)/0.18)] text-fg-muted"><CalendarDays className="size-4" /></span>)}
          <div className="my-1 h-px bg-[rgb(var(--glass-edge)/0.2)]" />
          {([1, 2, 3] as const).map((j) => ligne(j, `Stock fixe ${j}`, j === actif ? 'En service' : 'En réserve',
            <span className="grid size-8 shrink-0 place-items-center rounded-lg text-[0.95rem] font-extrabold text-white" style={{ background: COULEURS[j].fond }}>{j}</span>))}
        </div>,
        document.body,
      ) : null}
    </>
  )
}
