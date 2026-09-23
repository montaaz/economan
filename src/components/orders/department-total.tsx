'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export type DeptTotal = {
  department: { id: string; name: string; color: string; icon: string | null }
  orderCount: number
  lineCount: number
  totalAsked: number
  totalServed: number
}

/**
 * Sous-total d'un département, sous ses tickets du jour.
 *
 * Cliquable : les cartes montrent les tickets un par un, ce bloc mène à ce
 * que le département a commandé en tout — un même article revenant sur
 * plusieurs tickets y est cumulé. Une page plutôt qu'une fenêtre : cent
 * lignes ne se lisent pas dans un cadre, et il faut pouvoir les imprimer.
 */
export function DepartmentTotal({
  group, day, dayTo,
}: {
  group: DeptTotal
  day: string
  /** Borne de fin si l'écran affiche une période. */
  dayTo?: string | null
}) {
  const part = group.totalAsked > 0
    ? Math.min(100, Math.round((group.totalServed / group.totalAsked) * 100))
    : 0
  const href = `/economat/articles?dep=${group.department.id}&jour=${day}${dayTo ? `&jusquau=${dayTo}` : ''}`

  return (
    // Pied du bloc département : il en fait partie, d'où l'absence de carte
    // propre — une carte de plus aurait rompu l'unité du panneau.
    <Link
      href={href}
      className="flex w-full flex-wrap items-center justify-between gap-3 border-t px-3.5 py-3 text-left transition-colors sm:px-4"
      style={{
        borderColor: `${group.department.color}26`,
        background: `linear-gradient(120deg, ${group.department.color}14, transparent 70%)`,
      }}
      aria-label={`Détail des articles de ${group.department.name}`}
    >
      <div className="min-w-0">
        <p className="text-[0.8rem] font-semibold uppercase tracking-wide text-fg-muted sm:text-[0.74rem]">
          Total {group.department.name}
        </p>
        <p className="mt-1 flex items-center gap-1 text-[0.9rem] font-semibold text-accent sm:text-[0.82rem]">
          Voir les articles cumulés
          <ChevronRight className="size-3.5" />
        </p>
      </div>

      {/* La part servie remplace les deux totaux : additionner des kilos,
          des litres et des unités ne donnait aucune grandeur réelle, alors
          qu'un rapport entre les deux reste juste. */}
      <div className="text-right">
        <p className="text-[0.74rem] font-medium uppercase tracking-wide text-fg-subtle sm:text-[0.7rem]">
          Servi
        </p>
        <p className="text-[1.4rem] font-bold leading-none tabular-nums text-ok sm:text-[1.3rem]">
          {part}<span className="text-[0.9rem] text-fg-subtle">%</span>
        </p>
      </div>
    </Link>
  )
}
