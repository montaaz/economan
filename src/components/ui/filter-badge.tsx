'use client'

import * as React from 'react'
import { Check, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Compteur qui filtre un tableau sur les lignes qu'il dénombre.
 *
 * Il a l'apparence d'un badge mais le comportement d'un interrupteur : il ne
 * change rien aux données, il restreint seulement ce qui est affiché.
 * Compter trois ruptures sans pouvoir les montrer laissait l'essentiel du
 * travail — les retrouver parmi cent lignes — à la charge du lecteur.
 */
export function FilterBadge({
  tone, actif, onClick, label, children,
}: {
  tone: 'danger' | 'warn'
  actif: boolean
  onClick: () => void
  /** Ce que le bouton fait, pour les lecteurs d'écran et l'infobulle. */
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5',
        'text-[0.8rem] font-medium leading-5 tracking-tight sm:text-[0.72rem]',
        'cursor-pointer transition-colors',
        tone === 'danger'
          ? 'border-danger/30 bg-danger/12 text-danger hover:bg-danger/20'
          : 'border-warn/30 bg-warn/14 text-warn hover:bg-warn/24',
        // Le filtre actif se voit : sinon rien ne dirait pourquoi la liste
        // s'est raccourcie.
        actif && (tone === 'danger'
          ? 'bg-danger/25 ring-2 ring-danger/40'
          : 'bg-warn/28 ring-2 ring-warn/40'),
      )}
    >
      {children}
      {actif ? <Check className="size-3.5" /> : <ChevronRight className="size-3.5" />}
    </button>
  )
}

/** Retour à la liste entière, affiché seulement quand un filtre est posé. */
export function FilterReset({ total, onClick }: { total: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--glass-edge)/0.3)] px-2 py-0.5 text-[0.8rem] font-medium leading-5 text-fg-muted transition-colors hover:bg-[rgb(var(--glass-edge)/0.14)] sm:text-[0.72rem]"
    >
      <X className="size-3.5" />
      Afficher les {total} articles
    </button>
  )
}
