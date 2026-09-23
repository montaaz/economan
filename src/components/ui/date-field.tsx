'use client'

import * as React from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Champ date aux couleurs de l'application.
 *
 * `<input type="date">` s'affiche dans le format du navigateur : un poste
 * réglé en anglais montre « 09/22/2026 » là où la salle lit des jours avant
 * des mois, et aucun réglage de la page n'y change rien. Son calendrier est
 * celui du système, étranger au reste de l'écran.
 *
 * Ce champ affiche donc la date en JJ/MM/AAAA et ouvre son propre calendrier.
 * La valeur échangée reste `AAAA-MM-JJ`, comme partout ailleurs.
 */

const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

/** `AAAA-MM-JJ` vers une date locale à midi — à l'abri des fuseaux. */
function parse(v: string | null): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const [y, m, d] = v.split('-').map(Number)
  const date = new Date(y, m - 1, d, 12)
  return Number.isNaN(date.getTime()) ? null : date
}

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** JJ/MM/AAAA — l'ordre qu'on lit en salle. */
function toDisplay(v: string | null): string {
  const d = parse(v)
  return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : ''
}

/** Les cases du mois, lundi en tête, six semaines pleines. */
function grille(mois: Date): (Date | null)[] {
  const premier = new Date(mois.getFullYear(), mois.getMonth(), 1, 12)
  // getDay() rend 0 pour dimanche ; la semaine commence ici le lundi.
  const decalage = (premier.getDay() + 6) % 7
  const jours = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate()
  const cases: (Date | null)[] = Array(decalage).fill(null)
  for (let j = 1; j <= jours; j += 1) {
    cases.push(new Date(mois.getFullYear(), mois.getMonth(), j, 12))
  }
  while (cases.length % 7 !== 0) cases.push(null)
  return cases
}

