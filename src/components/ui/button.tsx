'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

// Le bouton vit dans son propre module client : il tient un état (l'attente
// d'une écriture), et `glass.tsx`, lui, doit rester lisible depuis les
// composants serveur qui posent des cartes et des badges.

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'text-white bg-gradient-to-b from-[var(--accent-soft)] to-[var(--accent)] ' +
    'border border-[var(--accent-deep)]/45 shadow-[0_1px_0_0_rgb(255_255_255/0.5)_inset,0_8px_20px_-8px_rgb(47_127_224/0.65)] ' +
    'hover:brightness-[1.07] active:brightness-95',
  secondary:
    'text-fg bg-white/60 border border-[rgb(var(--glass-edge)/0.34)] backdrop-blur-md hover:bg-white/85',
  ghost:
    'text-fg-muted border border-transparent hover:bg-[rgb(var(--glass-edge)/0.14)] hover:text-fg',
  danger:
    'text-white bg-gradient-to-b from-[#e8657c] to-[var(--danger)] border border-[#b32e46]/45 ' +
    'shadow-[0_1px_0_0_rgb(255_255_255/0.4)_inset,0_8px_20px_-8px_rgb(214_63_90/0.6)] hover:brightness-[1.07]',
  success:
    'text-white bg-gradient-to-b from-[#2fc48f] to-[var(--ok)] border border-[#0b7a55]/45 ' +
    'shadow-[0_1px_0_0_rgb(255_255_255/0.4)_inset,0_8px_20px_-8px_rgb(15_155_108/0.6)] hover:brightness-[1.07]',
  warning:
    'text-white bg-gradient-to-b from-[#f3a850] to-[var(--warn)] border border-[#b4630f]/45 ' +
    'shadow-[0_1px_0_0_rgb(255_255_255/0.4)_inset,0_8px_20px_-8px_rgb(224_127_22/0.6)] hover:brightness-[1.07]',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[0.8rem] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-[0.875rem] gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[0.95rem] gap-2.5 rounded-xl',
  icon: 'size-10 rounded-xl',
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

/**
 * Un bouton qui attend la fin de ce qu'il déclenche.
 *
 * Deux clics sur « Bon de livraison » faisaient partir deux mutations — la
 * seconde refusée par le serveur, mais parfois après avoir créé un second
 * servi. Dès que le gestionnaire renvoie une promesse, le bouton se bloque,
 * montre son attente, et ignore tout clic jusqu'à ce qu'elle soit réglée ;
 * le `loading` posé par l'écran reste possible, il s'y ajoute.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', loading, disabled, children, onClick, ...props },
  ref,
) {
  const [pending, setPending] = React.useState(false)
  const enCours = React.useRef(false)
  const monte = React.useRef(true)
  React.useEffect(() => () => { monte.current = false }, [])

  const handleClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!onClick) return
      if (enCours.current) { e.preventDefault(); return }
      const r = (onClick as (ev: React.MouseEvent<HTMLButtonElement>) => unknown)(e)
      if (r && typeof (r as Promise<unknown>).then === 'function') {
        enCours.current = true
        setPending(true)
        void (r as Promise<unknown>).finally(() => {
          enCours.current = false
          if (monte.current) setPending(false)
        })
      }
    },
    [onClick],
  )
  const attend = Boolean(loading) || pending

  return (
    <button
      ref={ref}
      disabled={disabled || attend}
      aria-busy={attend || undefined}
      onClick={handleClick}
      className={cn(
        'relative inline-flex select-none items-center justify-center font-medium',
        'transition-[filter,background,transform,box-shadow] duration-200',
        'active:translate-y-px disabled:pointer-events-none disabled:opacity-55',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {attend ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  )
})

/**
 * La même garde pour un bouton nu (une croix, une icône) : `run` bloque les
 * appels concurrents et dit si l'un est en cours.
 */
export function usePending(): [boolean, <T>(fn: () => Promise<T>) => Promise<T | undefined>] {
  const [pending, setPending] = React.useState(false)
  const enCours = React.useRef(false)
  const run = React.useCallback(async <T,>(fn: () => Promise<T>) => {
    if (enCours.current) return undefined
    enCours.current = true
    setPending(true)
    try { return await fn() } finally { enCours.current = false; setPending(false) }
  }, [])
  return [pending, run]
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
