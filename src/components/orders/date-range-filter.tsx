'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { DateField } from '@/components/ui/date-field'

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
  from, to, basePath, first, last, keep, clearParams,
}: {
  /** Bornes actives, au format ISO `AAAA-MM-JJ`. */
  from: string | null
  to: string | null
  basePath: string
  /** Première et dernière journée ayant des commandes, s'il y en a. */
  first?: string | null
  last?: string | null
  /** Paramètres à conserver dans l'URL (la vue, un filtre) : le chemin reste propre. */
  keep?: Record<string, string | undefined>
  /** Paramètres ajoutés quand on efface les dates : dire « tout », pas « rien ». */
  clearParams?: Record<string, string>
}) {
  const router = useRouter()

  function go(d: string | null, f: string | null) {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(keep ?? {})) if (v) p.set(k, v)
    if (d) p.set('du', d)
    if (f) p.set('au', f)
    if (!d && !f) for (const [k, v] of Object.entries(clearParams ?? {})) p.set(k, v)
    router.push(p.size ? `${basePath}?${p}` : basePath)
  }

  const actif = Boolean(from || to)

  return (
    <div className="mb-4 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
      <span className="inline-flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-[0.85rem] font-medium text-fg-muted">Du</span>
        {/* Hors de l'historique, aucune date n'a de sens : le calendrier les
            grise plutôt que de laisser choisir un jour qui rendra l'écran
            vide. La borne de début ne dépasse pas non plus celle de fin. */}
        <DateField
          value={from}
          min={first}
          max={to ?? last}
          label="Borne de début"
          clearable
          onChange={(v) => go(v, to)}
        />
      </span>

      <span className="inline-flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-[0.85rem] font-medium text-fg-muted">au</span>
        <DateField
          value={to}
          min={from ?? first}
          max={last}
          label="Borne de fin"
          clearable
          onChange={(v) => go(from, v)}
        />
      </span>

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
