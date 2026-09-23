'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm'
import { useToast } from '@/components/ui/toast'
import { gql, errorMessage } from '@/lib/graphql-client'
import { cn } from '@/lib/utils'

const DELETE_MANY = /* GraphQL */ `
  mutation DeleteOrders($ids: [ID!]!) { deleteOrders(ids: $ids) }
`

/**
 * Supprimer des tickets depuis le tableau — le geste de l'administration.
 *
 * Une commande supprimée ne disparaît pas d'un coup : sa carte se
 * désagrège, pixel par pixel, puis laisse sa place. Le même mouvement joue
 * pour un ticket seul ou pour tous ceux d'un département. La suppression
 * part en même temps que l'animation ; si elle échoue, la carte revient.
 */
type Ctx = {
  dissolving: Set<string>
  hidden: Set<string>
  supprimer: (ids: string[], intitule: string) => Promise<void>
}
const DeletionContext = React.createContext<Ctx | null>(null)

const DUREE = 1100

export function OrderDeletionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const confirmer = useConfirm()
  const { push } = useToast()
  const [dissolving, setDissolving] = React.useState<Set<string>>(new Set())
  const [hidden, setHidden] = React.useState<Set<string>>(new Set())

  const supprimer = React.useCallback(async (ids: string[], intitule: string) => {
    if (ids.length === 0) return
    const plusieurs = ids.length > 1
    const ok = await confirmer({
      title: plusieurs ? `Supprimer ${ids.length} commandes ?` : `Supprimer ${intitule} ?`,
      message: (plusieurs
        ? `Les ${ids.length} tickets ${intitule} disparaîtront du tableau avec leurs servis complémentaires.`
        : 'Ce ticket disparaîtra du tableau avec ses servis complémentaires.')
        + ' Ce qui avait été livré ne comptera plus comme sorti du stock. Les numéros de ticket restent consommés. Cette action ne se défait pas.',
      confirmLabel: 'Supprimer',
      tone: 'danger',
    })
    if (!ok) return
    setDissolving((s) => new Set([...s, ...ids]))
    const attente = new Promise<void>((r) => window.setTimeout(r, DUREE))
    try {
      const [d] = await Promise.all([gql<{ deleteOrders: number }>(DELETE_MANY, { ids }), attente])
      setHidden((s) => new Set([...s, ...ids]))
      push('success', d.deleteOrders > 1 ? `${d.deleteOrders} commandes supprimées.` : 'Commande supprimée.')
      router.refresh()
    } catch (e) {
      setDissolving((s) => { const n = new Set(s); for (const id of ids) n.delete(id); return n })
      push('error', errorMessage(e))
    }
  }, [confirmer, push, router])

  const value = React.useMemo(() => ({ dissolving, hidden, supprimer }), [dissolving, hidden, supprimer])
  return <DeletionContext.Provider value={value}>{children}</DeletionContext.Provider>
}

function useDeletion(): Ctx | null {
  return React.useContext(DeletionContext)
}

/** Les pixels d'une carte : chacun part dans sa direction, à son heure. */
function Poussiere({ color }: { color: string }) {
  const cases = React.useMemo(() => {
    const cols = 16, rows = 8
    return Array.from({ length: cols * rows }, (_, i) => {
      const x = i % cols, y = Math.floor(i / cols)
      // Vers la droite et le haut surtout, comme emporté par un souffle ;
      // les colonnes de gauche partent les dernières.
      const dx = 30 + Math.random() * 90, dy = -(20 + Math.random() * 70) + Math.random() * 30
      const delay = (x / cols) * 380 + Math.random() * 120
      return { x, y, dx, dy, r: (Math.random() - 0.5) * 120, delay }
    })
  }, [])
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 z-[3] grid overflow-visible" style={{ gridTemplateColumns: 'repeat(16, 1fr)', gridTemplateRows: 'repeat(8, 1fr)' }}>
      {cases.map((c) => (
        <span
          key={`${c.x}-${c.y}`}
          className="animate-dust block"
          style={{
            background: `${color}${c.y % 2 === c.x % 2 ? 'd9' : 'b3'}`,
            animationDelay: `${c.delay}ms`,
            ['--dx' as string]: `${c.dx}px`,
            ['--dy' as string]: `${c.dy}px`,
            ['--r' as string]: `${c.r}deg`,
          }}
        />
      ))}
    </span>
  )
}

/**
 * Enveloppe d'une carte qui peut se désagréger. `id` est celui de la
 * commande : ses servis complémentaires portent le même, et partent avec elle.
 */
export function Dissolvable({ id, color, children, className }: { id: string; color: string; children: React.ReactNode; className?: string }) {
  const ctx = useDeletion()
  if (ctx?.hidden.has(id)) return null
  const enCours = ctx?.dissolving.has(id) ?? false
  return (
    <div className={cn('relative', className)}>
      <div className={cn(enCours && 'animate-fade-out pointer-events-none')} style={enCours ? { animationDelay: '150ms' } : undefined}>{children}</div>
      {enCours ? <Poussiere color={color} /> : null}
    </div>
  )
}

/** Le bouton : une corbeille, ou « Tout supprimer » pour un lot. */
export function DeleteOrdersButton({
  ids, intitule, variant = 'icon', className,
}: {
  ids: string[]
  /** Ce qu'on supprime, pour la question : « BAR-…-001 », « du Bar », « de la journée ». */
  intitule: string
  variant?: 'icon' | 'text'
  className?: string
}) {
  const ctx = useDeletion()
  const [busy, setBusy] = React.useState(false)
  if (!ctx || ids.length === 0) return null
  const agir = async () => {
    if (busy) return
    setBusy(true)
    try { await ctx.supprimer(ids, intitule) } finally { setBusy(false) }
  }
  if (variant === 'text') {
    return (
      <button
        type="button"
        onClick={() => void agir()}
        disabled={busy}
        className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg border border-danger/35 bg-white/70 px-2.5 text-[0.78rem] font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-60', className)}
      >
        <Trash2 className="size-3.5" />
        Tout supprimer
        <span className="text-[0.7rem] font-medium opacity-75">({ids.length})</span>
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={() => void agir()}
      disabled={busy}
      title="Supprimer cette commande"
      aria-label={`Supprimer la commande ${intitule}`}
      className={cn('grid size-7 place-items-center rounded-lg text-danger transition-colors hover:bg-danger/12 disabled:opacity-60', className)}
    >
      <Trash2 className="size-4" />
    </button>
  )
}
