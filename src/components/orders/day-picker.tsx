'use client'

import { useRouter } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { formatLongDate } from '@/lib/utils'

/** Sélecteur de journée : ne liste que les jours ayant des commandes. */
export function DayPicker({
  days, current, basePath,
}: {
  days: string[]
  current: string
  basePath: string
}) {
  const router = useRouter()
  // La journée courante peut n'avoir aucune commande : elle doit rester
  // sélectionnable, sinon le menu afficherait une autre date que l'écran.
  const options = days.includes(current) ? days : [current, ...days]

  return (
    <label className="inline-flex items-center gap-2">
      <span className="sr-only">Journée</span>
      <CalendarDays className="size-4 shrink-0 text-fg-subtle" />
      <select
        value={current}
        onChange={(e) => router.push(`${basePath}?jour=${e.target.value}`)}
        className="field h-10 w-auto min-w-[13rem] py-0 text-[0.85rem] capitalize"
      >
        {options.map((d) => (
          <option key={d} value={d}>
            {formatLongDate(d)}
          </option>
        ))}
      </select>
    </label>
  )
}
