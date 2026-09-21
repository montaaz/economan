import { Clock, PackageCheck, Truck, CheckCircle2, Ban, type LucideIcon } from 'lucide-react'
import type { OrderStatus } from '@/generated/prisma/enums'
import { Badge, type Tone } from '@/components/ui/glass'

const STATUS: Record<OrderStatus, { label: string; tone: Tone; Icon: LucideIcon }> = {
  PENDING: { label: 'En attente', tone: 'warn', Icon: Clock },
  ACCEPTED: { label: 'En préparation', tone: 'accent', Icon: PackageCheck },
  DELIVERED: { label: 'Livrée', tone: 'info', Icon: Truck },
  RECEIVED: { label: 'Reçue', tone: 'ok', Icon: CheckCircle2 },
  CANCELLED: { label: 'Annulée', tone: 'neutral', Icon: Ban },
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const { label, tone, Icon } = STATUS[status]
  return (
    <Badge tone={tone} icon={<Icon className="size-3.5" aria-hidden="true" />}>
      {label}
    </Badge>
  )
}

export function statusLabel(status: OrderStatus): string {
  return STATUS[status].label
}

/** Étapes ordonnées, pour la frise d'une commande. */
export function statusSteps(
  status: OrderStatus,
  /**
   * Quand chaque étape a été franchie. Sans ces heures, la frise dit où en est
   * la commande mais pas depuis quand — or c'est ce qu'on cherche en la
   * regardant : « le bon est parti à quelle heure ? ».
   */
  at?: {
    createdAt?: string | null
    acceptedAt?: string | null
    deliveredAt?: string | null
    receivedAt?: string | null
  },
) {
  const cancelled = status === 'CANCELLED'
  const order: OrderStatus[] = ['PENDING', 'ACCEPTED', 'DELIVERED', 'RECEIVED']
  const currentIndex = cancelled ? -1 : order.indexOf(status)
  const horodatage: Record<OrderStatus, string | null | undefined> = {
    PENDING: at?.createdAt,
    ACCEPTED: at?.acceptedAt,
    DELIVERED: at?.deliveredAt,
    RECEIVED: at?.receivedAt,
    CANCELLED: null,
  }

  return order.map((s, i) => ({
    status: s,
    label: STATUS[s].label,
    Icon: STATUS[s].Icon,
    done: !cancelled && i <= currentIndex,
    current: !cancelled && i === currentIndex,
    at: horodatage[s] ?? null,
  }))
}
