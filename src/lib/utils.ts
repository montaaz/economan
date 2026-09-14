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

/** Fuseau de l'établissement : c'est lui qui définit la journée de service. */
export const BUSINESS_TZ = process.env.BUSINESS_TIMEZONE || 'Africa/Tunis'

/**
 * Jour ouvré courant, à minuit UTC — la clé de regroupement des tickets.
 *
 * La date est résolue dans le fuseau de l'établissement, jamais dans celui du
 * serveur. Sur un hébergeur réglé en UTC, `getDate()` bascule à minuit UTC,
 * soit 01 h à Tunis : une commande passée entre minuit et 1 h serait rangée la
 * veille, et le tableau du jour — qui demande « aujourd'hui » — ne la verrait
 * pas. On lit donc les composantes telles que les voit l'établissement.
 */
export function businessDay(d = new Date()): Date {
  // en-CA rend « AAAA-MM-JJ », directement exploitable.
  const [y, m, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(d)
    .split('-')
    .map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d)
  c.setUTCDate(c.getUTCDate() + n)
  return c
}

export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}
