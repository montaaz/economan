'use client'

import { useRouter } from 'next/navigation'
import { DateField } from '@/components/ui/date-field'
import { formatLongDate } from '@/lib/utils'

/**
 * Choix d'une journée unique.
 *
 * Le `DayPicker` liste les journées ayant des commandes ; ici on saisit un Z
 * qui n'existe pas encore, donc aucune liste ne peut le proposer. Un champ
 * date libre convient, borné à la journée de service en cours — on ne saisit
 * pas la caisse d'un service qui n'a pas eu lieu.
 */
export function DayInput({
  value, basePath, label = 'Journée', param = 'jour', max,
}: {
  value: string
  basePath: string
  label?: string
  param?: string
  /** Dernière journée saisissable, en `AAAA-MM-JJ`. */
  max?: string | null
}) {
  const router = useRouter()

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="shrink-0 text-[0.85rem] font-medium text-fg-muted">{label}</span>
      <DateField
        value={value}
        max={max}
        label={label}
        onChange={(v) => router.push(v ? `${basePath}?${param}=${v}` : basePath)}
      />
      {/* La date en toutes lettres lève le doute sur le jour de la semaine,
          que « 22/09 » seul ne dit pas. */}
      <span className="shrink-0 text-[0.85rem] font-semibold capitalize text-fg">
        {formatLongDate(value)}
      </span>
    </div>
  )
}
