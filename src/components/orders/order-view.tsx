import { GlassCard, Badge, TableWrap, Th, Td } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { StatusBadge } from '@/components/ui/status'
import { cn, formatLongDate, formatQty, formatTime } from '@/lib/utils'
import type { ProcessOrder } from '@/lib/order-types'

const LINE = {
  PENDING: { tone: 'neutral', label: 'En attente' },
  VALIDATED: { tone: 'ok', label: 'Servi' },
  ADJUSTED: { tone: 'warn', label: 'Ajusté' },
  REJECTED: { tone: 'danger', label: 'Rupture' },
} as const

/** Consultation seule d'une commande — utilisée côté administration. */
export function OrderView({ order }: { order: ProcessOrder }) {
  return (
    <div className="space-y-4">
      <GlassCard>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid size-12 shrink-0 place-items-center rounded-xl text-[1.05rem] font-bold tabular-nums text-white shadow-md"
              style={{ background: `linear-gradient(140deg, ${order.department.color}, ${order.department.color}bb)` }}
            >
              {order.ticketNumber}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 truncate text-[1rem] font-bold leading-tight text-fg">
                <Icon name={order.department.icon ?? 'Building2'} className="size-4 shrink-0" />
                {order.department.name}
              </p>
              <p className="truncate text-[0.8rem] text-fg-muted">
                <span className="font-mono">{order.reference}</span>
                <span className="mx-1.5">·</span>
                {order.createdBy.fullName}
                <span className="mx-1.5">·</span>
                {formatTime(order.createdAt)}
              </p>
            </div>
          </div>
          <StatusBadge status={order.status} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 sm:px-5">
          <Badge tone="neutral" className="capitalize">{formatLongDate(order.businessDay)}</Badge>
          <Badge tone="neutral">{order.lineCount} article{order.lineCount > 1 ? 's' : ''}</Badge>
          <Badge tone="accent">{formatQty(order.totalAsked)} demandé</Badge>
          <Badge tone="ok">{formatQty(order.totalServed)} servi</Badge>
          {order.processedBy ? (
            <Badge tone="neutral">Traité par {order.processedBy.fullName}</Badge>
          ) : null}
        </div>

        {order.note ? (
          <p className="border-t border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 text-[0.83rem] italic text-fg-muted sm:px-5">
            {order.note}
          </p>
        ) : null}
      </GlassCard>

      <GlassCard>
        <TableWrap minWidth="36rem">
          <thead>
            <tr>
              <Th className="w-10 text-right">#</Th>
              <Th className="w-full">Article</Th>
              <Th className="text-right">Demandé</Th>
              <Th className="text-right">Servi</Th>
              <Th>État</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
            {order.lines.map((l, i) => (
              <tr key={l.id} className={cn(l.status === 'REJECTED' && 'bg-danger/[0.06]')}>
                <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{i + 1}</Td>
                <Td className="max-w-0">
                  <p className="truncate text-[0.85rem] font-medium text-fg">{l.productName}</p>
                  <p className="truncate text-[0.7rem] text-fg-subtle">
                    <span className="font-mono">{l.productRef}</span>
                    <span className="mx-1.5">·</span>
                    {l.categoryName}
                  </p>
                </Td>
                <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">
                  {formatQty(l.quantityAsked)} {l.unitSymbol}
                </Td>
                <Td className="whitespace-nowrap text-right font-medium tabular-nums text-fg">
                  {l.quantityServed === null ? '—' : `${formatQty(l.quantityServed)} ${l.unitSymbol}`}
                </Td>
                <Td>
                  <Badge tone={LINE[l.status].tone}>{LINE[l.status].label}</Badge>
                  {l.rejectReason ? (
                    <p className="mt-0.5 text-[0.7rem] text-danger">{l.rejectReason}</p>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </GlassCard>
    </div>
  )
}
