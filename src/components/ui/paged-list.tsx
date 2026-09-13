'use client'

import * as React from 'react'
import { Button } from '@/components/ui/glass'

/**
 * Limite le nombre de lignes rendues d'un coup.
 *
 * Le catalogue fait ~550 articles : tout rendre donne une page de plusieurs
 * dizaines de milliers de pixels, injouable sur téléphone. La recherche et les
 * filtres portent toujours sur la liste entière — seule la tranche visible est
 * limitée.
 */
export function usePagedRows<T>(rows: T[], step = 40) {
  // Un nouveau filtre doit repartir du haut. En mémorisant la liste à laquelle
  // la limite se rapporte, la remise à zéro se déduit pendant le rendu — pas
  // d'effet, donc le premier paint montre déjà la bonne tranche.
  const [state, setState] = React.useState<{ rows: T[]; limit: number }>({ rows, limit: step })
  if (state.rows !== rows) setState({ rows, limit: step })
  const limit = state.rows === rows ? state.limit : step

  const setLimit = (next: (n: number) => number) =>
    setState((s) => ({ rows, limit: next(s.rows === rows ? s.limit : step) }))

  return {
    shown: rows.slice(0, limit),
    hasMore: rows.length > limit,
    remaining: Math.max(0, rows.length - limit),
    showMore: () => setLimit((n) => n + step),
    showAll: () => setLimit(() => rows.length),
    total: rows.length,
    limit,
  }
}

export function ShowMore({
  remaining, onMore, onAll, shown, total,
}: {
  remaining: number
  onMore: () => void
  onAll: () => void
  shown: number
  total: number
}) {
  if (remaining <= 0) return null
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-2 border-t border-[rgb(var(--glass-edge)/0.14)] px-3.5 py-3">
      <p className="text-[0.78rem] tabular-nums text-fg-muted">
        {shown} sur {total} affichés
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={onMore}>Afficher 40 de plus</Button>
        <Button size="sm" variant="ghost" onClick={onAll}>Tout ({remaining})</Button>
      </div>
    </div>
  )
}
