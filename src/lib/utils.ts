import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Prisma Decimal, number et string arrivent tous ici comme « une quantité ». */
export type DecimalLike = { toString(): string } | number | string | null | undefined

export function toNumber(value: DecimalLike): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === 'number' ? value : Number(value.toString())
  return Number.isFinite(n) ? n : 0
}

/** 12.500 -> « 12,5 » ; 12.000 -> « 12 ». */
export function formatQty(value: DecimalLike, maxDecimals = 3): string {
  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: 0,
  }).format(toNumber(value))
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  // businessDay est stocké à minuit UTC : on rend en UTC pour ne jamais
  // reculer d'un jour.
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC' }).format(d)
}

export function formatLongDate(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(d)
}

export function formatWeekday(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' }).format(d)
}

export function formatTime(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(d)
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(d)
}

export function initials(fullName: string): string {
  return fullName.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '').join('')
}

/** Jour ouvré courant, à minuit UTC — la clé de regroupement des tickets. */
export function businessDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d)
  c.setUTCDate(c.getUTCDate() + n)
  return c
}

export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}
