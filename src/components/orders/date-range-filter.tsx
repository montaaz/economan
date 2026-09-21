'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, X } from 'lucide-react'

/**
 * Bornes d'une liste d'archives.
 *
 * Le `DayPicker` des tableaux de bord choisit une journée parmi celles qui
 * portent des commandes ; ici on borne une liste qu'on parcourt, et les deux
 * bornes sont facultatives — on cherche « depuis lundi » aussi souvent que
 * « toute la semaine passée ». Des champs date libres conviennent donc mieux
 * que des menus : rien n'oblige la borne à tomber sur un jour travaillé.
 */
export function DateRangeFilter({
  from, to, basePath, first, last,
}: {
  /** Bornes actives, au format ISO `AAAA-MM-JJ`. */
  from: string | null
  to: string | null
  basePath: string
  /** Première et dernière journée ayant des commandes, s'il y en a. */
  first?: string | null
  last?: string | null
}) {
  const router = useRouter()

  function go(d: string | null, f: string | null) {
    const p = new URLSearchParams()
    if (d) p.set('du', d)
    if (f) p.set('au', f)
    router.push(p.size ? `${basePath}?${p}` : basePath)
  }

  const actif = Boolean(from || to)

  return (
    <div className="mb-4 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
      <label className="inline-flex min-w-0 items-center gap-2">
        <span className="sr-only">Du</span>
        <CalendarDays className="size-4 shrink-0 text-fg-subtle" />
        <span className="shrink-0 text-[0.85rem] font-medium text-fg-muted">Du</span>
        <input
          type="date"
          value={from ?? ''}
          // Hors de l'historique, aucune date n'a de sens : le calendrier les
          // grise plutôt que de laisser choisir un jour qui rendra l'écran
          // vide. La borne de début ne dépasse pas non plus celle de fin.
          min={first ?? undefined}
          max={to ?? last ?? undefined}
          onChange={(e) => go(e.target.value || null, to)}
          className="field h-10 w-full min-w-0 py-0 text-[0.85rem] sm:w-auto"
        />
      </label>

      <label className="inline-flex min-w-0 items-center gap-2">
        <span className="sr-only">Au</span>
        <span className="shrink-0 text-[0.85rem] font-medium text-fg-muted">au</span>
        <input
          type="date"
          value={to ?? ''}
          min={from ?? first ?? undefined}
          max={last ?? undefined}
          onChange={(e) => go(from, e.target.value || null)}
          className="field h-10 w-full min-w-0 py-0 text-[0.85rem] sm:w-auto"
        />
      </label>

      {/* Vider champ par champ marche, mais demande deux gestes et laisse
          croire qu'un filtre traîne encore. */}
      {actif ? (
        <button
          type="button"
          onClick={() => go(null, null)}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-[rgb(var(--glass-edge)/0.34)] bg-white/60 px-3 text-[0.85rem] font-medium text-fg-muted transition-colors hover:bg-white/85 hover:text-fg"
        >
          <X className="size-4" />
          Tout l’historique
        </button>
      ) : null}
    </div>
  )
}
