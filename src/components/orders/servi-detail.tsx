import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ClipboardList, Printer, Truck, UserCheck, PackageCheck, MessageSquareWarning } from 'lucide-react'
import { prisma } from '@/server/db'
import { BackLink } from '@/components/ui/back-link'
import { GlassCard, Badge } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { countByFamily } from '@/components/ui/family-band'
import { ServiTable } from './servi-table'
import { ReopenRefill } from './reopen-refill'
import { formatLongDate, formatQty, formatTime, toDateKey } from '@/lib/utils'

/**
 * Un servi complémentaire, en fiche.
 *
 * La carte du tableau de bord ouvrait le papier directement, alors que celle
 * d'un ticket ouvre sa fiche : on veut d'abord relire ce qui est sorti, et
 * n'imprimer qu'ensuite. Cette fiche rend ce passage lisible — ce qu'il a
 * servi, ce qu'il en reste, qui l'a reçu — et garde le bon à portée de clic.
 *
 * La même fiche sert à l'économat et à l'administration : seule la base des
 * liens change, pour que « Retour » et « Voir la commande » ramènent dans
 * l'espace d'où l'on vient — l'administration ne doit pas atterrir chez
 * l'économat.
 */
export async function ServiDetail({
  id, base,
}: {
  id: string
  /** L'espace appelant : « /economat » ou « /admin ». */
  base: '/economat' | '/admin'
}) {

  const refill = await prisma.orderRefill.findUnique({
    where: { id: Number(id) },
    include: {
      createdBy: { select: { fullName: true } },
      receivedBy: { select: { fullName: true } },
      order: {
        include: {
          department: { select: { id: true, name: true, color: true, icon: true } },
          createdBy: { select: { fullName: true } },
          // Toutes les lignes du ticket : leur numéro, et ce qu'il leur reste
          // — pour proposer à l'administration celles qu'on peut encore ajouter.
          lines: {
            select: {
              id: true, productName: true, productRef: true, quantityAsked: true, quantityServed: true,
              unit: { select: { symbol: true } },
              refills: { select: { quantity: true, refillId: true } },
            },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          },
        },
      },
      lines: {
        include: {
          orderLine: {
            include: {
              unit: true,
              refills: { select: { quantity: true, refill: { select: { rank: true } } } },
            },
          },
        },
      },
    },
  })
  if (!refill) notFound()

  const o = refill.order
  const jour = toDateKey(o.businessDay)
  const rangDe = new Map(o.lines.map((l, i) => [l.id, i + 1]))

  const lignes = refill.lines
    .slice()
    .sort((a, b) => a.orderLine.sortOrder - b.orderLine.sortOrder)
    .map((l) => {
      const ol = l.orderLine
      // Ce qui est sorti jusqu'à ce passage inclus : le premier servi, plus
      // les compléments de rang inférieur ou égal.
      const anterieurs = ol.refills
        .filter((r) => (r.refill?.rank ?? 0) <= refill.rank)
        .reduce((n, r) => n + Number(r.quantity), 0)
      const sorti = Number(ol.quantityServed ?? 0) + anterieurs
      // Chaque servi intermédiaire, par rang : on lit d'un coup tout ce qui
      // est sorti avant celui-ci, sans retourner à la commande.
      // Un objet plutôt qu'une Map : le tableau est un composant client, et
      // seules les valeurs simples franchissent la frontière.
      const parRang: Record<number, number> = {}
      for (const r of ol.refills) {
        const rang = r.refill?.rank ?? 0
        if (rang > 1 && rang < refill.rank) parRang[rang] = (parRang[rang] ?? 0) + Number(r.quantity)
      }
      // Le plafond d'une correction : ce que les autres passages laissent
      // encore à servir, ce servi-ci mis à part.
      const autres = ol.refills.reduce((n, r) => n + Number(r.quantity), 0) - Number(l.quantity)
      const plafond = Math.max(Number(ol.quantityAsked) - Number(ol.quantityServed ?? 0) - autres, 0)
      return {
        parRang,
        plafond,
        rang: rangDe.get(l.orderLineId) ?? 0,
        id: String(l.id),
        lineId: String(l.orderLineId),
        productName: ol.productName,
        productRef: ol.productRef,
        categoryName: ol.categoryName,
        unitSymbol: ol.unit?.symbol ?? '',
        quantityAsked: Number(ol.quantityAsked),
        firstServed: Number(ol.quantityServed ?? 0),
        quantity: Number(l.quantity),
        remaining: Math.max(Number(ol.quantityAsked) - sorti, 0),
        rejectReason: ol.rejectReason,
      }
    })

  // Les colonnes des servis précédents : du 2ᵉ jusqu'à celui d'avant.
  const rangsAvant = Array.from({ length: Math.max(refill.rank - 2, 0) }, (_, i) => i + 2)

  // L'administration corrige un servi ouvert — bon non émis, non signé —
  // depuis cette fiche. Les lignes du ticket qu'on peut encore y ajouter :
  // celles à qui il reste quelque chose et qui n'y figurent pas déjà.
  const modifiable = base === '/admin' && !refill.deliveredAt && !refill.receivedAt
  const dansLeServi = new Set(refill.lines.map((l) => l.orderLineId))
  const candidats = modifiable
    ? o.lines
        .filter((l) => !dansLeServi.has(l.id))
        .map((l, i) => {
          const sortis = l.refills.reduce((n, r) => n + Number(r.quantity), 0)
          return {
            lineId: String(l.id), rang: i + 1, productName: l.productName, productRef: l.productRef,
            unitSymbol: l.unit?.symbol ?? '',
            reste: Math.max(Number(l.quantityAsked) - Number(l.quantityServed ?? 0) - sortis, 0),
          }
        })
        .filter((l) => l.reste > 0)
    : []
  const parFamille = countByFamily(lignes)
  const total = lignes.reduce((n, l) => n + l.quantity, 0)
  const soldees = lignes.filter((l) => l.remaining === 0).length

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <BackLink href={`${base}?jour=${jour}`} className="mb-0">Retour</BackLink>
        <div className="flex flex-wrap items-center gap-2">
          {/* L'administration lève ou remet le verrou d'ici aussi : c'est en
              relisant la fiche qu'on décide d'y revenir. */}
          {base === '/admin' && !refill.receivedAt ? (
            <ReopenRefill id={String(refill.id)} rank={refill.rank} ouvert={!refill.deliveredAt} />
          ) : null}
          {/* Le ticket d'origine, pour relire ce qui avait été demandé. */}
          <Link
            href={`${base}/commandes/${o.id}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[rgb(var(--glass-edge)/0.34)] bg-white/65 px-3 py-2 text-[0.83rem] font-semibold text-fg transition-colors hover:bg-white"
          >
            <ClipboardList className="size-4" />
            Voir la commande
          </Link>
          {/* Le papier du passage, en dernier : on le sort après avoir relu. */}
          <a
            href={`/api/bon-service/departement?dep=${o.department.id}&rang=${refill.rank}&jour=${jour}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-info/40 bg-info/10 px-3 py-2 text-[0.83rem] font-semibold text-info transition-colors hover:bg-info/15"
          >
            <Printer className="size-4" />
            Bon de livraison
          </a>
        </div>
      </div>

      <div className="space-y-4">
        <GlassCard>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3.5 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="grid size-11 shrink-0 place-items-center rounded-xl text-white shadow-md"
                style={{ background: `linear-gradient(140deg, ${o.department.color}, ${o.department.color}bb)` }}
              >
                <Icon name={o.department.icon ?? 'Building2'} className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[1rem] font-bold leading-tight text-fg">
                  {refill.rank}ᵉ servi · {o.department.name}
                </p>
                <p className="truncate text-[0.8rem] text-fg-muted">
                  <span className="font-mono">{o.reference}</span>
                  <span className="mx-1.5">·</span>
                  {formatLongDate(o.businessDay)}
                </p>
              </div>
            </div>
            {refill.receivedAt ? (
              <Badge tone="ok" icon={<UserCheck className="size-3.5" />}>
                Reçu par {refill.receivedBy?.fullName ?? 'le département'} à {formatTime(refill.receivedAt)}
              </Badge>
            ) : (
              <Badge tone="info" icon={<PackageCheck className="size-3.5" />}>À réceptionner</Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-[0.83rem] sm:px-5">
            <span className="flex items-center gap-1.5">
              <span className="font-semibold text-fg">Servi</span>
              <span className="font-bold tabular-nums text-accent">{formatTime(refill.createdAt)}</span>
              {refill.createdBy ? (
                <span className="text-fg-muted">par {refill.createdBy.fullName}</span>
              ) : null}
            </span>
            {/* Le bon fige le passage : on le dit ici, là où on vient juger
                s'il faut encore corriger quelque chose. */}
            {refill.deliveredAt ? (
              <span className="flex items-center gap-1.5">
                <Truck className="size-3.5 text-info" />
                <span className="font-semibold text-fg">Bon émis</span>
                <span className="font-bold tabular-nums text-accent">
                  {formatTime(refill.deliveredAt)}
                </span>
              </span>
            ) : null}
            <Badge tone="neutral">
              {lignes.length} article{lignes.length > 1 ? 's' : ''} · {formatQty(total)} servis
            </Badge>
            {soldees > 0 ? (
              <Badge tone="ok">{soldees} ligne{soldees > 1 ? 's' : ''} soldée{soldees > 1 ? 's' : ''}</Badge>
            ) : null}
          </div>

          {refill.receptionNote ? (
            <p className="border-t border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 text-[0.83rem] font-medium text-danger sm:px-5">
              <MessageSquareWarning className="mr-1.5 inline size-4" />
              Remarque à la réception : {refill.receptionNote}
            </p>
          ) : null}
        </GlassCard>

        <ServiTable
          lignes={lignes}
          rang={refill.rank}
          rangsAvant={rangsAvant}
          edition={modifiable ? { refillId: String(refill.id), retour: `${base}?jour=${jour}`, candidats } : null}
        />
      </div>
    </>
  )
}
