import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/server/db'
import { executeGraphQL } from '@/server/graphql/execute'
import { requireRole } from '@/server/auth/guards'
import { formatPeriod, formatQty } from '@/lib/utils'
import type { CumulLine } from '../cumul-articles'

export const metadata: Metadata = { title: 'Articles de toute la journée' }
export const dynamic = 'force-dynamic'

const QUERY = /* GraphQL */ `
  query ArticlesCumulesPapier($departmentId: ID!, $day: Date, $dayTo: Date) {
    dayArticles(departmentId: $departmentId, day: $day, dayTo: $dayTo) {
      productId productName productRef categoryName unitSymbol
      stockFixe quantityAsked quantityServed ticketCount status servedRank urgentAsked
    }
    dayBoard(day: $day, dayTo: $dayTo) {
      day dayTo isRange
      departments { department { id } orderCount }
    }
  }
`

const ETATS: Record<CumulLine['status'], { libelle: string; couleur: string; fond: string }> = {
  PENDING: { libelle: 'En attente', couleur: '#4a5f7d', fond: '' },
  VALIDATED: { libelle: 'Servi', couleur: '#0b7a55', fond: '' },
  ADJUSTED: { libelle: 'Ajusté', couleur: '#b4630f', fond: '#fdf1e3' },
  REJECTED: { libelle: 'Rupture', couleur: '#d63f5a', fond: '#fdeaee' },
}

/**
 * Les articles cumulés d'un département, sur papier.
 *
 * Le même contenu que l'écran, mis en page pour une feuille A4 : toutes
 * les colonnes tiennent, les familles se suivent, et la part venue d'une
 * commande urgente porte la flèche verte ▲, comme sur les bons. C'est
 * cette page que le serveur rend en PDF.
 */
