'use client'

import * as React from 'react'
import Link from 'next/link'
import { Search, AlertTriangle, UtensilsCrossed, X, ChevronDown } from 'lucide-react'
import { TableWrap, Th, Td } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { FamilyBand } from '@/components/ui/family-band'
import { FilterBadge, FilterReset } from '@/components/ui/filter-badge'
import { useRouter } from 'next/navigation'
import { InlineEdit } from '@/components/ui/inline-edit'
import { useToast } from '@/components/ui/toast'
import { gql, errorMessage } from '@/lib/graphql-client'
import { cn, formatQty, formatShortDay } from '@/lib/utils'
import { correspond } from '@/lib/search'

export type ControlLine = {
  productId: string
  productName: string
  productRef: string
  categoryName: string
  unitSymbol: string
  stockFixe: number
  countedStock: number | null
  quantityAsked: number | null
  quantityServed: number | null
  gap: number
  countedPrev: number | null
  countedPrevOn: string | null
  deliveredSince: number
  soldSince: number
  soldFromZ: number
  soldDeclared: number
  expected: number | null
  variance: number | null
  /** Les plats de la carte qui consomment cet article, et combien par portion. */
  dishes: { recipeId: string; name: string; perPortion: number }[]
}

export type ControlGroup = {
  department: { id: string; name: string; code: string; color: string; icon: string | null }
  lineCount: number
  uncountedCount: number
  soldOn: string | null
  zMissing: boolean
  /** Les plats du service : le filtre « ingrédients de… ». */
  recipes: { recipeId: string | null; name: string; articleCount: number; preparation: boolean; salesItemId: string | null }[]
  lines: ControlLine[]
}

const SET_SALE = /* GraphQL */ `
  mutation SetDeclaredSale($departmentId: ID!, $productId: ID!, $day: Date!, $quantity: Float!) {
    setDeclaredSale(departmentId: $departmentId, productId: $productId, day: $day, quantity: $quantity)
  }
`

/**
 * La feuille d'un service, vue du contrôle.
 *
 * Mêmes colonnes et mêmes familles que l'écran de l'économat : le contrôle
 * doit pouvoir lire la même ligne que le magasin sans la retrouver ailleurs.
 */
