import Link from 'next/link'
import { History } from 'lucide-react'
import { prisma } from '@/server/db'
import { GlassCard, EmptyState, TableWrap, Th, Td } from '@/components/ui/glass'
import { StatusBadge } from '@/components/ui/status'
import { DateRangeFilter } from '@/components/orders/date-range-filter'
import { formatLongDate, formatTime, toDateKey } from '@/lib/utils'

/**
 * Borne de période, en date pure.
 *
 * `businessDay` est stocké à minuit UTC : une borne doit l'être aussi, sinon
 * le fuseau du serveur décalerait l'intervalle d'un jour. Une saisie
 * incomplète — le champ date en produit pendant la frappe — est ignorée
 * plutôt que de filtrer sur une date absurde.
 */
function borne(v: string | undefined): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Historique global : une ligne par ticket, la plus récente d'abord.
 * Rendue côté serveur directement en base — pas de va-et-vient GraphQL pour
 * une lecture aussi simple.
 */
export async function OrderHistory({
  basePath, selfPath, take = 200, from, to,
}: {
  /** Racine des liens vers le détail d'un ticket. */
  basePath: string
  /** L'écran lui-même, cible du filtre de période. */
  selfPath: string
  take?: number
  /** Bornes de la période, `AAAA-MM-JJ`, chacune facultative. */
  from?: string
  to?: string
}) {
  let a = borne(from)
  let b = borne(to)
  // Choisir « du 14 au 10 » est une manipulation courante dans deux champs de
  // date ; rendre une liste vide laisserait croire qu'aucune commande
  // n'existe. On réordonne, comme le fait la période des tableaux de bord.
  if (a && b && a > b) [a, b] = [b, a]

  // Les bornes du calendrier couvrent tout l'historique, pas la page filtrée :
  // sinon, restreindre la période interdirait de l'élargir ensuite.
  const [orders, etendue] = await Promise.all([
    prisma.order.findMany({
      take,
      where: a || b ? { businessDay: { ...(a && { gte: a }), ...(b && { lte: b }) } } : undefined,
      orderBy: [{ businessDay: 'desc' }, { departmentId: 'asc' }, { ticketNumber: 'desc' }],
      select: {
        id: true, reference: true, ticketNumber: true, businessDay: true, status: true, createdAt: true,
        department: { select: { name: true, color: true } },
        createdBy: { select: { fullName: true } },
        // Qui a confirmé la réception : n'importe quel employé du service peut
        // le faire, et ce n'est pas toujours celui qui a passé la commande.
        receivedBy: { select: { fullName: true } },
        // Seul le nombre de lignes est lu : les charger toutes pour les compter
        // ramenait des milliers de quantités que le tableau n'affiche plus.
        _count: { select: { lines: true } },
      },
    }),
    prisma.order.aggregate({ _min: { businessDay: true }, _max: { businessDay: true } }),
  ])

  // Le filtre recharge l'écran où il vit ; `basePath` mène au détail d'un
  // ticket. Les confondre renverrait vers la fiche d'une commande.
  const filtre = (
    <DateRangeFilter
      from={from ?? null}
      to={to ?? null}
      basePath={selfPath}
      first={etendue._min.businessDay ? toDateKey(etendue._min.businessDay) : null}
      last={etendue._max.businessDay ? toDateKey(etendue._max.businessDay) : null}
    />
  )

  if (orders.length === 0) {
    return (
      <>
        {filtre}
        <GlassCard>
          {/* Une période vide n'est pas un historique vide : sans le dire, on
              croirait avoir tout perdu. */}
          <EmptyState
            icon={<History className="size-6" />}
            title={a || b ? 'Aucune commande sur cette période' : 'Aucun historique'}
            description={
              a || b
                ? 'Élargissez les bornes ou revenez à tout l’historique.'
                : 'Aucune commande n’a encore été enregistrée.'
            }
          />
        </GlassCard>
      </>
    )
  }

  return (
    <>
      {filtre}
      <GlassCard>
        <TableWrap minWidth="46rem">
          <thead>
            <tr>
              <Th>Journée</Th>
              <Th>Département</Th>
              <Th className="text-right">Ticket</Th>
              <Th>Référence</Th>
              <Th>Demandeur</Th>
              <Th>Réceptionné par</Th>
              <Th className="text-right">Lignes</Th>
              <Th>État</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
            {orders.map((o) => {
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
                  {/* Tant que le service n'a pas confirmé, la case reste vide :
                      écrire un nom laisserait croire que le dossier est clos. */}
                  <Td className="whitespace-nowrap text-fg-muted">
                    {o.receivedBy ? o.receivedBy.fullName : <span className="text-fg-subtle">—</span>}
                  </Td>
                  <Td className="text-right tabular-nums text-fg-muted">{o._count.lines}</Td>
                  <Td><StatusBadge status={o.status} /></Td>
                </tr>
              )
            })}
          </tbody>
        </TableWrap>
        {/* « Derniers tickets » désigne une fin de liste ; sur une période
            bornée, ce sont tous les tickets de l'intervalle. */}
        <p className="border-t border-[rgb(var(--glass-edge)/0.14)] px-4 py-2.5 text-[0.78rem] tabular-nums text-fg-subtle">
          {orders.length} ticket{orders.length > 1 ? 's' : ''}
          {a || b ? ' sur la période' : ' — les plus récents'}
        </p>
      </GlassCard>
    </>
  )
}
