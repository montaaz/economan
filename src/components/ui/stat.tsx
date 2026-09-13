import * as React from 'react'
import { cn } from '@/lib/utils'
import type { Tone } from '@/components/ui/glass'

const ACCENT: Record<Tone, string> = {
  neutral: 'text-fg',
  accent: 'text-accent',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  info: 'text-info',
}

const HALO: Record<Tone, string> = {
  neutral: 'from-[rgb(var(--glass-edge)/0.24)]',
  accent: 'from-accent/28',
  ok: 'from-ok/28',
  warn: 'from-warn/28',
  danger: 'from-danger/28',
  info: 'from-info/28',
}

/** Tuile KPI : la valeur domine, l'icône vit dans un halo doux. */
export function StatTile({
  label, value, unit, hint, icon, tone = 'neutral', className,
}: {
  label: string
  value: React.ReactNode
  unit?: string
  hint?: React.ReactNode
  icon?: React.ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <div className={cn('glass glass-specular glass-hover relative flex h-full flex-col overflow-hidden p-3.5 sm:p-4', className)}>
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-gradient-to-br to-transparent blur-xl',
          HALO[tone],
        )}
      />
      <div className="relative z-[1] flex flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        {icon ? (
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg bg-[rgb(var(--glass-edge)/0.16)] sm:hidden', ACCENT[tone])}>
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="text-[0.7rem] font-medium uppercase leading-tight tracking-wide text-fg-subtle sm:text-[0.73rem]">
            {label}
          </p>
          <p className="mt-1.5 flex items-baseline gap-1">
            <span className={cn('text-[1.45rem] font-bold leading-none tracking-tight tabular-nums sm:text-[1.65rem]', ACCENT[tone])}>
              {value}
            </span>
            {unit ? <span className="text-[0.8rem] font-medium text-fg-subtle">{unit}</span> : null}
          </p>
          {hint ? <p className="mt-1.5 line-clamp-2 text-[0.74rem] leading-snug text-fg-muted">{hint}</p> : null}
        </div>
        {icon ? (
          <span className={cn('hidden size-9 shrink-0 place-items-center rounded-xl bg-[rgb(var(--glass-edge)/0.16)] sm:grid', ACCENT[tone])}>
            {icon}
          </span>
        ) : null}
      </div>
    </div>
  )
}

export function PageHeader({
  title, description, actions, children,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.35rem] font-bold leading-tight tracking-tight text-fg sm:text-[1.55rem]">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-[0.86rem] leading-relaxed text-fg-muted">{description}</p>
        ) : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
