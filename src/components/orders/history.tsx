import Link from 'next/link'
import { History } from 'lucide-react'
import { prisma } from '@/server/db'
import { GlassCard, Badge, EmptyState, TableWrap, Th, Td } from '@/components/ui/glass'
import { StatusBadge } from '@/components/ui/status'
import { formatLongDate, formatQty, formatTime } from '@/lib/utils'

/**
 * Historique global : une ligne par ticket, la plus récente d'abord.
 * Rendue côté serveur directement en base — pas de va-et-vient GraphQL pour
 * une lecture aussi simple.
 */
export async function OrderHistory({ basePath, take = 200 }: { basePath: string; take?: number }) {
  const orders = await prisma.order.findMany({
    take,
    orderBy: [{ businessDay: 'desc' }, { departmentId: 'asc' }, { ticketNumber: 'desc' }],
    select: {
      id: true, reference: true, ticketNumber: true, businessDay: true, status: true, createdAt: true,
      department: { select: { name: true, color: true } },
      createdBy: { select: { fullName: true } },
      lines: { select: { quantityAsked: true, quantityServed: true } },
    },
  })

  if (orders.length === 0) {
    return (
      <GlassCard>
        <EmptyState
          icon={<History className="size-6" />}
          title="Aucun historique"
          description="Aucune commande n’a encore été enregistrée."
        />
      </GlassCard>
    )
  }

  return (
    <GlassCard>
      <TableWrap minWidth="46rem">
        <thead>
          <tr>
            <Th>Journée</Th>
            <Th>Département</Th>
            <Th className="text-right">Ticket</Th>
            <Th>Référence</Th>
            <Th>Demandeur</Th>
            <Th className="text-right">Lignes</Th>
            <Th className="text-right">Commande</Th>
            <Th className="text-right">Servi</Th>
            <Th>État</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
          {orders.map((o) => {
            const asked = o.lines.reduce((s, l) => s + Number(l.quantityAsked), 0)
            const servedTotal = o.lines.reduce((s, l) => s + Number(l.quantityServed ?? 0), 0)
            return (
              <tr key={o.id} className="transition-colors hover:bg-[rgb(var(--glass-edge)/0.08)]">
                <Td className="whitespace-nowrap capitalize text-fg-muted">
                  <Link href={`${basePath}/${o.id}`} className="block">
                    {formatLongDate(o.businessDay)}
                    <span className="ml-1.5 text-[0.75rem] text-fg-subtle">{formatTime(o.createdAt)}</span>
                  </Link>
                </Td>
                <Td className="whitespace-nowrap">
                  <Link href={`${basePath}/${o.id}`} className="flex items-center gap-1.5 font-medium text-fg">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: o.department.color }} />
                    {o.department.name}
                  </Link>
                </Td>
                <Td className="text-right tabular-nums font-semibold text-fg">{o.ticketNumber}</Td>
                <Td className="whitespace-nowrap font-mono text-[0.78rem] text-fg-muted">{o.reference}</Td>
                <Td className="whitespace-nowrap text-fg-muted">{o.createdBy.fullName}</Td>
                <Td className="text-right tabular-nums text-fg-muted">{o.lines.length}</Td>
                <Td className="text-right tabular-nums text-fg-muted">{formatQty(asked)}</Td>
                <Td className="text-right font-medium tabular-nums text-fg">{formatQty(servedTotal)}</Td>
                <Td><StatusBadge status={o.status} /></Td>
              </tr>
            )
          })}
        </tbody>
      </TableWrap>
      <p className="border-t border-[rgb(var(--glass-edge)/0.14)] px-4 py-2.5 text-[0.78rem] tabular-nums text-fg-subtle">
        {orders.length} dernier(s) ticket(s)
      </p>
    </GlassCard>
  )
}
