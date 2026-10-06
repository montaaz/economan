'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { correspond, normaliser } from '@/lib/search'

export type ComboOption = {
  value: string
  label: string
  /** Le groupe de l'option (la famille d'un plat) : un intertitre dans la liste. */
  group?: string
  /** Un détail sous le libellé (les départements d'une famille). */
  meta?: React.ReactNode
  /** Mots cherchés en plus du libellé et du groupe. */
  keywords?: string
}

/**
 * Une liste déroulante moderne, à la place du `<select>` du navigateur.
 *
 * Le menu natif s'ouvrait en grand rectangle gris, sans recherche, sur
 * trente familles de carte. Celle-ci s'ouvre sous le champ dans une
 * carte arrondie : une recherche en tête, les options groupées, une coche
 * sur la valeur choisie. Flèches, Entrée et Échap au clavier — Échap ne
 * ferme que la liste, pas la boîte de dialogue qui la contient.
 *
 * Elle flotte hors de son conteneur (portal, position fixe) pour ne pas se
 * faire couper par une boîte de dialogue, et passe au-dessus du champ s'il
 * manque de place en bas.
 */
export function ComboSelect({
  value, onChange, options, placeholder = 'Choisir…', label, className, searchPlaceholder = 'Rechercher…',
}: {
  value: string
  onChange: (v: string) => void
  options: ComboOption[]
  placeholder?: string
  /** Intitulé accessible du champ. */
  label?: string
  className?: string
  searchPlaceholder?: string
}) {
  const [ouvert, setOuvert] = React.useState(false)
  const [recherche, setRecherche] = React.useState('')
  const [actif, setActif] = React.useState(0)
  const bouton = React.useRef<HTMLButtonElement>(null)
  const panneau = React.useRef<HTMLDivElement>(null)
  const liste = React.useRef<HTMLDivElement>(null)
  const id = React.useId()

  const choisie = options.find((o) => o.value === value) ?? null
  const mot = normaliser(recherche.trim())
  const visibles = options.filter((o) => correspond(mot, o.label, o.group, o.keywords))

  // Position : sous le champ, ou au-dessus s'il manque de place.
  const [pos, setPos] = React.useState<{ left: number; width: number; top?: number; bottom?: number; max: number } | null>(null)
  React.useLayoutEffect(() => {
    if (!ouvert) return
    const maj = () => {
      const r = bouton.current?.getBoundingClientRect(); if (!r) return
      const width = Math.max(r.width, 256)
      let left = r.left
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - width)
      const enBas = window.innerHeight - r.bottom - 12, enHaut = r.top - 12
      if (enBas < 260 && enHaut > enBas) setPos({ left, width, bottom: window.innerHeight - r.top + 6, max: Math.min(380, enHaut) })
      else setPos({ left, width, top: r.bottom + 6, max: Math.min(380, enBas) })
    }
    maj()
    window.addEventListener('scroll', maj, true); window.addEventListener('resize', maj)
    return () => { window.removeEventListener('scroll', maj, true); window.removeEventListener('resize', maj) }
  }, [ouvert])

  // Cliquer ailleurs referme.
  React.useEffect(() => {
    if (!ouvert) return
    const auClic = (e: MouseEvent) => {
      const t = e.target as Node
      if (!bouton.current?.contains(t) && !panneau.current?.contains(t)) setOuvert(false)
    }
    document.addEventListener('mousedown', auClic)
    return () => document.removeEventListener('mousedown', auClic)
  }, [ouvert])

  // L'option active reste visible quand on la déplace au clavier.
  React.useEffect(() => {
    if (!ouvert) return
    liste.current?.querySelector<HTMLElement>(`[data-index="${actif}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [actif, ouvert])

  const ouvrir = () => {
    setRecherche('')
    const i = options.findIndex((o) => o.value === value)
    setActif(i >= 0 ? i : 0)
    setOuvert(true)
  }
  const fermer = () => { setOuvert(false); bouton.current?.focus() }
  const choisir = (o: ComboOption) => { onChange(o.value); fermer() }

  const clavier = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Seule la liste se ferme : la boîte de dialogue écoute aussi Échap.
      e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation()
      fermer()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault(); setActif((i) => Math.min(visibles.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setActif((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const o = visibles[actif]; if (o) choisir(o)
    }
  }

  return (
    <>
      <button
        ref={bouton}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        aria-controls={id}
        aria-label={label}
        onClick={() => (ouvert ? setOuvert(false) : ouvrir())}
        onKeyDown={(e) => { if (!ouvert && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ouvrir() } }}
        className={cn(
          'field flex h-11 w-full items-center gap-2 px-3 text-left text-[0.9rem] transition-shadow',
          ouvert && 'ring-2 ring-accent/35',
          className,
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', choisie ? 'font-semibold text-fg' : 'text-fg-subtle')}>
          {choisie ? choisie.label : placeholder}
        </span>
        {choisie?.group ? <span className="hidden shrink-0 truncate text-[0.75rem] text-fg-muted sm:inline">{choisie.group}</span> : null}
        <ChevronDown className={cn('size-4 shrink-0 text-fg-muted transition-transform', ouvert && 'rotate-180')} />
      </button>

      {ouvert && pos ? createPortal(
        <div
          ref={panneau}
          onKeyDown={clavier}
          className="fixed z-[70] flex flex-col overflow-hidden rounded-2xl border border-[rgb(var(--glass-edge)/0.3)] bg-white shadow-[0_18px_48px_-12px_rgb(15_30_51/0.35)]"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.max }}
        >
          <div className="relative border-b border-[rgb(var(--glass-edge)/0.18)] p-2">
            <Search className="pointer-events-none absolute left-4.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <input
              autoFocus
              value={recherche}
              onChange={(e) => { setRecherche(e.target.value); setActif(0) }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              aria-controls={id}
              className="h-10 w-full rounded-xl bg-[rgb(var(--glass-edge)/0.1)] pl-9 pr-3 text-[0.88rem] text-fg outline-none placeholder:text-fg-subtle focus:bg-[rgb(var(--glass-edge)/0.16)]"
            />
          </div>
          <div ref={liste} id={id} role="listbox" aria-label={label} className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {visibles.length === 0 ? (
              <p className="px-3 py-6 text-center text-[0.84rem] text-fg-muted">Aucun résultat pour « {recherche} ».</p>
            ) : visibles.map((o, i) => {
              const titre = o.group && (i === 0 || visibles[i - 1].group !== o.group)
              const selectionnee = o.value === value
              return (
                <React.Fragment key={o.value}>
                  {titre ? (
                    <p className="px-3 pb-1 pt-2.5 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-fg-subtle">{o.group}</p>
                  ) : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectionnee}
                    data-index={i}
                    onMouseEnter={() => setActif(i)}
                    onClick={() => choisir(o)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[0.88rem] transition-colors',
                      i === actif ? 'bg-accent/10 text-fg' : 'text-fg',
                      selectionnee && 'font-semibold text-accent',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{o.label}</span>
                      {o.meta ? <span className="mt-0.5 block font-normal">{o.meta}</span> : null}
                    </span>
                    {selectionnee ? <Check className="size-4 shrink-0 text-accent" /> : null}
                  </button>
                </React.Fragment>
              )
            })}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  )
}