export function DateField({
  value, onChange, min, max, label, clearable, className, id, marques,
}: {
  /** Valeur au format `AAAA-MM-JJ`, ou null si le champ est vide. */
  value: string | null
  onChange: (v: string | null) => void
  min?: string | null
  max?: string | null
  /** Intitulé accessible, quand le champ n'en porte pas déjà un. */
  label?: string
  /** Permet de revenir à « aucune date ». */
  clearable?: boolean
  className?: string
  id?: string
  /** Journées à signaler d'un point (celles qui portent des commandes), en `AAAA-MM-JJ`. */
  marques?: string[]
}) {
  const [ouvert, setOuvert] = React.useState(false)
  const marquees = React.useMemo(() => new Set(marques ?? []), [marques])
  const [mois, setMois] = React.useState(() => parse(value) ?? new Date())
  const boite = React.useRef<HTMLDivElement>(null)

  const choisi = parse(value)
  const borneMin = parse(min ?? null)
  const borneMax = parse(max ?? null)

  // Le calendrier s'ouvre sur le mois de la valeur : rouvrir le champ après
  // avoir changé de date doit montrer cette date, pas le mois courant.
  React.useEffect(() => {
    if (ouvert) setMois(parse(value) ?? new Date())
  }, [ouvert, value])

  // Cliquer ailleurs referme : un calendrier qui reste ouvert masque le
  // tableau qu'on vient consulter.
  React.useEffect(() => {
    if (!ouvert) return
    const auClic = (e: MouseEvent) => {
      if (!boite.current?.contains(e.target as Node)) setOuvert(false)
    }
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(false)
    }
    document.addEventListener('mousedown', auClic)
    document.addEventListener('keydown', auClavier)
    return () => {
      document.removeEventListener('mousedown', auClic)
      document.removeEventListener('keydown', auClavier)
    }
  }, [ouvert])

  const horsBornes = (d: Date) => {
    if (borneMin && toKey(d) < toKey(borneMin)) return true
    if (borneMax && toKey(d) > toKey(borneMax)) return true
    return false
  }

  const aujourdhui = toKey(new Date())
  const cases = grille(mois)

  return (
    <div ref={boite} className={cn('relative inline-block', className)}>
      <button
        id={id}
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-label={label ?? 'Choisir une date'}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        className={cn(
          'field inline-flex h-10 items-center gap-2 px-3 text-[0.85rem] tabular-nums transition-colors',
          ouvert && 'border-accent/50 ring-2 ring-accent/18',
        )}
      >
        <CalendarDays className="size-4 shrink-0 text-fg-subtle" />
        <span className={cn('font-medium', choisi ? 'text-fg' : 'text-fg-subtle')}>
          {toDisplay(value) || 'JJ/MM/AAAA'}
        </span>
      </button>

      {/* Effacer sans rouvrir le calendrier : sur une borne facultative,
          revenir à « aucune date » est un geste courant. */}
      {clearable && value ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Effacer la date"
          className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-[rgb(var(--glass-edge)/0.18)] hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      ) : null}

      {ouvert ? (
        <div
          role="dialog"
          aria-label="Calendrier"
          className="animate-rise glass-deep absolute left-0 top-[calc(100%+0.4rem)] z-50 w-[19rem] rounded-2xl border border-[rgb(var(--glass-edge)/0.28)] p-3 shadow-[0_18px_40px_-16px_rgb(var(--shadow-ambient)/0.55)]"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() - 1, 1, 12))}
              aria-label="Mois précédent"
              className="grid size-8 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-[rgb(var(--glass-edge)/0.18)] hover:text-fg"
            >
              <ChevronLeft className="size-4" />
            </button>
            <p className="text-[0.88rem] font-bold capitalize text-fg">
              {MOIS[mois.getMonth()]} {mois.getFullYear()}
            </p>
            <button
              type="button"
              onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() + 1, 1, 12))}
              aria-label="Mois suivant"
              className="grid size-8 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-[rgb(var(--glass-edge)/0.18)] hover:text-fg"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {JOURS.map((j, i) => (
              <span
                key={i}
                className="grid h-7 place-items-center text-[0.68rem] font-bold uppercase tracking-wider text-fg-subtle"
              >
                {j}
              </span>
            ))}
            {cases.map((d, i) => {
              if (!d) return <span key={`v${i}`} />
              const cle = toKey(d)
              const actif = value === cle
              const bloque = horsBornes(d)
              return (
                <button
                  key={cle}
                  type="button"
                  disabled={bloque}
                  onClick={() => {
                    onChange(cle)
                    setOuvert(false)
                  }}
                  className={cn(
                    'relative grid h-9 place-items-center rounded-lg text-[0.82rem] font-medium tabular-nums transition-colors',
                    actif && 'bg-accent font-bold text-white',
                    !actif && !bloque && 'text-fg hover:bg-accent/12 hover:text-accent',
                    // Aujourd'hui reste repérable même sans être choisi.
                    !actif && !bloque && cle === aujourdhui && 'ring-1 ring-accent/45',
                    bloque && 'cursor-not-allowed text-fg-subtle/45',
                  )}
                >
                  {d.getDate()}
                  {marquees.has(cle) ? (
                    <span aria-hidden className={cn('absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full', actif ? 'bg-white' : 'bg-accent')} />
                  ) : null}
                </button>
              )
            })}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-[rgb(var(--glass-edge)/0.16)] pt-2">
            <button
              type="button"
              onClick={() => {
                const d = new Date()
                if (horsBornes(d)) return
                onChange(toKey(d))
                setOuvert(false)
              }}
              className="rounded-lg px-2 py-1 text-[0.8rem] font-semibold text-accent transition-colors hover:bg-accent/12"
            >
              Aujourd’hui
            </button>
            <button
              type="button"
              onClick={() => setOuvert(false)}
              className="rounded-lg px-2 py-1 text-[0.8rem] font-medium text-fg-muted transition-colors hover:bg-[rgb(var(--glass-edge)/0.18)] hover:text-fg"
            >
              Fermer
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
