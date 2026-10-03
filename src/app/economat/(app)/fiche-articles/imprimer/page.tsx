import type { Metadata } from 'next'
import { requireRole } from '@/server/auth/guards'
import { prisma } from '@/server/db'
import { generalStock } from '@/server/services/stock'
import { correspond, normaliser } from '@/lib/search'
import { businessDay, formatLongDate, formatQty } from '@/lib/utils'

export const metadata: Metadata = { title: 'Fiche articles' }
export const dynamic = 'force-dynamic'

/** 0,25 kg se lit « 250 gr » : c'est ainsi qu'on parle d'une portion. */
function contenu(q: number, unit: string): string {
  if (unit === 'kg' && q < 1) return `${formatQty(q * 1000)} gr`
  if (unit === 'L' && q < 1) return `${formatQty(q * 1000)} ml`
  return `${formatQty(q)} ${unit}`
}

/**
 * Les fiches d'articles, sur papier.
 *
 * Le même contenu que l'écran, dans le même ordre, sous le même filtre :
 * tout, un département, ou les articles sans département. C'est cette page
 * que le serveur rend en PDF ; elle ne porte ni bouton ni saisie.
 */
export default async function FicheArticlesImprimerPage({
  searchParams,
}: {
  searchParams: Promise<{ dep?: string; q?: string }>
}) {
  await requireRole(['ECONOMAN', 'ADMIN'], '/economat/login')
  const { dep, q } = await searchParams
  const filtre = dep && dep !== 'tous' ? dep : 'tous'
  const mot = normaliser(q ?? '')

  const [stock, departements, unites, categories] = await Promise.all([
    generalStock(),
    prisma.department.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, color: true } }),
    prisma.unit.findMany({ select: { symbol: true, name: true } }),
    prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true } }),
  ])
  const lignes = stock.lines
  const nomUnite = (s: string) => (unites.find((u) => u.symbol.toLowerCase() === s.toLowerCase())?.name ?? (s === 'p' ? 'portion' : s)).toLowerCase()
  const departement = departements.find((d) => String(d.id) === filtre) ?? null

  // Les familles du catalogue, chacune avec ses articles — comme l'écran.
  const familles = categories
    .map((c) => {
      const parNom = mot !== '' && correspond(mot, c.name)
      return {
        famille: c,
        articles: lignes
          .filter((l) => l.categoryId === String(c.id) && l.kind !== 'MERE'
            && (filtre === 'tous' || (filtre === 'aucun' ? l.departmentIds.length === 0 : l.departmentIds.includes(filtre)))
            && (mot === '' || parNom || correspond(mot, l.productName, l.productRef, l.mother?.productName)))
          .sort((a, b) => a.productName.localeCompare(b.productName)),
      }
    })
    .filter((f) => f.articles.length > 0)

  const total = familles.reduce((n, f) => n + f.articles.length, 0)
  const titre = filtre === 'tous' ? 'Tous les départements' : filtre === 'aucun' ? 'Sans département' : (departement?.name ?? 'Département')
  // Sous un département, sa colonne ne dirait que son nom : on la retire.
  const colonneDep = filtre === 'tous' || filtre === 'aucun'
  // La numérotation court d'une famille à l'autre, comme sur les bons.
  const numero = new Map(familles.flatMap((f) => f.articles).map((a, i) => [a.productId, i + 1]))

  return (
    <div className="mx-auto max-w-[190mm] bg-white px-6 py-4 text-[0.86rem] text-[#0f1e33]">
      <header className="flex items-start justify-between gap-4 border-b-2 border-[#0f1e33] pb-2">
        <div>
          <h1 className="text-[1.3rem] font-bold leading-tight">Fiche articles</h1>
          <p className="text-[0.95rem] font-semibold">{titre}</p>
        </div>
        <div className="text-right">
          <p className="text-[1.2rem] font-bold leading-none">{total} article{total > 1 ? 's' : ''}</p>
          <p className="text-[0.8rem] capitalize">{formatLongDate(businessDay())}</p>
        </div>
      </header>
      {mot ? <p className="mt-1.5 text-[0.8rem] italic text-[#4a5f7d]">Recherche : « {q} »</p> : null}

      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr className="border-y border-[#0f1e33] bg-[#f0f4fa]">
            <th className="w-8 px-2 py-1.5 text-right font-semibold">#</th>
            <th className="px-2 py-1.5 text-left font-semibold">Article</th>
            <th className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">Composition</th>
            {colonneDep ? <th className="px-2 py-1.5 text-left font-semibold">Départements</th> : null}
            <th className="whitespace-nowrap px-2 py-1.5 text-right font-semibold">Stock fixe</th>
          </tr>
        </thead>
        <tbody>
          {familles.length === 0 ? (
            <tr><td colSpan={colonneDep ? 5 : 4} className="px-2 py-6 text-center text-[#4a5f7d]">Aucun article à imprimer.</td></tr>
          ) : null}
          {familles.map(({ famille, articles }) => (
            <FamilleImprimee key={famille.id} colonnes={colonneDep ? 5 : 4} nom={famille.name} nombre={articles.length}>
              {articles.map((a) => {
                const rang = numero.get(a.productId) ?? 0
                const deps = departements.filter((d) => a.departmentIds.includes(String(d.id)))
                const retenus = filtre === 'tous' || filtre === 'aucun' ? deps : deps.filter((d) => String(d.id) === filtre)
                const fixe = (id: number) => a.stockFixes.find((f) => f.departmentId === String(id))?.quantity ?? 0
                return (
                  <tr key={a.productId} className="border-b border-[#d5dfee] align-top">
                    <td className="px-2 py-1 text-right tabular-nums text-[#4a5f7d]">{rang}</td>
                    <td className="px-2 py-1">
                      <span className="font-medium">{a.productName}</span>
                      <span className="block text-[0.68rem] text-[#4a5f7d]">{a.unitSymbol}</span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 font-semibold">
                      {a.mother ? (() => {
                        const m = a.mother
                        const de = (id: number) => a.compositions.find((c) => c.departmentId === String(id))?.quantity ?? m.motherQuantity
                        const vals = deps.map((d) => de(d.id))
                        const uniforme = vals.every((v) => Math.abs(v - (vals[0] ?? m.motherQuantity)) < 1e-9)
                        return (
                          <>
                            {deps.length <= 1 || uniforme
                              ? <>{contenu(vals[0] ?? m.motherQuantity, m.unitSymbol)} par {nomUnite(a.unitSymbol)}</>
                              : deps.map((d) => <span key={d.id} className="block"><span className="font-normal text-[#4a5f7d]">{d.name} </span>{contenu(de(d.id), m.unitSymbol)}</span>)}
                            <span className="block text-[0.68rem] font-normal text-[#4a5f7d]">de {m.productName}</span>
                          </>
                        )
                      })() : a.kind === 'MERE' || a.portions.length > 0 ? <span className="font-normal text-[#4a5f7d]">article pur · base de {a.portions.length} préparé{a.portions.length > 1 ? 's' : ''}</span>
                        : <span className="font-normal text-[#4a5f7d]">—</span>}
                    </td>
                    {colonneDep ? (
                      <td className="px-2 py-1">
                        {deps.length === 0 ? <span className="text-[#4a5f7d]">—</span>
                          : deps.length === departements.length && departements.length > 1 ? 'Tous les départements'
                            : deps.map((d) => d.name).join(', ')}
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                      {retenus.length === 0 ? <span className="text-[#4a5f7d]">—</span>
                        : retenus.length === 1 ? (
                          fixe(retenus[0].id) > 0
                            ? <span className="font-semibold">{formatQty(fixe(retenus[0].id))} <span className="text-[0.72rem] font-normal text-[#4a5f7d]">{a.unitSymbol}</span></span>
                            : <span className="text-[#b4630f]">à régler</span>
                        ) : retenus.map((d) => (
                          <span key={d.id} className="block">
                            <span className="text-[#4a5f7d]">{d.name} </span>
                            {fixe(d.id) > 0 ? <span className="font-semibold">{formatQty(fixe(d.id))} {a.unitSymbol}</span> : <span className="text-[#b4630f]">à régler</span>}
                          </span>
                        ))}
                    </td>
                  </tr>
                )
              })}
            </FamilleImprimee>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Le bandeau d'une famille du catalogue, suivi de ses articles. */
function FamilleImprimee({ colonnes, nom, nombre, children }: {
  colonnes: number; nom: string; nombre: number; children: React.ReactNode
}) {
  return (
    <>
      <tr className="border-y border-[#b9c8e0] bg-[#e8eefa]">
        <td colSpan={colonnes} className="px-2 py-1 text-[0.8rem]">
          <span className="font-bold uppercase tracking-[0.06em]">Famille {nom}</span>
          <span className="ml-2 text-[#4a5f7d]">({nombre})</span>
        </td>
      </tr>
      {children}
    </>
  )
}
