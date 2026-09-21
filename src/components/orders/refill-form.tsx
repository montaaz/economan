'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ListChecks, PackageCheck, Plus, Printer, RotateCcw, X } from 'lucide-react'
import { Button, Badge, TableWrap, Th, Td } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { FamilyBand, countByFamily } from '@/components/ui/family-band'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import { gql, errorMessage } from '@/lib/graphql-client'
import { cn, formatQty, toNumber } from '@/lib/utils'

const ADD_REFILL = /* GraphQL */ `
  mutation AddRefill($id: ID!, $lines: [RefillInput!]!) {
    addRefill(id: $id, lines: $lines) { id rank }
  }
`

const CANCEL_SERVICE = /* GraphQL */ `
  mutation CancelService($id: ID!, $rank: Int!) {
    cancelService(id: $id, rank: $rank) { id }
  }
`

export type RefillLigne = {
  id: string
  orderId: string
  orderRef: string
  productName: string
  productRef: string
  categoryName: string
  unitSymbol: string
  quantityAsked: number
  quantityServed: number | null
  quantityRefilled: number
  /** Le détail par passage, pour afficher et annuler chacun. */
  refills: { rank: number; quantity: number }[]
  status: 'PENDING' | 'VALIDATED' | 'ADJUSTED' | 'REJECTED'
}

export type RefillService = {
  id: string
  nom: string
  couleur: string
  icone: string | null
  lignes: RefillLigne[]
  /** Rang du prochain passage, par commande. */
  rangs: Record<string, number>
  /** Les passages enregistrés, pour imprimer leur bon. */
  passages: { id: string; rank: number; orderRef: string }[]
  /** La journée affichée, pour cibler le bon du département. */
  jour: string
}

/** Ce qui reste à servir sur une ligne, tous passages confondus. */
function reste(l: RefillLigne): number {
  return Math.max(l.quantityAsked - (l.quantityServed ?? 0) - l.quantityRefilled, 0)
}

/**
 * Saisie d'un service complémentaire.
 *
 * La marchandise manquante est arrivée : l'économat complète ce qui n'avait
 * pas pu sortir, ruptures et quantités ajustées ensemble — c'est la même
 * tournée. Chaque commande produit son propre bon, qui ne porte que ce qui
 * sort à ce passage.
 */
