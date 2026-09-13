import * as React from 'react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ carte */

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  deep?: boolean
  specular?: boolean
  rim?: boolean
  hover?: boolean
  as?: 'div' | 'section' | 'article' | 'aside'
}

export function GlassCard({
  className, deep, specular = true, rim, hover, as: Tag = 'div', children, ...props
}: CardProps) {
  return (
    <Tag
      className={cn(
        deep ? 'glass-deep' : 'glass',
        specular && 'glass-specular',
        rim && 'glass-rim',
        hover && 'glass-hover',
        'overflow-hidden',
        className,
      )}
      {...props}
    >
      {/* Le contenu passe au-dessus du reflet ::after. */}
      <div className="relative z-[1]">{children}</div>
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

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
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
      {loading ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  )
})

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

/* ---------------------------------------------------------------- badge */

export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'info'

const TONES: Record<Tone, string> = {
  neutral: 'bg-[rgb(var(--glass-edge)/0.16)] text-fg-muted border-[rgb(var(--glass-edge)/0.28)]',
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
        'text-[0.72rem] font-medium leading-5 tracking-tight',
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
    <div className={cn('scroll-x w-full', className)}>
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
        'sticky top-0 z-[2] whitespace-nowrap bg-[rgb(var(--glass-edge)/0.12)] px-3 py-2.5',
        'text-[0.74rem] font-semibold uppercase tracking-wider text-fg-muted backdrop-blur-md',
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
