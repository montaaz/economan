import { Clock, PackageOpen, Truck, CheckCircle2 } from 'lucide-react'
import { cn, formatTime } from '@/lib/utils'

export type OrderDates = {
  createdAt: string
  acceptedAt?: string | null
  deliveredAt?: string | null
  receivedAt?: string | null
}

/**
 * Les quatre moments d'une commande, nommés.
 *
 * « 23:12 » sous une frise ne dit pas de quoi il est l'heure : il faut relire
 * l'étape au-dessus. Chaque date porte donc son intitulé, et l'ensemble se lit
 * sans rien reconstituer.
 */
// Toutes les heures en bleu : ce sont quatre moments d'une même chronologie,
// et leur donner chacune une couleur laissait croire à quatre natures.
// L'icône suffit à distinguer les étapes.
const HEURE = 'text-accent'

const ETAPES = [
  { cle: 'createdAt', label: 'Commande', Icon: Clock },
  { cle: 'acceptedAt', label: 'Acceptation', Icon: PackageOpen },
  { cle: 'deliveredAt', label: 'Livraison', Icon: Truck },
  { cle: 'receivedAt', label: 'Réception', Icon: CheckCircle2 },
] as const

export function OrderDates({
  order, compact, className,
}: {
  order: OrderDates
  /** Sur une carte : plus serré, sans icônes. */
  compact?: boolean
  className?: string
}) {
  // Une étape non franchie n'a pas d'heure : l'annoncer avec un tiret
  // encombrerait la ligne sans rien apprendre.
  const franchies = ETAPES.filter((e) => order[e.cle])
  if (franchies.length === 0) return null

  if (compact) {
    return (
      <p className={cn('flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.74rem] tabular-nums', className)}>
        {franchies.map((e) => (
          <span key={e.cle} className="whitespace-nowrap">
            {/* L'intitulé en noir et gras : en gris clair il se lisait mal
                sur les fonds colorés des cartes. */}
            <span className="font-semibold text-fg">{e.label} </span>
            <span className={cn('font-bold', HEURE)}>{formatTime(order[e.cle])}</span>
          </span>
        ))}
      </p>
    )
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {franchies.map((e) => (
        <span key={e.cle} className="flex items-center gap-1.5 whitespace-nowrap">
          <e.Icon className={cn('size-3.5 shrink-0', HEURE)} />
          {/* « Heure » et non « date » : c'est bien une heure qui suit. */}
          <span className="text-[0.78rem] font-semibold text-fg">
            Heure {e.label.toLowerCase()}
          </span>
          <span className={cn('text-[0.85rem] font-bold tabular-nums', HEURE)}>
            {formatTime(order[e.cle])}
          </span>
        </span>
      ))}
    </div>
  )
}