export function RefillForm({ service }: { service: RefillService }) {
  const router = useRouter()
  const { push } = useToast()
  const confirmer = useConfirm()
  const [busy, setBusy] = React.useState(false)
  // Une colonne par passage à préparer. Le « + » en ouvre une nouvelle : on
  // peut ainsi préparer le 2ᵉ et le 3ᵉ service côte à côte, et comparer.
  const [colonnes, setColonnes] = React.useState<{ cle: number }[]>([])
  const [saisie, setSaisie] = React.useState<Record<string, Record<string, string>>>({})
  // Les bons du dernier passage enregistré : c'est maintenant qu'on les
  // imprime, pas en retrouvant la commande plus tard.
  const [bons, setBons] = React.useState<{ id: string; ref: string; rang: number }[]>([])

  // Une ligne entièrement servie n'attend plus rien : elle sort de la saisie
  // mais reste visible, pour qu'on voie qu'elle est soldée.
  const aServir = service.lignes.filter((l) => reste(l) > 0)

  const parFamille = countByFamily(service.lignes)

  /** Ce qui est déjà saisi sur une ligne, dans les autres colonnes. */
  const saisiAilleurs = (id: string, sauf: number) =>
    colonnes.reduce(
      (n, c) => (c.cle === sauf ? n : n + toNumber(saisie[String(c.cle)]?.[id] ?? '')),
      0,
    )

  const set = (cle: number, id: string, v: string) => {
    const n = v.replace(',', '.')
    if (n !== '' && !/^\d*\.?\d*$/.test(n)) return
    const ligne = service.lignes.find((l) => l.id === id)
    // Le reste se partage entre les colonnes : deux passages préparés
    // ensemble ne peuvent pas servir deux fois la même quantité.
    const dispo = ligne ? reste(ligne) - saisiAilleurs(id, cle) : 0
    if (ligne && n !== '' && toNumber(n) > dispo) {
      push('error',
        `${ligne.productName} : il ne reste que ${formatQty(dispo)} ${ligne.unitSymbol} à répartir.`)
      return
    }
    setSaisie((s) => ({ ...s, [String(cle)]: { ...(s[String(cle)] ?? {}), [id]: n } }))
  }

  // Les passages déjà enregistrés, tous articles confondus : chacun a sa
  // colonne en lecture, avec son X pour l'annuler.
  // Le dernier passage de chaque commande : c'est lui qu'on imprime, jamais
  // le premier service — son bon est déjà parti avec la livraison.
  const rangDernier = Math.max(0, ...service.passages.map((p) => p.rank))
  const dernierPassage = service.passages.filter((p) => p.rank === rangDernier)

  const rangsServis = React.useMemo(() => {
    const v = new Set<number>()
    for (const l of service.lignes) for (const r of l.refills) v.add(r.rank)
    return [...v].sort((a, b) => a - b)
  }, [service.lignes])

  // Le rang se déduit de la position, jamais figé à la création : fermer une
  // colonne du milieu renumérote les suivantes, sinon deux « 3ᵉ service »
  // coexistaient après une fermeture puis une réouverture.
  // Le prochain rang tient compte des passages déjà enregistrés, y compris
  // ceux que la page vient de recharger : sinon une colonne ouverte porterait
  // le même numéro qu'un service existant.
  const base = Math.max(1, ...Object.values(service.rangs), ...rangsServis)
  const rangDe = (cle: number) => base + colonnes.findIndex((c) => c.cle === cle) + 1

  const ajouterColonne = () =>
    setColonnes((c) => [...c, { cle: Date.now() + c.length }])

  /** Ferme une colonne de saisie ; confirme si elle porte des quantités. */
  const fermerColonne = async (cle: number) => {
    if (compte(cle) > 0) {
      const ok = await confirmer({
        title: 'Supprimer cette colonne ?',
        message: `${compte(cle)} ligne(s) y sont saisies. Elles seront perdues : rien `
          + 'n’a encore été enregistré.',
        confirmLabel: 'Supprimer',
        tone: 'warn',
      })
      if (!ok) return
    }
    retirerColonne(cle)
  }

  const retirerColonne = (cle: number) => {
    setColonnes((c) => c.filter((x) => x.cle !== cle))
    setSaisie((s) => {
      const n = { ...s }
      delete n[String(cle)]
      return n
    })
  }

  const toutServir = (cle: number) => {
    const valeurs: Record<string, string> = {}
    for (const l of aServir) {
      const dispo = reste(l) - saisiAilleurs(l.id, cle)
      if (dispo > 0) valeurs[l.id] = String(dispo)
    }
    setSaisie((s) => ({ ...s, [String(cle)]: valeurs }))
    push('info', `${Object.keys(valeurs).length} ligne(s) au reste à servir.`)
  }

  const vider = (cle: number) =>
    setSaisie((s) => ({ ...s, [String(cle)]: {} }))

  /** Les lignes d'une colonne, groupées par commande : un bon par ticket. */
  const parCommande = React.useCallback((cle: number) => {
    const m = new Map<string, { ref: string; lines: { lineId: string; quantity: number }[] }>()
    for (const l of service.lignes) {
      const v = (saisie[String(cle)]?.[l.id] ?? '').trim()
      if (v === '' || toNumber(v) <= 0) continue
      const e = m.get(l.orderId) ?? { ref: l.orderRef, lines: [] }
      e.lines.push({ lineId: l.id, quantity: toNumber(v) })
      m.set(l.orderId, e)
    }
    return m
  }, [saisie, service.lignes])

  const compte = (cle: number) =>
    [...parCommande(cle).values()].reduce((n, c) => n + c.lines.length, 0)

  /**
   * Annule un passage complémentaire, après confirmation.
   *
   * Le premier service n'est pas concerné : son bon est parti, la marchandise
   * est sortie du magasin, et l'effacer ferait mentir un papier qui circule.
   */
  const annulerService = async (rang: number) => {
    const concernees = service.lignes.filter(
      (l) => l.refills.some((r) => r.rank === rang),
    ).length
    const ok = await confirmer({
      title: `Supprimer le ${rang}ᵉ service ?`,
      message: `Les ${concernees} ligne(s) servies à ce passage seront effacées, et les `
        + 'quantités redeviendront dues.',
      confirmLabel: 'Supprimer',
      tone: 'danger',
    })
    if (!ok) return

    setBusy(true)
    try {
      // Un même rang peut porter sur plusieurs tickets du département.
      const ids = [...new Set(
        service.lignes
          .filter((l) => l.refills.some((r) => r.rank === rang))
          .map((l) => l.orderId),
      )]
      for (const id of ids) await gql(CANCEL_SERVICE, { id, rank: rang })
      push('success', `Le ${rang}ᵉ service a été supprimé.`)
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const enregistrer = async (cle: number) => {
    const groupes = parCommande(cle)
    if (groupes.size === 0) {
      push('error', 'Saisissez au moins une quantité dans cette colonne.')
      return
    }
    setBusy(true)
    try {
      // Un passage par commande : les bons partent séparément, chacun vers
      // son ticket.
      const crees: { id: string; ref: string; rang: number }[] = []
      for (const [orderId, c] of groupes) {
        const d = await gql<{ addRefill: { id: string; rank: number } }>(ADD_REFILL, {
          id: orderId, lines: c.lines,
        })
        crees.push({ id: d.addRefill.id, ref: c.ref, rang: d.addRefill.rank })
      }
      setBons(crees)
      push('success',
        `${crees.length} commande(s) complétée(s) — le bon du ${crees[0].rang}ᵉ service est prêt.`)
      // La colonne enregistrée disparaît : son contenu est désormais en base,
      // et le « déjà servi » de chaque ligne l'intègre.
      retirerColonne(cle)
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Le dernier service enregistré : son bon s'imprime dès l'ouverture de
          la page, sans qu'il faille l'avoir saisi dans la session. */}
      {bons.length === 0 && dernierPassage.length > 0 ? (
        <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border border-info/30 bg-info/[0.08] px-4 py-3">
          <p className="text-[0.85rem] font-medium text-fg">
            {rangDernier}ᵉ service enregistré — imprimez le bon :
          </p>
          {/* Un seul bon pour le département : le même passage touche
              plusieurs commandes du rayon, et deux papiers pour une tournée
              ne servaient personne. */}
          <a
            href={`/api/bon-service/departement?dep=${service.id}&rang=${rangDernier}&jour=${service.jour}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-info/40 bg-white/70 px-2.5 py-1 text-[0.8rem] font-semibold text-info transition-colors hover:bg-white"
          >
            <Printer className="size-3.5" />
            Bon du {rangDernier}ᵉ service — {service.nom}
          </a>
        </div>
      ) : null}

      {/* Les bons du passage qu'on vient d'enregistrer : chacun ne porte que
          ce qui sort de ce coup-ci. */}
      {bons.length > 0 ? (
        <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border border-info/30 bg-info/[0.08] px-4 py-3">
          <p className="text-[0.85rem] font-medium text-fg">
            Service enregistré — imprimez le bon :
          </p>
          <a
            href={`/api/bon-service/departement?dep=${service.id}&rang=${bons[0].rang}&jour=${service.jour}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-info/40 bg-white/70 px-2.5 py-1 text-[0.8rem] font-semibold text-info transition-colors hover:bg-white"
          >
            <Printer className="size-3.5" />
            Bon du {bons[0].rang}ᵉ service — {service.nom}
          </a>
        </div>
      ) : null}

      {/* Une barre par colonne ouverte : chacune part séparément. */}
      {colonnes.map((c) => {
        const n = compte(c.cle)
        const rang = rangDe(c.cle)
        return (
          <div
            key={c.cle}
            className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ok/30 bg-ok/[0.07] px-4 py-3"
          >
            <p className="text-[0.85rem] leading-snug text-fg">
              <span className="font-bold">{rang}ᵉ service</span> — saisissez ce qui sort.
              {n > 0 ? (
                <span className="font-semibold text-ok"> {n} ligne{n > 1 ? 's' : ''} saisie{n > 1 ? 's' : ''}</span>
              ) : (
                <span className="text-fg-muted"> {aServir.length} ligne(s) en attente</span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => toutServir(c.cle)}>
                <ListChecks className="size-3.5" />
                Tout servir
              </Button>
              {n > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => vider(c.cle)}>
                  <RotateCcw className="size-3.5" />
                  Vider
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => retirerColonne(c.cle)}>
                <X className="size-3.5" />
                Fermer
              </Button>
              <Button
                variant="success"
                size="sm"
                loading={busy}
                onClick={() => void enregistrer(c.cle)}
              >
                {!busy ? <PackageCheck className="size-4" /> : null}
                Enregistrer le {rang}ᵉ service
              </Button>
            </div>
          </div>
        )
      })}

      <div className="overflow-hidden rounded-[calc(var(--radius)+4px)] border border-[rgb(var(--glass-edge)/0.26)] bg-white/45 backdrop-blur-xl">
        <header
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-3 sm:px-5"
          style={{
            borderColor: `${service.couleur}26`,
            background: `linear-gradient(120deg, ${service.couleur}1f, ${service.couleur}0a 70%, transparent)`,
          }}
        >
          <h2 className="flex min-w-0 items-center gap-2.5">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-sm"
              style={{ background: `linear-gradient(140deg, ${service.couleur}, ${service.couleur}bb)` }}
            >
              <Icon name={service.icone ?? 'Building2'} className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[1.15rem] font-bold leading-tight text-fg sm:text-[1.05rem]">
                {service.nom}
              </span>
              <span className="block text-[0.85rem] font-medium text-fg sm:text-[0.78rem]">
                {service.lignes.length} ligne{service.lignes.length > 1 ? 's' : ''} en écart
              </span>
            </span>
          </h2>
        </header>

        <TableWrap minWidth={`${46 + (rangsServis.length + colonnes.length) * 7}rem`}>
          <thead>
            <tr>
              <Th className="w-10 text-right">#</Th>
              <Th className="w-full">Article</Th>
              <Th className="text-right">Commande</Th>
              <Th className="text-right">1ᵉʳ servi</Th>
              {/* Les passages s'intercalent entre le premier service et le
                  reste : la ligne se lit alors dans l'ordre où elle s'est
                  jouée, et le reste conclut. */}
              {rangsServis.map((rang) => (
                <Th key={`servi-${rang}`} className="w-32 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    {rang}ᵉ service
                    {/* Ce passage est enregistré : le X l'annule en base. */}
                    <button
                      type="button"
                      onClick={() => void annulerService(rang)}
                      title={`Supprimer le ${rang}ᵉ service`}
                      aria-label={`Supprimer le ${rang}e service`}
                      className="grid size-5 place-items-center rounded-md text-danger transition-colors hover:bg-danger/15"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                </Th>
              ))}
              {colonnes.map((c) => (
                <Th key={c.cle} className="w-36 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    {rangDe(c.cle)}ᵉ service
                    {/* Celle-ci n'est qu'une saisie en cours : le X la ferme. */}
                    <button
                      type="button"
                      onClick={() => void fermerColonne(c.cle)}
                      title="Supprimer cette colonne"
                      aria-label={`Supprimer la colonne du ${rangDe(c.cle)}e service`}
                      className="grid size-5 place-items-center rounded-md text-fg-muted transition-colors hover:bg-[rgb(var(--glass-edge)/0.2)] hover:text-fg"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                </Th>
              ))}
              <Th className="text-right">Reste</Th>
              {/* État ferme le tableau : les colonnes de service s'intercalent
                  avant lui, et l'état conclut la ligne — c'est lui qu'on lit
                  après avoir saisi. */}
              <Th>
                <span className="inline-flex items-center gap-1.5">
                  État
                  {/* Le « + » ouvre une colonne de service : la marchandise
                      arrive en plusieurs fois, et chaque passage a la sienne. */}
                  <button
                    type="button"
                    onClick={ajouterColonne}
                    title="Ajouter un service"
                    aria-label="Ajouter une colonne de service"
                    className="grid size-6 place-items-center rounded-lg bg-ok text-white transition-colors hover:bg-ok/85"
                  >
                    <Plus className="size-4" />
                  </button>
                </span>
              </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
            {service.lignes.map((l, i) => {
              const r = reste(l)
              // Ce que les colonnes ouvertes ajoutent à cette ligne.
              const enCours = colonnes.reduce(
                (n, c) => n + toNumber(saisie[String(c.cle)]?.[l.id] ?? ''), 0,
              )
              const servi = (l.quantityServed ?? 0) + l.quantityRefilled
              // L'état suit la saisie : servir tout le reste solde la ligne,
              // en servir une partie la laisse ajustée — y compris une
              // rupture, qui cesse d'en être une dès qu'un peu sort.
              const soldee = r === 0 || enCours >= r
              const partiel = enCours > 0 && enCours < r
              return (
                <React.Fragment key={l.id}>
                  {i === 0 || service.lignes[i - 1].categoryName !== l.categoryName ? (
                    <FamilyBand
                      name={l.categoryName}
                      count={parFamille.get(l.categoryName) ?? 0}
                      colSpan={6 + rangsServis.length + colonnes.length}
                    />
                  ) : null}
                  <tr
                    className={cn(
                      // Vert dès que le reste est couvert, orange tant qu'il
                      // manque quelque chose, rouge si rien n'est encore sorti.
                      soldee && 'bg-ok/[0.14]',
                      !soldee && partiel && 'bg-warn/[0.12]',
                      !soldee && !partiel && l.status === 'REJECTED' && 'bg-danger/[0.06]',
                      !soldee && !partiel && l.status === 'ADJUSTED' && 'bg-warn/[0.07]',
                    )}
                  >
                    <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{i + 1}</Td>
                    <Td className="max-w-0">
                      <p className="truncate text-[0.85rem] font-medium text-fg">{l.productName}</p>
                      <p className="truncate font-mono text-[0.7rem] text-fg-subtle">
                        {l.productRef}
                        <span className="ml-2">{l.orderRef}</span>
                      </p>
                    </Td>
                    <Td className="whitespace-nowrap text-right font-semibold tabular-nums text-fg">
                      {formatQty(l.quantityAsked)} {l.unitSymbol}
                    </Td>
                    {/* Ce qui est réellement sorti, sans la saisie en cours :
                        celle-ci se lit dans sa propre colonne, et le reste
                        montre déjà ce qu'elle change. */}
                    <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">
                      {formatQty(servi)} {l.unitSymbol}
                    </Td>
                    {rangsServis.map((rang) => {
                      const q = l.refills.find((x) => x.rank === rang)?.quantity ?? 0
                      return (
                        <Td
                          key={`servi-${rang}`}
                          className="whitespace-nowrap text-right tabular-nums text-fg-muted"
                        >
                          {q > 0 ? `${formatQty(q)} ${l.unitSymbol}` : '—'}
                        </Td>
                      )
                    })}
                    {colonnes.map((c) => (
                      <Td key={c.cle} className="text-right">
                        {r === 0 ? (
                          <span className="text-[0.8rem] text-fg-subtle">—</span>
                        ) : (
                          /* L'unité auprès du champ : « 16 » seul ne dit pas
                             si ce sont des kilos ou des unités. */
                          <span className="inline-flex items-center gap-1.5">
                            <input
                              inputMode="decimal"
                              value={saisie[String(c.cle)]?.[l.id] ?? ''}
                              onChange={(e) => set(c.cle, l.id, e.target.value)}
                              placeholder="0"
                              aria-label={`${rangDe(c.cle)}e service — ${l.productName}`}
                              className="field h-9 w-20 px-2 py-0 text-right text-[0.85rem] tabular-nums"
                            />
                            <span className="w-6 text-left text-[0.78rem] font-medium text-fg-muted">
                              {l.unitSymbol}
                            </span>
                          </span>
                        )}
                      </Td>
                    ))}
                    <Td className="whitespace-nowrap text-right font-bold tabular-nums">
                      {/* Le reste se met à jour pendant la saisie : on voit
                          ce qui manquera encore après ce passage. */}
                      {soldee ? (
                        <span className="text-ok">—</span>
                      ) : (
                        <span className={cn(partiel ? 'text-warn' : 'text-danger')}>
                          {formatQty(r - enCours)} {l.unitSymbol}
                        </span>
                      )}
                    </Td>
                    <Td>
                      {soldee ? (
                        <Badge tone="ok">Soldé</Badge>
                      ) : partiel ? (
                        /* Une rupture partiellement servie n'en est plus une :
                           elle devient un ajustement. */
                        <Badge tone="warn">Ajusté</Badge>
                      ) : (
                        <Badge tone={l.status === 'REJECTED' ? 'danger' : 'warn'}>
                          {l.status === 'REJECTED' ? 'Rupture' : 'Ajusté'}
                        </Badge>
                      )}
                    </Td>
                  </tr>
                </React.Fragment>
              )
            })}
          </tbody>
        </TableWrap>
      </div>
    </div>
  )
}
