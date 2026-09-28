import { notFound } from 'next/navigation'
import { Printer, CheckCircle2, Siren } from 'lucide-react'
import { boutonBon } from '@/components/ui/bon-style'
import { prisma } from '@/server/db'
import { Badge } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { BackLink } from '@/components/ui/back-link'
import { type ServiLigne } from './servi-table'
import { SuiteServis } from './suite-servis'
import { formatLongDate, formatQty, toDateKey, retourSur } from '@/lib/utils'

/**
 * La suite d'une commande : tout ce qui est parti après le premier servi.
 *
 * Le tableau du jour ne montre plus un ticket par passage — 2ᵉ, 3ᵉ, 4ᵉ servi
 * — mais la commande principale et une seule carte « Suite de commande ».
 * Cette fiche est ce qu'elle ouvre : chaque passage en tête, avec son heure,
 * qui l'a servi et s'il est signé ; puis chaque article complété, colonne
 * par colonne, du 1ᵉʳ servi au dernier, jusqu'à ce qu'il reste.
 */
export async function SuiteDetail({
  orderId, base, retour, departmentId,
}: {
  orderId: string
  /** L'espace appelant : le chemin des pages et le rôle qui les lit. */
  base: '/admin' | '/economat' | '/employe'
  retour?: string
  /** L'employé ne lit que son service : la commande doit lui appartenir. */
  departmentId?: number
}) {
  const o = await prisma.order.findUnique({
    where: { id: Number(orderId) },
    include: {
      department: { select: { id: true, name: true, color: true, icon: true } },
      createdBy: { select: { fullName: true } },
      lines: {
        select: {
          id: true, productName: true, productRef: true, categoryName: true, quantityAsked: true, quantityServed: true, rejectReason: true, sortOrder: true,
          unit: { select: { symbol: true } },
          refills: { select: { quantity: true, refill: { select: { rank: true } } } },
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      },
      refills: {
        include: { createdBy: { select: { fullName: true } }, receivedBy: { select: { fullName: true } }, _count: { select: { lines: true } } },
        orderBy: { rank: 'asc' },
      },
    },
  })
  if (!o) notFound()
  if (departmentId !== undefined && o.departmentId !== departmentId) notFound()

  const jour = toDateKey(o.businessDay)
  const dernier = o.refills.reduce((m, r) => Math.max(m, r.rank), 0)
  const rangsAvant = Array.from({ length: Math.max(dernier - 2, 0) }, (_, i) => i + 2)

  // Toutes les lignes de la commande, dans l'ordre de la feuille ; la vue
  // « suite » n'en garde que celles qu'un passage a touchées.
  const toutes: (ServiLigne & { touchee: boolean })[] = o.lines
    .map((l, i) => {
      const parRang: Record<number, number> = {}
      let total = 0
      for (const r of l.refills) {
        const rang = r.refill?.rank ?? 0
        const q = Number(r.quantity)
        if (rang < 2 || q <= 0) continue
        parRang[rang] = (parRang[rang] ?? 0) + q
        total += q
      }
      const sorti = Number(l.quantityServed ?? 0) + total
      return {
        touchee: total > 0,
        id: String(l.id),
        rang: i + 1,
        productName: l.productName,
        productRef: l.productRef,
        categoryName: l.categoryName,
        unitSymbol: l.unit?.symbol ?? '',
        quantityAsked: Number(l.quantityAsked),
        firstServed: Number(l.quantityServed ?? 0),
        quantity: parRang[dernier] ?? 0,
        remaining: Math.max(Number(l.quantityAsked) - sorti, 0),
        parRang,
      }
    })
  const sansMarque = ({ touchee, ...l }: (typeof toutes)[number]): ServiLigne => (void touchee, l)
  const lignes: ServiLigne[] = toutes.filter((l) => l.touchee).map(sansMarque)
  const toutesLignes: ServiLigne[] = toutes.map(sansMarque)

  const total = lignes.reduce((n, l) => n + Object.values(l.parRang).reduce((s, q) => s + q, 0), 0)
  const soldees = lignes.filter((l) => l.remaining === 0).length
  const lienServi = (r: (typeof o.refills)[number]) =>
    base === '/employe' ? `/employe/commandes/${o.id}/servi/${r.rank}` : `${base}/servis/${r.id}`
  const lienCommande = base === '/employe' ? `/employe/commandes/${o.id}` : `${base}/commandes/${o.id}`
  const repli = base === '/employe' ? '/employe' : `${base}?jour=${jour}`

  return (
    <>
      <div className="space-y-4">
        <SuiteServis
          retour={<BackLink href={retourSur(retour, repli)} className="mb-0">Retour</BackLink>}
          lienCommande={lienCommande}
          actions={base !== '/employe' && dernier >= 2 ? (
            <a href={`/api/bon-service/departement?dep=${o.department.id}&rang=${o.refills.map((r) => r.rank).join(',')}&jour=${jour}`} target="_blank" rel="noreferrer"
              className={boutonBon()}>
              <Printer className="size-5" />
              Imprimer le bon de la suite
            </a>
          ) : null}
          servis={o.refills.map((r) => ({
            id: String(r.id), rank: r.rank, createdAt: r.createdAt.toISOString(),
            deliveredAt: r.deliveredAt?.toISOString() ?? null, receivedAt: r.receivedAt?.toISOString() ?? null,
            createdBy: r.createdBy?.fullName ?? null, receivedBy: r.receivedBy?.fullName ?? null,
            receptionNote: r.receptionNote, lineCount: r._count.lines, href: lienServi(r),
          }))}
          lignes={lignes}
          toutesLignes={toutesLignes}
          dernier={dernier}
          rangsAvant={rangsAvant}
          employe={base === '/employe'}
          entete={(
            <>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3.5 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl text-white shadow-md" style={{ background: o.isUrgent ? 'linear-gradient(140deg, #8b1e2d, #b3384a)' : `linear-gradient(140deg, ${o.department.color}, ${o.department.color}bb)` }}>
                {o.isUrgent ? <Siren className="size-5" /> : <Icon name={o.department.icon ?? 'Building2'} className="size-5" />}
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[1rem] font-bold leading-tight text-fg">
                  {o.isUrgent ? 'Commande urgente' : 'Suite de commande'} · {o.department.name}
                  {o.isUrgent ? <span className="inline-flex items-center gap-1 rounded-full bg-[#8b1e2d] px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-white"><Siren className="size-3" aria-hidden="true" />Urgent</span> : null}
                </p>
                <p className="truncate text-[0.8rem] text-fg-muted">
                  <span className="font-mono">{o.reference}</span><span className="mx-1.5">·</span>{formatLongDate(o.businessDay)}
                  <span className="mx-1.5">·</span>demandée par {o.createdBy.fullName}
                </p>
              </div>
            </div>
            <span className="flex flex-wrap gap-1.5">
              <Badge tone="neutral">{o.refills.length} servi{o.refills.length > 1 ? 's' : ''} après le 1ᵉʳ</Badge>
              <Badge tone="neutral">{lignes.length} article{lignes.length > 1 ? 's' : ''} · {formatQty(total)} servis</Badge>
              {soldees > 0 ? <Badge tone="ok">{soldees} ligne{soldees > 1 ? 's' : ''} soldée{soldees > 1 ? 's' : ''}</Badge> : null}
            </span>
          </div>
            </>
          )}
        />
        {o.refills.some((r) => r.receivedAt) && base !== '/employe' ? (
          <p className="flex items-center gap-1.5 text-[0.78rem] text-fg-muted"><CheckCircle2 className="size-3.5 text-ok" />Un passage signé se relit ; il ne se corrige plus.</p>
        ) : null}
      </div>
    </>
  )
}
