'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { DateField } from '@/components/ui/date-field'
import { CalendarRange, X } from 'lucide-react'

/**
 * Sélecteur de journée ou de période.
 *
 * Le menu déroulant ne listait que les jours ayant des commandes, ce qui
 * convient pour consulter une journée mais interdit toute comparaison. Le
 * bouton « Période » ouvre une seconde borne et l'écran cumule alors tous les
 * tickets de l'intervalle.
 *
 * Les deux bornes s'ouvrent dans le calendrier de l'application, le même
 * que partout ailleurs ; les journées qui portent des commandes y sont
 * marquées d'un point, pour qu'on les retrouve sans les deviner.
 */
export function DayPicker({
  days, current, currentTo, basePath, keep,
}: {
  days: string[]
  current: string
  /** Borne de fin si une période est active. */
  currentTo?: string | null
  basePath: string
  /** Département filtré, à conserver d'une date à l'autre. */
  keep?: string | null
}) {
  const router = useRouter()

  const [range, setRange] = React.useState(Boolean(currentTo))

  function go(from: string, to?: string | null) {
    const p = new URLSearchParams({ jour: from })
    if (to) p.set('jusquau', to)
    // Changer de date ne doit pas annuler le filtre par département : on
    // consulte souvent le même service sur plusieurs journées.
    if (keep) p.set('dep', keep)
    router.push(`${basePath}?${p}`)
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex min-w-0 items-center gap-2">
        <label className="inline-flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
          <span className="sr-only">{range ? 'Du' : 'Journée'}</span>
          {range ? (
            <span className="shrink-0 text-[0.85rem] font-medium text-fg-muted">Du</span>
          ) : null}
          <DateField
            value={current}
            onChange={(v) => { if (v) go(v, currentTo) }}
            marques={days}
            label={range ? 'Du' : 'Journée'}
            className="min-w-0 flex-1 sm:flex-none"
          />
        </label>

        {/* Le bouton reste sur la première ligne : il ferme la période, il n'en
            fait pas partie. */}
        {range ? (
          <button
            type="button"
            onClick={() => {
              setRange(false)
              go(current, null)
            }}
            aria-label="Revenir à une seule journée"
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-[rgb(var(--glass-edge)/0.34)] bg-white/60 px-3 text-[0.85rem] font-medium text-fg-muted transition-colors hover:bg-white/85 hover:text-fg"
          >
            <X className="size-4" />
            <span className="hidden lg:inline">Un seul jour</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setRange(true)
              // La période démarre sur la journée affichée : ouvrir sur un
              // intervalle vide obligerait à choisir deux dates avant de voir
              // quoi que ce soit.
              go(current, current)
            }}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-accent/30 bg-accent/10 px-3 text-[0.85rem] font-semibold text-accent transition-colors hover:bg-accent/16"
          >
            <CalendarRange className="size-4" />
            Période
          </button>
        )}
      </div>

      {range ? (
        <label className="inline-flex min-w-0 items-center gap-2">
          <span className="sr-only">Jusqu’au</span>
          <span className="w-4 shrink-0 text-[0.85rem] font-medium text-fg-muted sm:w-auto">au</span>
          <DateField
            value={currentTo ?? current}
            min={current}
            onChange={(v) => { if (v) go(current, v) }}
            marques={days}
            label="Jusqu’au"
            className="min-w-0 flex-1 sm:flex-none"
          />
        </label>
      ) : null}
    </div>
  )
}
