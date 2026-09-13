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
export function statusSteps(status: OrderStatus) {
  const cancelled = status === 'CANCELLED'
  const order: OrderStatus[] = ['PENDING', 'ACCEPTED', 'DELIVERED', 'RECEIVED']
  const currentIndex = cancelled ? -1 : order.indexOf(status)

  return order.map((s, i) => ({
    status: s,
    label: STATUS[s].label,
    Icon: STATUS[s].Icon,
    done: !cancelled && i <= currentIndex,
    current: !cancelled && i === currentIndex,
  }))
}