export function ControlTable({ group, day, zPath, fichesPath }: {
  group: ControlGroup
  /** La journée contrôlée, pour recharger après une saisie. */
  day: string
  /** L'écran de saisie du Z, quand l'espace en a un : le contrôle, pas l'administration. */
  zPath: string | null
  /** L'écran des fiches techniques, pour écrire celle qui manque. */
  fichesPath: string
}) {
  const router = useRouter()
  const { push } = useToast()
  const [search, setSearch] = React.useState('')
  // Le plat choisi : la feuille ne montre plus que ses ingrédients, avec ce
  // qu'une portion en consomme.
  const [plat, setPlat] = React.useState<string | null>(null)
  const [rechPlat, setRechPlat] = React.useState('')
  // Le menu des plats reste replié : un bouton l'ouvre, la sélection le referme.
  const [menuOuvert, setMenuOuvert] = React.useState(false)
  const platChoisi = plat ? group.recipes.find((r) => r.recipeId === plat) ?? null : null
  // Vendu se saisit dans la colonne : le contrôle lit son Z et écrit, article
  // par article, ce que le rayon a vendu la journée du comptage précédent.
  const declarer = async (l: ControlLine, brut: string) => {
    const q = Number(brut.replace(',', '.'))
    if (!Number.isFinite(q) || q < 0) return 'Un nombre positif, ou 0 pour effacer.'
    if (!group.soldOn) return 'Aucun comptage précédent : rien à quoi rattacher cette vente.'
    try {
      await gql(SET_SALE, { departmentId: group.department.id, productId: l.productId, day: group.soldOn, quantity: q })
      push('success', q > 0 ? `${l.productName} : ${formatQty(q)} ${l.unitSymbol} vendu(s) le ${formatShortDay(group.soldOn)}.` : `${l.productName} : vente déclarée effacée.`)
      router.refresh()
    } catch (e) {
      return errorMessage(e)
    }
  }
  void day
  const [etat, setEtat] = React.useState<'ECART' | 'NON_COMPTE' | null>(null)

  // L'écart qui compte est celui de la formule : compté ≠ théorique.
  const enEcart = (l: ControlLine) => l.variance !== null && Math.abs(l.variance) > 1e-9
  const counts = React.useMemo(() => ({
    ecarts: group.lines.filter(enEcart).length,
    nonComptes: group.lines.filter((l) => l.countedStock === null).length,
  }), [group.lines])

  // Le rang est celui de la feuille, figé avant tout filtrage : renuméroter
  // une liste filtrée ferait que « l'article 16 » changerait de sens.
  const numerotees = React.useMemo(
    () => group.lines.map((l, i) => ({ ...l, rang: i + 1 })),
    [group.lines],
  )

  const affichees = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return numerotees.filter((l) => {
      if (plat && !l.dishes.some((d) => d.recipeId === plat)) return false
      if (etat === 'ECART' && !enEcart(l)) return false
      if (etat === 'NON_COMPTE' && l.countedStock !== null) return false
      if (!q) return true
      return l.productName.toLowerCase().includes(q) || l.productRef.toLowerCase().includes(q)
    })
  }, [numerotees, search, etat, plat])

  const parFamille = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const l of affichees) m.set(l.categoryName, (m.get(l.categoryName) ?? 0) + 1)
    return m
  }, [affichees])

  const c = group.department.color
  // La journée du comptage précédent, pour l'en-tête : la même pour toute
  // la feuille, puisqu'elle vient de la dernière commande du service.
  const veille = group.lines.find((l) => l.countedPrevOn)?.countedPrevOn ?? null
  const veilleLabel = veille ? formatShortDay(veille) : null

  return (
    <section
      className="overflow-hidden rounded-[calc(var(--radius)+4px)] border border-[rgb(var(--glass-edge)/0.26)] bg-white/45 backdrop-blur-xl"
    >
      <header
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-3 sm:px-5"
        style={{
          borderColor: `${c}26`,
          background: `linear-gradient(120deg, ${c}1f, ${c}0a 70%, transparent)`,
        }}
      >
        <h2 className="flex min-w-0 items-center gap-2.5">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-sm"
            style={{ background: `linear-gradient(140deg, ${c}, ${c}bb)` }}
          >
            <Icon name={group.department.icon ?? 'Building2'} className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[1.15rem] font-bold leading-tight text-fg sm:text-[1.05rem]">
              {group.department.name}
            </span>
            <span className="block text-[0.85rem] font-medium text-fg sm:text-[0.78rem]">
              {group.lineCount} article{group.lineCount > 1 ? 's' : ''} sur sa feuille
            </span>
          </span>
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          {counts.ecarts > 0 ? (
            <FilterBadge
              tone="warn"
              actif={etat === 'ECART'}
              onClick={() => setEtat(etat === 'ECART' ? null : 'ECART')}
              label={etat === 'ECART'
                ? 'Afficher de nouveau tous les articles'
                : `N’afficher que les ${counts.ecarts} article(s) sous leur cible`}
            >
              {counts.ecarts} sous la cible
            </FilterBadge>
          ) : null}
          {counts.nonComptes > 0 ? (
            <FilterBadge
              tone="warn"
              actif={etat === 'NON_COMPTE'}
              onClick={() => setEtat(etat === 'NON_COMPTE' ? null : 'NON_COMPTE')}
              label={etat === 'NON_COMPTE'
                ? 'Afficher de nouveau tous les articles'
                : `N’afficher que les ${counts.nonComptes} article(s) non comptés`}
            >
              {counts.nonComptes} non compté{counts.nonComptes > 1 ? 's' : ''}
            </FilterBadge>
          ) : null}
          {etat !== null ? (
            <FilterReset total={group.lineCount} onClick={() => setEtat(null)} />
          ) : null}
        </div>
      </header>

      <div className="p-3 sm:p-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un article ou une référence…"
            aria-label={`Rechercher un article — ${group.department.name}`}
            className="field w-full py-2.5 pl-9 pr-3 text-[0.9rem]"
          />
        </label>
      </div>

      {group.zMissing && group.soldOn ? (
        <p className="mx-3 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-warn/35 bg-warn/[0.10] px-3 py-2 text-[0.82rem] text-fg sm:mx-4">
          <AlertTriangle className="size-4 shrink-0 text-warn" />
          <span>
            Aucun Z saisi pour le <strong>{formatShortDay(group.soldOn)}</strong> : la colonne Vendu ne compte que ce qui est déclaré ici à la main.
          </span>
          {zPath ? (
            <Link href={`${zPath}?jour=${group.soldOn}`} className="font-semibold text-accent hover:underline">Saisir le Z du {formatShortDay(group.soldOn)}</Link>
          ) : null}
        </p>
      ) : null}
      {/* Les plats de la carte : une pastille chacun. Cliquer un plat ne
          garde que ses ingrédients ; la recherche filtre les pastilles quand
          la carte est longue. */}
      {group.recipes.length > 0 ? (
        <div className="mx-3 mb-3 rounded-xl border border-[rgb(var(--glass-edge)/0.22)] bg-white/40 p-2.5 sm:mx-4">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setMenuOuvert((v) => !v)} aria-expanded={menuOuvert}
              className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[0.78rem] font-semibold transition-colors',
                menuOuvert ? 'border-accent/40 bg-accent/12 text-accent' : 'border-[rgb(var(--glass-edge)/0.34)] bg-white/70 text-fg hover:bg-white')}>
              <UtensilsCrossed className="size-3.5" />
              {menuOuvert ? 'Fermer le menu' : 'Ouvrir le menu'}
              <span className="text-[0.7rem] font-medium opacity-70">({group.recipes.length})</span>
              <ChevronDown className={cn('size-3.5 transition-transform', menuOuvert && 'rotate-180')} />
            </button>
            {platChoisi ? (
              <button type="button" onClick={() => setPlat(null)} className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/12 px-2.5 py-0.5 text-[0.78rem] font-semibold text-accent">
                <X className="size-3.5" />{platChoisi.name} · {platChoisi.articleCount} ingrédient{platChoisi.articleCount > 1 ? 's' : ''}
              </button>
            ) : null}
            {menuOuvert ? (
              <input value={rechPlat} onChange={(e) => setRechPlat(e.target.value)} placeholder="Filtrer les plats…" aria-label="Filtrer les plats" autoFocus
                className="field h-8 w-44 px-2.5 text-[0.8rem]" />
            ) : null}
          </div>
          {menuOuvert ? (
          <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {group.recipes.filter((r) => correspond(rechPlat, r.name)).map((r) => r.recipeId ? (
              <button key={r.recipeId} type="button" onClick={() => { setPlat(plat === r.recipeId ? null : r.recipeId); setMenuOuvert(false) }} aria-pressed={plat === r.recipeId}
                title={r.preparation ? 'Préparation : ce qu’elle consomme de la feuille' : 'Plat de la carte : ses ingrédients'}
                className={cn('inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[0.76rem] font-semibold transition-colors',
                  plat === r.recipeId ? 'border-accent bg-accent text-white' : r.preparation ? 'border-warn/40 bg-warn/[0.08] text-fg hover:border-warn' : 'border-[rgb(var(--glass-edge)/0.3)] bg-white/70 text-fg hover:border-accent/50 hover:bg-accent/[0.06]')}>
                {r.name}<span className={cn('text-[0.68rem] font-medium', plat === r.recipeId ? 'text-white/80' : 'text-fg-subtle')}>({r.articleCount})</span>
              </button>
            ) : (
              /* Sans fiche : le plat existe à la carte mais on ne sait pas
                 ce qu'il consomme. Le lien mène là où on l'écrit. */
              <Link key={`s${r.salesItemId}`} href={`${fichesPath}?q=${encodeURIComponent(r.name)}`} title="Pas encore de fiche technique : cliquer pour l’écrire"
                className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-[rgb(var(--glass-edge)/0.45)] bg-white/40 px-2.5 text-[0.76rem] font-medium text-fg-subtle hover:border-accent/50 hover:text-accent">
                {r.name}<span className="text-[0.66rem]">sans fiche</span>
              </Link>
            ))}
          </div>
          ) : null}
          {menuOuvert && group.recipes.some((r) => !r.recipeId) ? (
            <p className="mt-1.5 text-[0.72rem] text-fg-subtle">{group.recipes.filter((r) => !r.recipeId).length} plat(s) de la carte sans fiche technique : ils n’entrent pas encore dans la colonne Vente.</p>
          ) : null}
        </div>
      ) : null}
      <TableWrap minWidth="62rem">
        <thead>
          <tr>
            <Th className="w-10 text-right">#</Th>
            <Th className="w-full">Article</Th>
            {/* La même chaîne que partout ailleurs : la cible, ce que le
                service a compté, ce qu'il a demandé, ce qu'il a reçu. */}
            {/* La formule se lit de gauche à droite : la cible, le stock
                d'hier soir, ce qui est arrivé, ce qui s'est vendu, ce qu'il
                devrait rester (théorique) ; puis ce que le rayon a réellement
                compté, et l'écart entre les deux. */}
            <Th className="text-center">Stock fixe</Th>
            <Th className="text-center">
              Stock lberah <span className="normal-case tracking-normal text-fg-subtle">{veilleLabel ? `(${veilleLabel})` : '(la veille)'}</span>
            </Th>
            <Th className="text-center">Livré</Th>
            <Th className="text-center">Vente</Th>
            <Th className="text-center">Théorique <span className="normal-case tracking-normal text-fg-subtle">(reste)</span></Th>
            <Th className="text-center">Son stock réel</Th>
            <Th className="text-center">Écart</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
          {affichees.map((l, i) => {
            const nonCompte = l.countedStock === null
            const ouvre = i === 0 || affichees[i - 1].categoryName !== l.categoryName
            return (
              <React.Fragment key={l.productId}>
                {ouvre ? (
                  <FamilyBand
                    name={l.categoryName}
                    count={parFamille.get(l.categoryName) ?? 0}
                    colSpan={9}
                  />
                ) : null}
                <tr className={cn(enEcart(l) && (l.variance! < 0 ? 'bg-danger/[0.07]' : 'bg-warn/[0.08]'))}>
                  <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{l.rang}</Td>
                  <Td className="max-w-0">
                    <p className="truncate text-[0.85rem] font-medium text-fg">{l.productName}</p>
                    <p className="truncate font-mono text-[0.7rem] text-fg-subtle">{l.productRef}</p>
                    {/* Le plat choisi : ce qu'une portion prend de cet article.
                        Sinon, le nombre de plats qui l'utilisent, la liste au survol. */}
                    {platChoisi ? (
                      <p className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-accent/12 px-1.5 py-0.5 text-[0.72rem] font-semibold text-accent">
                        <UtensilsCrossed className="size-3" />
                        {formatQty(l.dishes.find((d) => d.recipeId === plat)?.perPortion ?? 0)} {l.unitSymbol} par portion
                      </p>
                    ) : l.dishes.length > 0 ? (
                      <button type="button" onClick={() => setPlat(l.dishes[0].recipeId)}
                        title={l.dishes.map((d) => `${d.name} · ${formatQty(d.perPortion)} ${l.unitSymbol}/portion`).join('\n')}
                        className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-[rgb(var(--glass-edge)/0.16)] px-1.5 py-0.5 text-[0.7rem] font-medium text-fg-muted hover:bg-accent/12 hover:text-accent">
                        <UtensilsCrossed className="size-3" />{l.dishes.length} plat{l.dishes.length > 1 ? 's' : ''}
                      </button>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap text-center tabular-nums text-fg-subtle">
                    {formatQty(l.stockFixe)} {l.unitSymbol}
                  </Td>
                  <Td className="whitespace-nowrap text-center tabular-nums text-fg-muted">
                    {l.countedPrev === null ? <span className="text-fg-subtle" title="Le rayon n’a pas été compté à la commande précédente.">—</span> : `${formatQty(l.countedPrev)} ${l.unitSymbol}`}
                  </Td>
                  <Td className={cn('whitespace-nowrap text-center tabular-nums', l.deliveredSince > 0 ? 'font-medium text-info' : 'text-fg-subtle')}>
                    {l.deliveredSince > 0 ? `+${formatQty(l.deliveredSince)} ${l.unitSymbol}` : '—'}
                  </Td>
                  <Td className="whitespace-nowrap text-center tabular-nums">
                    {/* Double-clic pour écrire : la part venue du Z et des fiches
                        reste calculée, la saisie s'y ajoute. */}
                    <span className="inline-flex flex-col items-center leading-tight">
                      <InlineEdit
                        value={l.soldDeclared > 0 ? String(l.soldDeclared) : ''}
                        display={l.soldSince > 0 ? `−${formatQty(l.soldSince)} ${l.unitSymbol}` : '—'}
                        onSave={(v) => declarer(l, v === '' ? '0' : v)}
                        ariaLabel={`Vendu — ${l.productName}`}
                        title={group.soldOn ? `Double-cliquez pour saisir ce que le rayon a vendu le ${formatShortDay(group.soldOn)}` : undefined}
                        align="right"
                        className={cn('min-w-[4.5rem] rounded-lg border border-dashed px-2 py-0.5', l.soldSince > 0 ? 'border-warn/45 font-medium text-warn' : 'border-[rgb(var(--glass-edge)/0.4)] text-fg-subtle')}
                        inputClassName="w-20 text-center"
                        validate={(v) => (v === '' || /^\d+([.,]\d+)?$/.test(v) ? null : 'Nombre attendu.')}
                      />
                      {l.soldFromZ > 0 ? (
                        <span className="text-[0.66rem] text-fg-subtle" title="D'après le Z et les fiches techniques">dont Z {formatQty(l.soldFromZ)}</span>
                      ) : null}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap text-center tabular-nums">
                    {l.expected === null ? (
                      <span className="text-fg-subtle" title="Aucun comptage précédent : la formule ne peut pas s’appliquer.">—</span>
                    ) : (
                      <span className="font-semibold text-fg">{formatQty(l.expected)} {l.unitSymbol}</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-center font-medium tabular-nums">
                    {/* Sans commande ce jour-là, le rayon n'a pas été déclaré :
                        un zéro laisserait croire à un rayon vide. */}
                    {nonCompte ? (
                      <span className="text-fg-subtle">—</span>
                    ) : (
                      <span className="font-bold text-fg">{formatQty(l.countedStock!)} {l.unitSymbol}</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-center font-bold tabular-nums">
                    {l.variance === null ? (
                      <span className="text-fg-subtle">—</span>
                    ) : Math.abs(l.variance) < 1e-9 ? (
                      <span className="text-ok">✓</span>
                    ) : (
                      <span className={l.variance < 0 ? 'text-danger' : 'text-warn'}>{l.variance > 0 ? '+' : '−'}{formatQty(Math.abs(l.variance))} {l.unitSymbol}</span>
                    )}
                  </Td>
                </tr>
              </React.Fragment>
            )
          })}
        </tbody>
      </TableWrap>

      {affichees.length === 0 ? (
        <p className="px-4 py-6 text-center text-[0.85rem] text-fg-muted">
          Aucun article ne correspond à ce filtre.
        </p>
      ) : null}
    </section>
  )
}
