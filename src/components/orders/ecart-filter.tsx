'use client'

import { useRouter } from 'next/navigation'
import { Ban, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/glass'
import { cn } from '@/lib/utils'

/**
 * Filtre la journée sur les tickets qui portent un écart à la commande.
 *
 * Compter les ruptures sans pouvoir les situer laissait le plus gros du
 * travail — retrouver quelles commandes sont concernées — à la charge du
 * lecteur. Le filtre passe par l'URL, comme celui par service : la vue reste
 * partageable et survit au rechargement.
 */
export function EcartFilter({
  ruptures, ajustees, current, day, dayTo, dep, total,
}: {
  ruptures: number
  ajustees: number
  /** 'rupture', 'ajuste', ou null pour tous les tickets. */
  current: 'rupture' | 'ajuste' | null
  day: string
  dayTo?: string | null
  /** Service filtré, conservé en changeant d'écart. */
  dep?: string | null
  /** Nombre de tickets sans filtre, pour le bouton de retour. */
  total: number
}) {
  const router = useRouter()

  function go(ecart: 'rupture' | 'ajuste' | null) {
    const p = new URLSearchParams({ jour: day })
    if (dayTo) p.set('jusquau', dayTo)
    if (dep) p.set('dep', dep)
    if (ecart) p.set('ecart', ecart)
    router.push(`/economat?${p}`)
  }

  if (ruptures === 0 && ajustees === 0) return null

  return (
    <>
      {ruptures > 0 ? (
        <Button
          variant="danger"
          size="sm"
          aria-pressed={current === 'rupture'}
          onClick={() => go(current === 'rupture' ? null : 'rupture')}
          className={cn(current === 'rupture' && 'ring-2 ring-danger/45 ring-offset-1')}
        >
          <Ban className="size-3.5" />
          {ruptures} rupture{ruptures > 1 ? 's' : ''}
        </Button>
      ) : null}

      {ajustees > 0 ? (
        <Button
          variant="warning"
          size="sm"
          aria-pressed={current === 'ajuste'}
          onClick={() => go(current === 'ajuste' ? null : 'ajuste')}
          className={cn(current === 'ajuste' && 'ring-2 ring-warn/45 ring-offset-1')}
        >
          <Pencil className="size-3.5" />
          {ajustees} ajustée{ajustees > 1 ? 's' : ''}
        </Button>
      ) : null}

      {/* Une liste filtrée ne dit pas d'elle-même qu'elle est partielle. */}
      {current ? (
        <Button variant="ghost" size="sm" onClick={() => go(null)}>
          <X className="size-3.5" />
          Afficher les {total} ticket{total > 1 ? 's' : ''}
        </Button>
      ) : null}
    </>
  )
}
