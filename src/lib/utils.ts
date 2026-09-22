import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Fuseau de l'établissement : c'est lui qui définit la journée de service. */
export const BUSINESS_TZ = process.env.BUSINESS_TIMEZONE || 'Africa/Tunis'

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

/** « lun. 14 sept. » — pour dater un ticket dans une liste sur plusieurs jours. */
export function formatShortDay(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(d)
}

/**
 * Intitulé d'une période.
 *
 * Deux bornes identiques ne forment pas une période : on rend alors la date
 * longue, pour que l'en-tête ne se lise pas « du 14 au 14 ».
 */
export function formatPeriod(
  from: Date | string | null | undefined,
  to: Date | string | null | undefined,
): string {
  if (!from) return '—'
  const a = typeof from === 'string' ? new Date(from) : from
  const b = to ? (typeof to === 'string' ? new Date(to) : to) : a
  if (a.getTime() === b.getTime()) return formatLongDate(a)

  const court = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
  return `du ${court.format(a)} au ${court.format(b)}`
}

/** Nombre de journées d'une période, bornes incluses. */
export function countDays(
  from: Date | string,
  to: Date | string,
): number {
  const a = typeof from === 'string' ? new Date(from) : from
  const b = typeof to === 'string' ? new Date(to) : to
  return Math.round(Math.abs(b.getTime() - a.getTime()) / 86_400_000) + 1
}

export function formatWeekday(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' }).format(d)
}

export function formatTime(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BUSINESS_TZ,
  }).format(d)
}

/**
 * Date d'un horodatage, dans le fuseau de l'établissement.
 *
 * À ne pas confondre avec `formatDate`, qui rend en UTC : celui-ci convient à
 * `businessDay` (stocké à minuit UTC), jamais à un `createdAt`, qui serait
 * sinon daté de la veille pour toute commande passée après minuit à Tunis.
 */
export function formatInstantDate(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('fr-FR', { timeZone: BUSINESS_TZ }).format(d)
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

/**
 * Heure locale de clôture du service, en heures pleines.
 *
 * Le restaurant ferme à 3 h du matin : tout ce qui se passe entre minuit et
 * cette heure appartient encore à la veille. Le Z sorti à 02 h 30 le 22 est
 * celui du 21, et le ranger au 22 ouvrirait une journée qui n'a pas commencé.
 */
export const SERVICE_CLOSES_AT = Number(process.env.SERVICE_CLOSING_HOUR ?? 3)

/**
 * Journée de service des ventes, clôture de nuit comprise.
 *
 * Même convention que `businessDay` — minuit UTC, fuseau de l'établissement —
 * mais reculée d'un jour tant que l'heure de clôture n'est pas passée.
 */
export function salesDay(d = new Date()): Date {
  const heure = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: BUSINESS_TZ,
      hour: '2-digit',
      hour12: false,
    }).format(d),
  )
  const jour = businessDay(d)
  return heure < SERVICE_CLOSES_AT ? addDays(jour, -1) : jour
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d)
  c.setUTCDate(c.getUTCDate() + n)
  return c
}

export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}