export default async function ArticlesCumulesImprimerPage({
  searchParams,
}: {
  searchParams: Promise<{ dep?: string; jour?: string; jusquau?: string; etat?: string; rang?: string; q?: string }>
}) {
  await requireRole(['ECONOMAN', 'ADMIN'], '/economat/login')
  const { dep, jour, jusquau, etat, rang, q } = await searchParams
  const departmentId = Number(dep)
  if (!Number.isInteger(departmentId)) notFound()

  const [department, data] = await Promise.all([
    prisma.department.findUnique({ where: { id: departmentId }, select: { name: true } }),
    executeGraphQL<{ dayArticles: CumulLine[]; dayBoard: { day: string; dayTo: string; isRange: boolean; departments: { department: { id: string }; orderCount: number }[] } }>(
      QUERY, { departmentId: String(departmentId), day: jour ?? null, dayTo: jusquau ?? null },
    ),
  ])
  if (!department) notFound()

  const board = data.dayBoard
  const tickets = board.departments.find((d) => d.department.id === String(departmentId))?.orderCount ?? 0
  // Le papier suit le filtre de l'écran, s'il y en a un.
  const mot = (q ?? '').trim().toLowerCase()
  const rangVoulu = rang ? Number(rang) : null
  const lignes = data.dayArticles.filter((l) =>
    (!etat || l.status === etat)
    && (rangVoulu === null || (l.status === 'VALIDATED' && l.servedRank === rangVoulu))
    && (!mot || l.productName.toLowerCase().includes(mot) || l.productRef.toLowerCase().includes(mot)))
  const urgents = lignes.filter((l) => l.urgentAsked > 0).length
  // Ce qui est sorti moins ce qui était commandé ; une rupture n'a rien sorti.
  const ecartDe = (l: CumulLine) => (l.status === 'REJECTED' ? 0 : l.quantityServed) - l.quantityAsked
  const traitees = lignes.filter((l) => l.status !== 'PENDING')
  const enMoins = traitees.filter((l) => ecartDe(l) < -1e-9).length
  const enPlus = traitees.filter((l) => ecartDe(l) > 1e-9).length
  const justes = traitees.length - enMoins - enPlus
  // Les totaux par unité : additionner des kilos et des bouteilles ne dirait rien.
  const totaux = [...lignes.reduce((m, l) => {
    const t = m.get(l.unitSymbol) ?? { unite: l.unitSymbol, commande: 0, servi: 0, reste: 0 }
    const servi = l.status === 'REJECTED' ? 0 : l.quantityServed
    t.commande += l.quantityAsked; t.servi += servi; t.reste += Math.max(l.quantityAsked - servi, 0)
    return m.set(l.unitSymbol, t)
  }, new Map<string, { unite: string; commande: number; servi: number; reste: number }>()).values()].sort((a, b) => b.commande - a.commande)
  const compte = (s: CumulLine['status']) => lignes.filter((l) => l.status === s).length
  const filtre = [etat ? ETATS[etat as CumulLine['status']]?.libelle : null, rangVoulu ? `Servi ${rangVoulu}` : null, mot ? `« ${q} »` : null].filter(Boolean).join(' · ')

  return (
    <div className="bg-white px-1 py-1 text-[0.74rem] leading-tight text-[#0f1e33]">
      <header className="flex items-end justify-between gap-4 border-b-2 border-[#0f1e33] pb-1">
        <div>
          <h1 className="text-[1.05rem] font-bold leading-tight">Articles de toute la journée — {department.name}</h1>
          <p className="text-[0.76rem] capitalize">{formatPeriod(board.day, board.isRange ? board.dayTo : null)}</p>
        </div>
        <div className="text-right">
          <p className="text-[0.95rem] font-bold leading-none">{lignes.length} article{lignes.length > 1 ? 's' : ''}</p>
          <p className="text-[0.72rem]">{tickets} ticket{tickets > 1 ? 's' : ''}</p>
        </div>
      </header>
      <p className="mt-1 flex flex-wrap gap-x-4 text-[0.72rem]">
        <span><strong>{compte('VALIDATED')}</strong> servis</span>
        <span className="text-[#b4630f]"><strong>{compte('ADJUSTED')}</strong> ajustés</span>
        <span className="text-[#d63f5a]"><strong>{compte('REJECTED')}</strong> ruptures</span>
        {compte('PENDING') > 0 ? <span><strong>{compte('PENDING')}</strong> en attente</span> : null}
        {urgents > 0 ? <span className="font-semibold text-[#0f9b6c]">▲ {urgents} article{urgents > 1 ? 's' : ''} en commande urgente</span> : null}
        {filtre ? <span className="italic text-[#4a5f7d]">Filtre : {filtre}</span> : null}
      </p>

      <table className="mt-1 w-full table-fixed border-collapse">
        <thead>
          <tr className="border-y border-[#0f1e33] bg-[#f0f4fa]">
            <th className="w-6 px-1 py-0.5 text-right font-semibold">#</th>
            <th className="px-1 py-0.5 text-left font-semibold">Article</th>
            <th className="w-10 px-1 py-0.5 text-right font-semibold">Tick.</th>
            <th className="w-12 px-1 py-0.5 text-right font-semibold">Fixe</th>
            <th className="w-20 px-1 py-0.5 text-right font-semibold">Commande</th>
            <th className="w-16 px-1 py-0.5 text-right font-semibold">Servi</th>
            <th className="w-16 px-1 py-0.5 text-right font-semibold">Reste</th>
            <th className="w-16 px-1 py-0.5 text-left font-semibold">État</th>
          </tr>
        </thead>
        <tbody>
          {lignes.length === 0 ? (
            <tr><td colSpan={8} className="px-2 py-6 text-center text-[#4a5f7d]">Aucun article sur cette période.</td></tr>
          ) : null}
          {lignes.map((l, i) => {
            const e = ETATS[l.status]
            const ouvre = i === 0 || lignes[i - 1].categoryName !== l.categoryName
            return (
              <FamilleEtLigne key={l.productId} ouvre={ouvre} famille={l.categoryName} nombre={lignes.filter((x) => x.categoryName === l.categoryName).length}>
                <tr className="border-b border-[#e3e9f3]" style={e.fond ? { background: e.fond } : undefined}>
                  <td className="px-1 py-px text-right tabular-nums text-[#4a5f7d]">{i + 1}</td>
                  <td className="max-w-0 truncate whitespace-nowrap px-1 py-px">
                    <span className="font-medium">{l.productName}</span>
                    <span className="ml-1 font-mono text-[0.62rem] text-[#4a5f7d]">{l.productRef}</span>
                  </td>
                  <td className="px-1 py-px text-right tabular-nums">{l.ticketCount}</td>
                  <td className="whitespace-nowrap px-1 py-px text-right tabular-nums text-[#4a5f7d]">{formatQty(l.stockFixe)}</td>
                  <td className="whitespace-nowrap px-1 py-px text-right font-semibold tabular-nums">
                    {/* La part urgente : en plus du stock fixe, flèche verte. */}
                    {l.urgentAsked > 0 ? <span className="mr-1 font-bold text-[#0f9b6c]">▲</span> : null}
                    {formatQty(l.quantityAsked)} <span className="text-[0.64rem] font-normal text-[#4a5f7d]">{l.unitSymbol}</span>
                  </td>
                  <td className="whitespace-nowrap px-1 py-px text-right font-semibold tabular-nums" style={{ color: e.couleur }}>
                    {l.status === 'PENDING' ? '' : l.status === 'REJECTED' ? '—' : `${formatQty(l.quantityServed)} ${l.unitSymbol}`}
                  </td>
                  {/* L'écart : ce qui est sorti moins ce qui était commandé. */}
                  <td className="whitespace-nowrap px-1 py-px text-right font-semibold tabular-nums">
                    {l.status === 'PENDING' ? null : (() => {
                      const d = ecartDe(l)
                      if (Math.abs(d) < 1e-9) return <span className="text-[#4a5f7d]">=</span>
                      return (
                        <span style={{ color: d < 0 ? '#b4630f' : '#0f9b6c' }}>
                          {d < 0 ? '▼' : '▲'} {formatQty(Math.abs(d))} <span className="text-[0.64rem] font-normal">{l.unitSymbol}</span>
                        </span>
                      )
                    })()}
                  </td>
                  <td className="whitespace-nowrap px-1 py-px font-semibold" style={{ color: e.couleur }}>
                    {l.status === 'VALIDATED' && l.servedRank > 0 ? `Servi ${l.servedRank}` : e.libelle}
                  </td>
                </tr>
              </FamilleEtLigne>
            )
          })}
        </tbody>
      </table>

      {/* La barre des totaux : par unité, ce qui a été commandé, servi, et
          l'écart ; puis combien de lignes sont en moins, en plus, justes. */}
      {lignes.length > 0 ? (
        <div className="mt-1.5 break-inside-avoid border-y-2 border-[#0f1e33] bg-[#f0f4fa] px-2 py-1.5">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.06em]">Total de la journée</p>
          <table className="mt-0.5 w-full border-collapse text-[0.74rem]">
            <thead>
              <tr className="text-[#4a5f7d]">
                <th className="w-16 py-px text-left font-semibold">Unité</th>
                <th className="py-px text-right font-semibold">Commandé</th>
                <th className="py-px text-right font-semibold">Servi</th>
                <th className="py-px text-right font-semibold">Écart</th>
                <th className="py-px text-right font-semibold">Reste à servir</th>
              </tr>
            </thead>
            <tbody>
              {totaux.map((t) => (
                <tr key={t.unite} className="border-t border-[#d5dfee]">
                  <td className="py-px font-semibold">{t.unite}</td>
                  <td className="py-px text-right font-semibold tabular-nums">{formatQty(t.commande)}</td>
                  <td className="py-px text-right font-semibold tabular-nums text-[#0b7a55]">{formatQty(t.servi)}</td>
                  <td className="py-px text-right font-bold tabular-nums" style={{ color: Math.abs(t.servi - t.commande) < 1e-9 ? '#4a5f7d' : t.servi < t.commande ? '#b4630f' : '#0f9b6c' }}>
                    {Math.abs(t.servi - t.commande) < 1e-9 ? '=' : `${t.servi < t.commande ? '▼' : '▲'} ${formatQty(Math.abs(t.servi - t.commande))}`}
                  </td>
                  <td className="py-px text-right font-semibold tabular-nums">{formatQty(t.reste)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 flex flex-wrap gap-x-4 text-[0.72rem]">
            <span><strong>{justes}</strong> ligne{justes > 1 ? 's' : ''} servie{justes > 1 ? 's' : ''} juste</span>
            <span className="text-[#b4630f]"><strong>▼ {enMoins}</strong> en moins</span>
            <span className="text-[#0f9b6c]"><strong>▲ {enPlus}</strong> en plus</span>
          </p>
        </div>
      ) : null}

      {urgents > 0 ? (
        <p className="mt-1.5 text-[0.68rem] text-[#4a5f7d]">
          <span className="font-bold text-[#0f9b6c]">▲</span> commande urgente : en plus du stock fixe du rayon
        </p>
      ) : null}
    </div>
  )
}

function FamilleEtLigne({ ouvre, famille, nombre, children }: { ouvre: boolean; famille: string; nombre: number; children: React.ReactNode }) {
  return (
    <>
      {ouvre ? (
        <tr className="border-y border-[#b9c8e0] bg-[#e8eefa]">
          <td colSpan={8} className="px-1 py-px text-[0.68rem] font-bold uppercase tracking-[0.05em]">
            {famille} <span className="font-normal text-[#4a5f7d]">({nombre})</span>
          </td>
        </tr>
      ) : null}
      {children}
    </>
  )
}
