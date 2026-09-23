import * as React from 'react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ carte */

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  deep?: boolean
  specular?: boolean
  rim?: boolean
  hover?: boolean
  as?: 'div' | 'section' | 'article' | 'aside'
  /**
   * Laisse le contenu déborder. `overflow-hidden` arrondit les coins mais crée
   * un conteneur qui annule le `sticky` d'un en-tête de tableau : une carte qui
   * en contient un doit l'activer.
   */
  overflowVisible?: boolean
}

export function GlassCard({
  className, deep, specular = true, rim, hover, overflowVisible,
  as: Tag = 'div', children, ...props
}: CardProps) {
  return (
    <Tag
      className={cn(
        deep ? 'glass-deep' : 'glass',
        specular && 'glass-specular',
        rim && 'glass-rim',
        hover && 'glass-hover',
        overflowVisible ? 'overflow-visible' : 'overflow-hidden',
        className,
      )}
      {...props}
    >
      {/* Le contenu passe au-dessus du reflet ::after. */}
      <div className={cn('relative z-[1]', overflowVisible && 'overflow-visible')}>
        {children}
      </div>
    </Tag>
  )
}

export function CardHeader({
  title, description, icon, action, className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3.5 sm:px-5',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-[rgb(var(--glass-edge)/0.14)] text-accent">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-[0.98rem] font-semibold tracking-tight text-fg">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-[0.82rem] leading-snug text-fg-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

/* --------------------------------------------------------------- bouton */
// Le bouton et son attente sont des composants client : voir button.tsx.
export { Button, Spinner, usePending, type ButtonProps } from './button'

/* ---------------------------------------------------------------- badge */

export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'info'

const TONES: Record<Tone, string> = {
  // Texte en noir : ces badges portent des informations à lire — un nombre
  // d'articles, une journée — et le gris les rendait illisibles sur les fonds
  // colorés des cartes.
  neutral: 'bg-[rgb(var(--glass-edge)/0.16)] text-fg border-[rgb(var(--glass-edge)/0.28)]',
  accent: 'bg-accent/12 text-accent border-accent/28',
  ok: 'bg-ok/12 text-ok border-ok/30',
  warn: 'bg-warn/14 text-warn border-warn/32',
  danger: 'bg-danger/12 text-danger border-danger/30',
  info: 'bg-info/12 text-info border-info/30',
}

export function Badge({
  tone = 'neutral', className, children, icon,
}: {
  tone?: Tone
  className?: string
  children: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5',
        // Plus grand sur mobile : à 0,72rem les libellés d'état étaient
        // difficiles à lire sur un téléphone.
        'text-[0.8rem] font-medium leading-5 tracking-tight sm:text-[0.72rem]',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

/* ----------------------------------------------------------------- divers */

export function EmptyState({
  icon, title, description, action,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon ? (
        <div className="grid size-14 place-items-center rounded-2xl bg-[rgb(var(--glass-edge)/0.14)] text-fg-subtle">
          {icon}
        </div>
      ) : null}
      <div>
        <p className="font-semibold text-fg">{title}</p>
        {description ? (
          <p className="mx-auto mt-1 max-w-sm text-[0.85rem] leading-relaxed text-fg-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

export function Field({
  label, hint, error, required, htmlFor, children, className,
}: {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  htmlFor?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="block text-[0.8rem] font-medium text-fg-muted">
          {label}
          {required ? <span className="ml-0.5 text-danger">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p role="alert" className="text-[0.78rem] font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[0.78rem] text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  )
}

/**
 * Enveloppe de tableau : les tableaux larges défilent dans leur conteneur,
 * jamais dans la page. `minWidth` doit croître avec le nombre de colonnes.
 */
export function TableWrap({
  children, className, minWidth = '42rem',
}: {
  children: React.ReactNode
  className?: string
  minWidth?: string
}) {
  return (
    // `scroll-x-sticky` plutôt que `scroll-x` : il découpe l'axe vertical sans
    // créer de conteneur de défilement, ce qui laisse l'en-tête coller.
    <div className={cn('scroll-x-sticky w-full', className)}>
      <table className="w-full border-collapse text-left text-[0.86rem]" style={{ minWidth }}>
        {children}
      </table>
    </div>
  )
}

export function Th({ children, className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        // Fond opaque : à 12 % d'opacité, les lignes transparaissaient sous
        // l'en-tête pendant le défilement et le rendaient illisible.
        'sticky top-0 z-[2] whitespace-nowrap bg-[#e7edf7] px-3 py-2.5',
        'text-[0.74rem] font-semibold uppercase tracking-wider text-fg-muted',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  )
}

export function Td({ children, className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-3 py-2.5 align-middle', className)} {...props}>
      {children}
    </td>
  )
}
