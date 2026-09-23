'use client'

import * as React from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Le champ de recherche des tableaux d'articles.
 *
 * Le même partout — même place dans l'œil, même geste — pour qu'on n'ait pas
 * à le chercher d'un écran à l'autre. Il filtre au fil de la frappe, et la
 * croix rend la liste entière d'un clic.
 */
export function SearchField({
  value, onChange, placeholder = 'Rechercher un article…', className, autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}) {
  return (
    <label className={cn('no-print relative block min-w-0', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        className="field h-10 w-full pl-9 pr-9 text-[0.85rem]"
      />
      {value !== '' ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Effacer la recherche"
          className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-[rgb(var(--glass-edge)/0.18)] hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </label>
  )
}
