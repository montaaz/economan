import type { Metadata } from 'next'
import Link from 'next/link'
import { Coins, Warehouse, Layers, Receipt, ShoppingCart, Scale, AlertTriangle } from 'lucide-react'
import { executeGraphQL } from '@/server/graphql/execute'
import { requireRole } from '@/server/auth/guards'
import { PageHeader } from '@/components/ui/stat'
import { GlassCard, EmptyState } from '@/components/ui/glass'
import { DateRangeFilter } from '@/components/orders/date-range-filter'
import { Icon } from '@/components/ui/icon'
import { StatTile } from '@/components/ui/stat'
import { ProfitPanel, type ProfitDish, type ProfitArticle } from '@/components/stock/profit-panel'
import { cn, formatMoney, formatPeriod, formatQty } from '@/lib/utils'

export const metadata: Metadata = { title: 'Argent' }
export const dynamic = 'force-dynamic'

const QUERY = /* GraphQL */ `
  query Argent($from: Date, $to: Date) {
    departmentSpend(from: $from, to: $to) {
      department { id name color icon }
      lineCount
      amount
      items { productId productName unitSymbol quantity amount }
    }
    generalStock { totalValue negativeCount }
    profitability(from: $from, to: $to) {
      revenue cost margin marginRate purchasedValue deliveredValue unpricedCount unrecipedCount
      plats { ...Plat }
      articles { ...Article }
      departments { departmentId revenue cost margin marginRate deliveredValue plats { ...Plat } articles { ...Article } }
    }
  }
  fragment Plat on ProfitDish { salesItemId name familyName departmentId quantity unitPrice revenue unitCost cost margin marginRate hasRecipe incompleteLines }
  fragment Article on ProfitArticle { productId name unitSymbol categoryName unitCost purchasedQty purchasedValue deliveredQty deliveredValue soldQty soldValue revenue margin gapQty gapValue }
`

type Data = {
  departmentSpend: {
    department: { id: string; name: string; color: string; icon: string | null }
    lineCount: number
    amount: number
    items: { productId: string; productName: string; unitSymbol: string; quantity: number; amount: number }[]
  }[]
  generalStock: { totalValue: number; negativeCount: number }
  profitability: {
    revenue: number; cost: number; margin: number; marginRate: number | null; purchasedValue: number; deliveredValue: number
    unpricedCount: number; unrecipedCount: number
    plats: ProfitDish[]; articles: ProfitArticle[]
    departments: { departmentId: string; revenue: number; cost: number; margin: number; marginRate: number | null; deliveredValue: number; plats: ProfitDish[]; articles: ProfitArticle[] }[]
  }
}

/** AAAA-MM-JJ ou rien : une date mal formée est ignorée. */
function borne(v?: string): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

/**
 * L'argent : ce que chaque département a reçu du stock général, en dinars,
 * au coût moyen des arrivages — et ce que vaut ce qui reste au magasin.
 */
export default async function ArgentPage({
  searchParams,
}: {
  searchParams: Promise<{ du?: string; au?: string; dep?: string }>
}) {
  await requireRole(['ADMIN'], '/admin/login')
  const { du, au, dep } = await searchParams
  let a = borne(du)
  let b = borne(au)
  if (a && b && a > b) [a, b] = [b, a]
  const data = await executeGraphQL<Data>(QUERY, { from: a, to: b })
  const total = data.departmentSpend.reduce((n, d) => n + d.amount, 0)
  const actifs = data.departmentSpend.filter((d) => d.lineCount > 0)
  // Un département choisi : sa carte seule, avec tous ses articles.
  const choisi = dep && data.departmentSpend.some((d) => d.department.id === dep) ? dep : null
  const montres = choisi ? data.departmentSpend.filter((d) => d.department.id === choisi) : actifs
  const lienDep = (id: string | null) => {
    const q = new URLSearchParams()
    if (a) q.set('du', a)
    if (b) q.set('au', b)
    if (id) q.set('dep', id)
    return q.size ? `/admin/argent?${q}` : '/admin/argent'
  }
  const pastille = 'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[0.8rem] font-semibold transition-colors'
  // Achats contre ventes : la vue « Tous » ou celle du département choisi.
  const rent = data.profitability
  const rentDep = choisi ? rent.departments.find((d) => d.departmentId === choisi) : null
  const vue = rentDep ?? rent
  const nomsDep = new Map(data.departmentSpend.map((d) => [d.department.id, d.department.name]))
  const periode = a || b ? formatPeriod(a ?? b, b ?? a) : 'depuis le début'
  const tonMarge = vue.revenue <= 0 && vue.cost <= 0 ? 'neutral' : vue.margin < -1e-9 ? 'danger' : (vue.marginRate ?? 0) < 30 ? 'warn' : 'ok'

  return (
    <>
      <PageHeader
        title="Argent"
        description="Ce que chaque département a reçu du stock général, valorisé au coût moyen des arrivages."
      />
      <DateRangeFilter from={a} to={b} basePath="/admin/argent" keep={{ dep: choisi ?? undefined }} />

      {/* Le même geste que sur les tableaux : une pastille par département,
          « Tous » pour revenir à la vue d'ensemble. La pastille porte le
          montant, pas un nombre de tickets — c'est ce qu'on vient lire. */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        <Link href={lienDep(null)} className={cn(pastille, choisi === null ? 'border-accent/40 bg-accent/12 text-accent' : 'border-[rgb(var(--glass-edge)/0.34)] bg-white/65 text-fg-muted hover:bg-white hover:text-fg')}>
          <Layers className="size-3.5" />
          Tous
          <span className="text-[0.72rem] font-medium opacity-70">({formatMoney(total)})</span>
        </Link>
        {data.departmentSpend.map((d) => (
          <Link
            key={d.department.id}
            href={lienDep(choisi === d.department.id ? null : d.department.id)}
            aria-pressed={choisi === d.department.id}
            className={cn(pastille, choisi === d.department.id ? 'text-white' : 'border-[rgb(var(--glass-edge)/0.34)] bg-white/65 text-fg-muted hover:bg-white hover:text-fg', d.lineCount === 0 && 'opacity-60')}
            style={choisi === d.department.id ? { background: d.department.color, borderColor: d.department.color } : undefined}
          >
            <span className="grid size-5 place-items-center rounded-md text-white" style={{ background: choisi === d.department.id ? 'rgb(255 255 255 / 0.25)' : d.department.color }}>
              <Icon name={d.department.icon ?? 'Building2'} className="size-3" />
            </span>
            {d.department.name}
            <span className="text-[0.72rem] font-medium opacity-80">({formatMoney(d.amount)})</span>
          </Link>
        ))}
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <GlassCard className="p-4 sm:p-5">
          <p className="flex items-center gap-2 text-[0.78rem] font-semibold uppercase tracking-wide text-fg-muted">
            <Coins className="size-4" />
            Livré aux départements {a || b ? `— ${formatPeriod(a ?? b, b ?? a)}` : '— depuis le début'}
          </p>
          <p className="mt-1 text-[1.8rem] font-bold tabular-nums text-fg">{formatMoney(total)}</p>
          <p className="text-[0.8rem] text-fg-muted">{actifs.length} département{actifs.length > 1 ? 's' : ''} servi{actifs.length > 1 ? 's' : ''}</p>
        </GlassCard>
        <GlassCard className="p-4 sm:p-5">
          <p className="flex items-center gap-2 text-[0.78rem] font-semibold uppercase tracking-wide text-fg-muted">
            <Warehouse className="size-4" />
            Valeur du stock général aujourd’hui
          </p>
          <p className="mt-1 text-[1.8rem] font-bold tabular-nums text-fg">{formatMoney(data.generalStock.totalValue)}</p>
          <p className="text-[0.8rem] text-fg-muted">
            {data.generalStock.negativeCount > 0
              ? `${data.generalStock.negativeCount} article(s) en stock négatif : des entrées manquent.`
              : 'Entrées moins livraisons, au coût moyen.'}
          </p>
        </GlassCard>
      </div>

      {/* Achats contre ventes : ce que le Z rapporte contre ce que les fiches
          font coûter. C'est la question qu'on vient poser à cette page —
          est-ce que je perds de l'argent ? — elle passe donc avant le détail
          des livraisons. */}
      <section className="mb-6">
        <h2 className="mb-1 flex items-center gap-2 text-[1.05rem] font-bold text-fg">
          <Scale className="size-4 text-accent" />
          Achats contre ventes {choisi ? `— ${nomsDep.get(choisi) ?? ''}` : ''}
        </h2>
        <p className="mb-3 text-[0.82rem] text-fg-muted">
          Ventes du Z {periode}, contre le coût matière des fiches techniques au prix d’achat moyen. Rouge : on perd de l’argent.
        </p>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Ventes (Z)" value={formatMoney(vue.revenue)} icon={<Receipt className="size-4" />} tone="accent"
            hint={rent.unpricedCount > 0 ? `${rent.unpricedCount} plat(s) vendu(s) sans prix : le total est incomplet.` : `${vue.plats.length} plat(s) vendu(s)`} />
          <StatTile label="Coût matière des ventes" value={formatMoney(vue.cost)} icon={<ShoppingCart className="size-4" />}
            hint={rent.unrecipedCount > 0 ? `${rent.unrecipedCount} plat(s) vendu(s) sans fiche : le coût est incomplet.` : 'Fiches techniques × prix d’achat moyen'} />
          <StatTile label="Marge" value={formatMoney(vue.margin)} unit={vue.marginRate !== null ? `${formatQty(vue.marginRate, 0)} %` : undefined} tone={tonMarge}
            icon={vue.margin < -1e-9 ? <AlertTriangle className="size-4" /> : <Coins className="size-4" />}
            hint={vue.margin < -1e-9 ? 'On vend moins cher que ce que ça coûte.' : vue.revenue > 0 ? 'Ventes moins coût matière.' : 'Aucune vente valorisée sur la période.'} />
          {choisi ? (
            <StatTile label="Livré au département" value={formatMoney(vue.deliveredValue)} icon={<Warehouse className="size-4" />}
              hint={vue.deliveredValue > vue.cost + 1e-9 ? `${formatMoney(vue.deliveredValue - vue.cost)} sortis de plus que les ventes n’expliquent.` : 'Ce que le stock général lui a livré.'} />
          ) : (
            <StatTile label="Acheté (entrées)" value={formatMoney(rent.purchasedValue)} icon={<Warehouse className="size-4" />}
              hint={rent.purchasedValue > 0 ? `Arrivages ${periode}, tels que facturés.` : 'Aucune entrée saisie sur la période.'} />
          )}
        </div>
        <ProfitPanel plats={vue.plats} articles={vue.articles} departements={nomsDep} global={!choisi} />
      </section>

      <h2 className="mb-3 flex items-center gap-2 text-[1.05rem] font-bold text-fg">
        <Coins className="size-4 text-accent" />
        Livré aux départements
      </h2>
      {montres.length === 0 || (choisi && montres[0].lineCount === 0) ? (
        <GlassCard>
          <EmptyState icon={<Coins className="size-6" />} title="Rien de livré sur cette période" description="Les montants apparaissent dès qu'un bon de livraison est émis." />
        </GlassCard>
      ) : (
        <div className={cn('grid gap-4', choisi ? 'grid-cols-1' : 'lg:grid-cols-2')}>
          {[...montres].sort((x, y) => y.amount - x.amount).map((d) => (
            <GlassCard key={d.department.id}>
              <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
                <p className="flex min-w-0 items-center gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: d.department.color }}>
                    <Icon name={d.department.icon ?? 'Building2'} className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[0.98rem] font-bold text-fg">{d.department.name}</span>
                    <span className="block text-[0.74rem] text-fg-muted">{d.lineCount} ligne{d.lineCount > 1 ? 's' : ''} livrée{d.lineCount > 1 ? 's' : ''}</span>
                  </span>
                </p>
                <p className="shrink-0 text-right text-[1.25rem] font-bold tabular-nums text-fg">{formatMoney(d.amount)}</p>
              </div>
              <ul className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
                {(choisi ? d.items : d.items.slice(0, 8)).map((i) => (
                  <li key={i.productId} className="flex items-center justify-between gap-3 px-4 py-2 text-[0.83rem] sm:px-5">
                    <span className="min-w-0 truncate text-fg">{i.productName}</span>
                    <span className="shrink-0 tabular-nums text-fg-muted">{formatQty(i.quantity)} {i.unitSymbol}</span>
                    <span className="w-28 shrink-0 text-right font-semibold tabular-nums text-fg">{formatMoney(i.amount)}</span>
                  </li>
                ))}
                {!choisi && d.items.length > 8 ? (
                  <li className="px-4 py-2 sm:px-5">
                    <Link href={lienDep(d.department.id)} className="text-[0.8rem] font-semibold text-accent hover:underline">
                      … et {d.items.length - 8} autre(s) article(s) — voir tout
                    </Link>
                  </li>
                ) : null}
              </ul>
            </GlassCard>
          ))}
        </div>
      )}
    </>
  )
}
