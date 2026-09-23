'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Check, CheckCircle2, ClipboardList, PackageCheck, Plus, Printer, RotateCcw,
  Truck, X,
  AlertCircle,
} from 'lucide-react'
import { Button, Badge, TableWrap, Th, Td, usePending } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { FamilyBand, groupSize } from '@/components/ui/family-band'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import { gql, errorMessage } from '@/lib/graphql-client'
import { cn, formatQty, formatTime, toNumber } from '@/lib/utils'
import { correspond, normaliser } from '@/lib/search'
import { SearchField } from '@/components/ui/search-field'

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
const COMPLETE_REFILL = /* GraphQL */ `
  mutation CompleteRefill($id: ID!, $rank: Int!, $lines: [RefillInput!]!) {
    completeRefill(id: $id, rank: $rank, lines: $lines) { id rank }
  }
`
const REOPEN_REFILL = /* GraphQL */ `
  mutation ReopenRefill($id: ID!) { reopenRefill(id: $id) }
`
const LOCK_REFILL = /* GraphQL */ `
  mutation LockRefill($id: ID!) { lockRefill(id: $id) }
`
const SET_REFILL_LINES = /* GraphQL */ `
  mutation SetRefillLines($id: ID!, $lines: [RefillInput!]!) { setRefillLines(id: $id, lines: $lines) }
`
const REOPEN_ORDER = /* GraphQL */ `
  mutation ReopenOrder($id: ID!) { reopenOrder(id: $id) { id } }
`
const CLOSE_ORDER = /* GraphQL */ `
  mutation CloseOrder($id: ID!) { closeOrder(id: $id) { id } }
`
const SET_SERVED = /* GraphQL */ `
  mutation SetServed($id: ID!, $lines: [ServedLineInput!]!) { setServedLines(id: $id, lines: $lines) { id } }
`

const DELIVER_REFILLS = /* GraphQL */ `
  mutation DeliverRefills($departmentId: ID!, $day: Date!, $ranks: [Int!]!) {
    deliverRefills(departmentId: $departmentId, day: $day, ranks: $ranks)
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
  /**
   * Ce qu'il reste à servir, calculé par le serveur avec la même règle que
   * sa garde.
   */
  remaining: number
  /** Numéro de la ligne sur son ticket : celui qu'on lit sur le papier. */
  rang: number
}

export type RefillService = {
  id: string
  nom: string
  couleur: string
  icone: string | null
  lignes: RefillLigne[]
  /** Rang du prochain passage, par commande. */
  rangs: Record<string, number>
  /**
   * Les passages enregistrés, pour imprimer leur bon — et savoir lesquels le
   * département a déjà réceptionnés : ceux-là ne se suppriment plus.
   */
  passages: {
    id: string
    rank: number
    orderId: string
    orderRef: string
    receivedAt: string | null
    receivedBy: { fullName: string } | null
    /** Quand son bon a été émis ; nul tant qu'il n'est qu'enregistré. */
    deliveredAt: string | null
  }[]
  /** La journée affichée, pour cibler le bon du département. */
  jour: string
}

/* ------------------------------------------------------------- brouillon */

const BROUILLON_PREFIXE = 'economan:ecarts:'

type Brouillon = {
  colonnes: { cle: number }[]
  saisie: Record<string, Record<string, string>>
  rattrapage: Record<string, Record<string, string>>
}

/** Le brouillon d'un rayon, ou rien s'il n'y en a pas ou s'il est illisible. */
function lireBrouillon(cle: string): Brouillon | null {
  try {
    const brut = window.localStorage.getItem(cle)
    if (!brut) return null
    const b = JSON.parse(brut) as Partial<Brouillon>
    return {
      colonnes: Array.isArray(b.colonnes) ? b.colonnes : [],
      saisie: b.saisie && typeof b.saisie === 'object' ? b.saisie : {},
      rattrapage: b.rattrapage && typeof b.rattrapage === 'object' ? b.rattrapage : {},
    }
  } catch {
    return null
  }
}

/** Pose le brouillon, ou l'efface quand il n'y a plus rien à garder. */
function ecrireBrouillon(cle: string, b: Brouillon | null) {
  try {
    if (b === null) window.localStorage.removeItem(cle)
    else window.localStorage.setItem(cle, JSON.stringify(b))
  } catch {
    // Stockage plein ou interdit : on travaille sans mémoire, sans casser.
  }
}

/**
 * Les brouillons des journées passées s'effacent d'eux-mêmes.
 *
 * Une saisie oubliée d'il y a deux semaines ne sert plus à personne, et le
 * navigateur n'a pas à la traîner. On garde une semaine : le temps de
 * revenir sur une journée qu'on n'a pas finie.
 */
function purgerBrouillons(jour: string) {
  try {
    const limite = new Date(jour)
    limite.setDate(limite.getDate() - 7)
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i)
      if (!k?.startsWith(BROUILLON_PREFIXE)) continue
      const j = k.slice(BROUILLON_PREFIXE.length, BROUILLON_PREFIXE.length + 10)
      const d = new Date(j)
      if (Number.isNaN(d.getTime()) || d < limite) window.localStorage.removeItem(k)
    }
  } catch {
    // Pas de stockage : rien à purger.
  }
}

/** « 2ᵉ servi » ou « 2ᵉ et 3ᵉ servi » : un seul papier, plusieurs passages. */
function libelleRangs(rangs: number[]): string {
  if (rangs.length === 0) return 'servi'
  if (rangs.length === 1) return `${rangs[0]}ᵉ servi`
  return `${rangs.slice(0, -1).map((r) => `${r}ᵉ`).join(', ')} et ${rangs[rangs.length - 1]}ᵉ servi`
}

/** Ce qui reste à servir sur une ligne, tous passages confondus. */
function reste(l: RefillLigne): number {
  return l.remaining
}

/**
 * Saisie d'un service complémentaire.
 *
 * La marchandise manquante est arrivée : l'économat complète ce qui n'avait
 * pas pu sortir, ruptures et quantités ajustées ensemble — c'est la même
 * tournée. Chaque commande produit son propre bon, qui ne porte que ce qui
 * sort à ce passage.
 */
export function RefillForm({
  service, etat = null, admin = false,
}: {
  service: RefillService
  /**
   * Ne montrer que les ruptures, ou que les ajustées.
   *
   * Les pastilles du haut de page filtrent la saisie en cours, elles ne
   * l'interrompent pas : on garde ses colonnes, ses quantités, et l'on ne
   * voit plus que la nature d'écart qu'on est en train de servir.
   */
  etat?: 'ADJUSTED' | 'REJECTED' | null
  /**
   * L'administration : elle seule rouvre un servi déjà posé — le premier ou
   * un complément — en pressant l'en-tête de sa colonne, pour en corriger
   * les quantités sur place.
   */
  admin?: boolean
}) {
  const router = useRouter()
  const { push } = useToast()
  const confirmer = useConfirm()
  /**
   * Un avertissement au milieu de l'écran, fermé d'un « OK ».
   *
   * Le toast en bas à droite passait inaperçu : on tapait un chiffre, rien
   * ne se passait, et le message s'effaçait avant qu'on ait tourné les yeux.
   * Une boîte centrée s'impose au regard et attend qu'on l'ait lue.
   */
  const prevenir = (title: string, message: string) => {
    void confirmer({
      title,
      message,
      single: true,
      tone: 'warn',
      confirmLabel: 'OK',
      icon: <AlertCircle className="size-6" />,
    })
  }
  const [busy, setBusy] = React.useState(false)
  // Les gestes des en-têtes (X d'un servi, réouverture) : un seul à la fois.
  const [gesteEnCours, runGeste] = usePending()
  // Une colonne par passage à préparer. Le « + » en ouvre une nouvelle : on
  // peut ainsi préparer le 2ᵉ et le 3ᵉ service côte à côte, et comparer.
  const [colonnes, setColonnes] = React.useState<{ cle: number }[]>([])
  const [saisie, setSaisie] = React.useState<Record<string, Record<string, string>>>({})
  // Les bons du dernier passage enregistré : c'est maintenant qu'on les
  // imprime, pas en retrouvant la commande plus tard.
  const [bons, setBons] = React.useState<{ id: string; ref: string; rang: number }[]>([])
  /** Les rangs que le bon qu'on vient d'émettre couvre. */
  const [rangsBon, setRangsBon] = React.useState<number[]>([])
  /**
   * Ce qu'on rattrape dans un passage déjà enregistré, par rang puis ligne.
   *
   * Un article oublié au 2ᵉ servi se saisit dans la colonne du 2ᵉ : c'est à
   * ce passage-là que le magasin le sort, et le bon doit le dire. Sa colonne
   * du 3ᵉ se ferme alors — on ne sert pas deux fois la même ligne.
   */
  const [rattrapage, setRattrapage] = React.useState<Record<string, Record<string, string>>>({})


  /** Ce qui est déjà saisi sur une ligne, dans les autres colonnes. */
  const saisiAilleurs = (id: string, sauf: number) =>
    colonnes.reduce(
      (n, c) => (c.cle === sauf ? n : n + toNumber(saisie[String(c.cle)]?.[id] ?? '')),
      0,
    )

  /** Saisie dans la colonne d'un passage déjà enregistré. */
  const setRattrapage_ = (rang: number, id: string, v: string) => {
    const n = v.replace(',', '.')
    if (n !== '' && !/^\d*\.?\d*$/.test(n)) return
    const ligne = service.lignes.find((l) => l.id === id)
    if (ligne && n !== '' && toNumber(n) > reste(ligne)) {
      prevenir('Quantité trop élevée',
        `${ligne.productName} : il ne reste que ${formatQty(reste(ligne))} ${ligne.unitSymbol} à servir.`)
      return
    }
    setRattrapage((s) => ({ ...s, [String(rang)]: { ...(s[String(rang)] ?? {}), [id]: n } }))
  }

  const set = (cle: number, id: string, v: string) => {
    const n = v.replace(',', '.')
    if (n !== '' && !/^\d*\.?\d*$/.test(n)) return
    const ligne = service.lignes.find((l) => l.id === id)
    // Le reste se partage entre les colonnes : deux passages préparés
    // ensemble ne peuvent pas servir deux fois la même quantité.
    const dispo = ligne ? reste(ligne) - saisiAilleurs(id, cle) : 0
    if (ligne && n !== '' && toNumber(n) > dispo) {
      prevenir('Quantité trop élevée',
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

  /**
   * Les passages enregistrés dont le bon n'est pas encore parti.
   *
   * Le bon les couvre tous : un servi enregistré sans bon reste invisible au
   * magasin, et l'imprimer seul ferait circuler deux papiers pour une même
   * tournée.
   */
  const rangsAEmettre = React.useMemo(() => {
    const v = new Set<number>()
    for (const p of service.passages) if (!p.deliveredAt) v.add(p.rank)
    return [...v].sort((a, b) => a - b)
  }, [service.passages])

  /**
   * Les passages qu'un enregistrement vient de modifier depuis leur bon.
   *
   * Compléter un passage déjà imprimé rend son papier incomplet : il faut le
   * réimprimer. Sans ce suivi, le bouton restait éteint après « Enregistrer »
   * — le passage porte pourtant de nouvelles lignes que personne n'a encore
   * vues au magasin.
   */
  const [rangsARenvoyer, setRangsARenvoyer] = React.useState<number[]>([])

  /** Tout ce qui attend un papier : jamais imprimé, ou modifié depuis. */
  const rangsSansBon = React.useMemo(
    () => [...new Set([...rangsAEmettre, ...rangsARenvoyer])].sort((a, b) => a - b),
    [rangsAEmettre, rangsARenvoyer],
  )

  /**
   * Les passages dont le bon est déjà parti.
   *
   * Le papier se perd, se déchire, se redemande : un bon émis doit rester
   * réimprimable, sur la même feuille que ses voisins. Sans cela, l'écran
   * n'offrait plus aucun chemin vers le papier une fois tout émis.
   */
  const rangsEmis = React.useMemo(() => {
    const v = new Set<number>()
    for (const p of service.passages) if (p.deliveredAt) v.add(p.rank)
    return [...v].sort((a, b) => a - b)
  }, [service.passages])

  /**
   * Un passage dont le bon est parti ne s'efface plus.
   *
   * Il reste complétable : on s'aperçoit d'un oubli après l'impression, et le
   * refuser obligerait à inventer un passage qui n'a pas eu lieu. Le papier
   * se réimprime, la marchandise reste rattachée au passage qui l'a sortie.
   */
  const rangEmis = React.useCallback(
    (rang: number) => service.passages.some((p) => p.rank === rang && p.deliveredAt),
    [service.passages],
  )

  /**
   * Ce que le bouton d'impression propose : les passages qu'on vient
   * d'émettre, sinon ceux créés dans cette session dont le bon est parti.
   * Un passage seulement enregistré n'a pas de papier : c'est le bouton
   * vert qui le fait partir, pas celui-ci.
   */
  const rangsImprimables = React.useMemo(() => {
    if (rangsBon.length > 0) return rangsBon
    return [...new Set(bons.map((b) => b.rang))].filter(rangEmis).sort((a, b) => a - b)
  }, [rangsBon, bons, rangEmis])

  const rangsServis = React.useMemo(() => {
    const v = new Set<number>()
    for (const l of service.lignes) for (const r of l.refills) v.add(r.rank)
    return [...v].sort((a, b) => a - b)
  }, [service.lignes])

  /**
   * La correction d'un servi déjà posé, par l'administration.
   *
   * On presse l'en-tête « 1ᵉʳ servi » ou « 2ᵉ servi », on confirme, et la
   * colonne s'ouvre : chaque quantité devient un champ, prérempli avec ce
   * qui est en base. « Enregistrer » récrit le passage — ou le premier
   * servi, ticket par ticket — puis referme ce qu'on avait rouvert. Rien ne
   * part avant. Un seul servi se corrige à la fois.
   */
  const [edition, setEdition] = React.useState<{ rang: number; saisie: Record<string, string> } | null>(null)

  /** Au plus, sur ce passage, pour cette ligne : ce que les autres laissent. */
  const plafondEdition = React.useCallback((l: RefillLigne, rang: number): number => {
    const autres = l.refills.filter((r) => r.rank !== rang).reduce((n, r) => n + r.quantity, 0)
    const premier = rang === 1 ? 0 : (l.quantityServed ?? 0)
    return Math.max(l.quantityAsked - premier - autres, 0)
  }, [])

  const ouvrirEdition = async (rang: number) => {
    if (!admin || busy) return
    if (edition) {
      prevenir('Correction en cours', `Enregistrez ou annulez d’abord la correction du ${edition.rang === 1 ? '1ᵉʳ' : `${edition.rang}ᵉ`} servi.`)
      return
    }
    const libelle = rang === 1 ? '1ᵉʳ servi' : `${rang}ᵉ servi`
    const ok = await confirmer({
      title: `Rouvrir le ${libelle} ?`,
      message: rang === 1
        ? 'Les commandes de ce rayon seront rouvertes le temps de corriger les quantités du premier servi. '
          + 'Elles seront refermées dans leur état à l’enregistrement, et leur bon devra être réimprimé.'
        : `Le bon de livraison du ${libelle} sera rouvert le temps de corriger ses quantités. `
          + 'Il devra être réémis après l’enregistrement.',
      confirmLabel: 'Rouvrir',
      tone: 'warn',
    })
    if (!ok) return
    setBusy(true)
    try {
      if (rang === 1) {
        // Chaque ticket du rayon ; celui déjà rouvert ne se plaint pas.
        for (const orderId of new Set(service.lignes.map((l) => l.orderId))) {
          await gql(REOPEN_ORDER, { id: orderId }).catch((e) => {
            if (!/déjà ouverte/.test(errorMessage(e))) throw e
          })
        }
      } else {
        const passage = service.passages.find((p) => p.rank === rang)
        if (passage) await gql(REOPEN_REFILL, { id: passage.id })
      }
      const saisie: Record<string, string> = {}
      for (const l of service.lignes) {
        const q = rang === 1 ? (l.quantityServed ?? 0) : (l.refills.find((r) => r.rank === rang)?.quantity ?? 0)
        if (q > 0 || rang === 1) saisie[l.id] = String(q)
      }
      setEdition({ rang, saisie })
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const poserEdition = (l: RefillLigne, v: string) => {
    if (!edition) return
    const n = v.replace(',', '.')
    if (n !== '' && !/^\d*\.?\d*$/.test(n)) return
    const plafond = plafondEdition(l, edition.rang)
    if (n !== '' && toNumber(n) > plafond) {
      prevenir('Quantité trop élevée', `${l.productName} : au plus ${formatQty(plafond)} ${l.unitSymbol} sur ce servi.`)
      return
    }
    setEdition((e) => (e ? { ...e, saisie: { ...e.saisie, [l.id]: n } } : e))
  }

  /** Referme ce que l'ouverture avait rouvert, sans rien enregistrer. */
  const refermerEdition = async (rang: number) => {
    if (rang === 1) {
      for (const orderId of new Set(service.lignes.map((l) => l.orderId))) {
        await gql(CLOSE_ORDER, { id: orderId }).catch(() => undefined)
      }
    } else {
      const passage = service.passages.find((p) => p.rank === rang)
      if (passage) await gql(LOCK_REFILL, { id: passage.id }).catch(() => undefined)
    }
  }

  const annulerEdition = async () => {
    if (!edition) return
    setBusy(true)
    try {
      await refermerEdition(edition.rang)
      setEdition(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const enregistrerEdition = async () => {
    if (!edition) return
    const { rang, saisie } = edition
    const libelle = rang === 1 ? '1ᵉʳ servi' : `${rang}ᵉ servi`
    const ok = await confirmer({
      title: `Enregistrer le ${libelle} ?`,
      message: `Les quantités du ${libelle} seront remplacées par celles saisies, puis le servi sera refermé. `
        + (rang === 1 ? 'Le bon de livraison devra être réimprimé.' : 'Son bon de livraison devra être réémis.'),
      confirmLabel: 'Enregistrer',
      tone: 'warn',
    })
    if (!ok) return
    setBusy(true)
    try {
      // Par ticket : chaque commande a son premier servi et ses passages.
      const parCommande = new Map<string, RefillLigne[]>()
      for (const l of service.lignes) {
        const acc = parCommande.get(l.orderId) ?? []
        acc.push(l)
        parCommande.set(l.orderId, acc)
      }
      for (const [orderId, lignes] of parCommande) {
        if (rang === 1) {
          const lines = lignes
            .filter((l) => saisie[l.id] !== undefined && toNumber(saisie[l.id]) !== (l.quantityServed ?? 0))
            .map((l) => {
              const q = toNumber(saisie[l.id])
              return q <= 0
                ? { lineId: l.id, status: 'REJECTED', rejectReason: 'Rupture' }
                : { lineId: l.id, status: 'ADJUSTED', quantityServed: q }
            })
          if (lines.length > 0) await gql(SET_SERVED, { id: orderId, lines })
          await gql(CLOSE_ORDER, { id: orderId }).catch(() => undefined)
        } else {
          const passage = service.passages.find((p) => p.rank === rang && p.orderId === orderId)
          if (!passage) continue
          const lines = lignes
            .filter((l) => saisie[l.id] !== undefined
              && toNumber(saisie[l.id]) !== (l.refills.find((r) => r.rank === rang)?.quantity ?? 0))
            .map((l) => ({ lineId: l.id, quantity: toNumber(saisie[l.id]) }))
          if (lines.length > 0) await gql(SET_REFILL_LINES, { id: passage.id, lines })
          // Le passage repart fermé ; son bon reste à réémettre, et le
          // bouton vert le proposera dès le rechargement.
        }
      }
      push('success', `${libelle} enregistré.`)
      setEdition(null)
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Le brouillon survit au changement de rayon.
   *
   * Passer de Cuisine à Bar démonte ce formulaire : sans mémoire, vingt
   * quantités tapées partaient avec lui. Le brouillon — colonnes ouvertes,
   * saisies, rattrapages — se garde donc dans le navigateur, par journée et
   * par rayon, tant que rien n'est enregistré. Au retour, il est relu et
   * confronté aux données du serveur : une ligne disparue ou déjà soldée
   * entre-temps est écartée, une quantité au-delà du reste est ramenée à
   * lui. Rien de ce qui est restauré ne peut donc contredire la base.
   */
  const cleBrouillon = `${BROUILLON_PREFIXE}${service.jour}:${service.id}`
  // Tant que le brouillon n'est pas relu, on n'écrit rien : l'état initial
  // vide écraserait ce qu'on vient chercher.
  const brouillonLu = React.useRef(false)

  React.useEffect(() => {
    brouillonLu.current = false
    const b = lireBrouillon(cleBrouillon)
    if (b) {
      const resteDe = new Map(service.lignes.map((l) => [l.id, reste(l)]))
      // Une saisie n'a de sens que sur une ligne connue à qui il reste
      // quelque chose ; au-delà du reste, on ramène au reste.
      const assainir = (par: Record<string, string>) => {
        const n: Record<string, string> = {}
        for (const [id, v] of Object.entries(par)) {
          const r = resteDe.get(id)
          if (r === undefined || r <= 0 || v === '') continue
          const q = toNumber(v)
          if (!Number.isFinite(q) || q <= 0) continue
          n[id] = q > r ? String(r) : v
        }
        return n
      }
      // Une seule colonne se prépare à la fois : un brouillon d'avant cette
      // règle n'en rend que la première.
      const colonnesOk = b.colonnes.filter((c) => Number.isFinite(c.cle)).slice(0, 1)
      const saisieOk: Record<string, Record<string, string>> = {}
      for (const c of colonnesOk) {
        const par = assainir(b.saisie[String(c.cle)] ?? {})
        if (Object.keys(par).length > 0) saisieOk[String(c.cle)] = par
      }
      const rattrapageOk: Record<string, Record<string, string>> = {}
      for (const [rang, par] of Object.entries(b.rattrapage)) {
        if (!rangsServis.includes(Number(rang))) continue
        const n = assainir(par)
        if (Object.keys(n).length > 0) rattrapageOk[rang] = n
      }
      if (colonnesOk.length > 0) setColonnes(colonnesOk)
      if (Object.keys(saisieOk).length > 0) setSaisie(saisieOk)
      if (Object.keys(rattrapageOk).length > 0) setRattrapage(rattrapageOk)
    }
    brouillonLu.current = true
    purgerBrouillons(service.jour)
    // On relit au changement de rayon ou de journée seulement : les lignes
    // se rafraîchissent après chaque enregistrement, et ce n'est pas le
    // moment de réinjecter un brouillon déjà posé en base.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleBrouillon])

  React.useEffect(() => {
    if (!brouillonLu.current) return
    const vide = colonnes.length === 0
      && !Object.values(saisie).some((par) => Object.values(par).some((v) => v !== ''))
      && !Object.values(rattrapage).some((par) => Object.values(par).some((v) => v !== ''))
    ecrireBrouillon(cleBrouillon, vide ? null : { colonnes, saisie, rattrapage })
  }, [cleBrouillon, colonnes, saisie, rattrapage])

  /**
   * Les lignes du tableau : celles qui attendent encore, et les soldées sur
   * demande.
   *
   * Une ligne soldée n'a plus rien à servir : la laisser en vert faisait
   * relire vingt lignes closes pour trouver celles qui attendent. Mais on
   * veut aussi pouvoir vérifier ce qui a été couvert par les passages
   * précédents — d'où la bascule, plutôt qu'un choix imposé dans un sens ou
   * dans l'autre.
   *
   * Les rangs, le X d'annulation et le bon restent calculés sur toutes les
   * lignes : un passage entièrement soldé se supprime et s'imprime toujours.
   */
  /**
   * Ce que le tableau montre.
   *
   * « attente » : ce qui reste à servir, la vue de travail. « toutes » :
   * tout, soldées comprises, pour vérifier. « servies » : uniquement ce qui
   * a été servi, en gris et en lecture seule — la relecture avant d'émettre
   * le bon, où l'on ne veut surtout rien modifier par mégarde.
   */
  const [vue, setVue] = React.useState<'attente' | 'toutes' | 'servies'>('attente')
  const voirSoldees = vue === 'toutes'

  /**
   * La barre des services disparaît pendant la relecture.
   *
   * Elle vit sur la page, au-dessus de ce formulaire : impossible de la
   * masquer par un état React sans remonter la relecture d'un cran. On pose
   * donc une marque sur le document, que la feuille de style lit — le temps
   * de vérifier, on ne change pas de rayon.
   */
  React.useEffect(() => {
    if (vue !== 'servies') return
    // Le rayon en relecture se nomme : les autres se retirent, on ne vérifie
    // qu'un service à la fois avant d'émettre son papier.
    document.body.dataset.relecture = service.id
    return () => { delete document.body.dataset.relecture }
  }, [vue, service.id])

  const enAttente = React.useMemo(
    () => service.lignes.filter((l) => reste(l) > 0 && (etat === null || l.status === etat)),
    [service.lignes, etat],
  )
  /**
   * Les lignes soldées par un passage complémentaire.
   *
   * Cet écran ne parle que de ce qui suit le premier service : une ligne que
   * le premier a close n'y a jamais rien attendu, et la compter parmi les
   * soldées faisait annoncer « 3 soldées » sur un rayon où aucun complément
   * n'était encore sorti.
   */
  const soldees = React.useMemo(
    () => service.lignes.filter(
      (l) => reste(l) === 0 && l.refills.some((r) => r.quantity > 0),
    ),
    [service.lignes],
  )
  /**
   * Les lignes servies : celles déjà en base, et celles qu'on vient de
   * saisir.
   *
   * Rien n'est enregistré avant le bon de livraison : la relecture doit donc
   * montrer la saisie en cours, sans quoi elle présenterait une feuille vide
   * juste avant d'émettre le papier.
   */
  const servies = React.useMemo(
    () => service.lignes.filter((l) => {
      // Les passages qui attendent leur papier, et celui qu'on vient
      // d'imprimer : après l'émission, la relecture doit encore montrer ce
      // que le bon portait, sinon l'écran se vide sous les yeux de celui qui
      // s'apprête à l'imprimer.
      const retenus = [...rangsSansBon, ...rangsBon]
      if (l.refills.some((r) => r.quantity > 0 && retenus.includes(r.rank))) return true
      const saisi = colonnes.reduce(
        (n, c) => n + toNumber(saisie[String(c.cle)]?.[l.id] ?? ''), 0,
      )
      const rattrape = Object.values(rattrapage)
        .reduce((n, par) => n + toNumber(par[l.id] ?? ''), 0)
      return saisi + rattrape > 0
    }),
    [service.lignes, colonnes, saisie, rattrapage, rangsSansBon, rangsBon],
  )

  // « Toutes » ajoute les soldées à ce qui attend, pas les lignes closes par
  // le seul premier service : celles-là ne concernent pas cet écran.
  // La recherche s'applique à la vue choisie, relecture comprise : on
  // retrouve une ligne sans quitter ce qu'on était en train de vérifier.
  const [recherche, setRecherche] = React.useState('')
  const mot = normaliser(recherche)
  const visibles = (vue === 'servies' ? servies
    : vue === 'toutes' ? service.lignes.filter((l) => enAttente.includes(l) || soldees.includes(l))
      : enAttente
  ).filter((l) => correspond(mot, l.productName, l.productRef, l.categoryName, l.orderRef))

  /**
   * Le seul passage où une ligne se rattrape : le premier qui ne lui a rien
   * sorti, bon non émis.
   *
   * Ouvrir toutes les colonnes vides à la fois posait la question à chaque
   * passage — 2ᵉ ou 3ᵉ ? — alors que la réponse est toujours la même : le
   * plus ancien, puisque c'est lui qu'on est en train de compléter. Les
   * suivants restent fermés tant que celui-là n'est pas soldé.
   */
  const rangRattrapable = React.useCallback(
    (l: RefillLigne): number | null => {
      // Rien à servir tant qu'aucune colonne n'est ouverte : on consulte le
      // tableau bien plus souvent qu'on ne sert, et des champs de saisie
      // partout donnaient une feuille en chantier permanent.
      if (colonnes.length === 0) return null
      // En relecture, rien ne se saisit : c'est tout l'objet de la vue.
      if (vue === 'servies') return null
      if (reste(l) <= 0) return null
      // Bon émis ou non : une ligne oubliée rejoint le passage qui l'a
      // laissée de côté, et son bon se réimprime. Le bon ne fige que ce qui
      // est déjà dessus — ces quantités-là ne se corrigent plus qu'avec
      // l'administration, depuis la fiche du servi.
      for (const rang of rangsServis) {
        const q = l.refills.find((x) => x.rank === rang)?.quantity ?? 0
        if (q === 0) return rang
      }
      return null
    },
    [rangsServis, colonnes.length, vue],
  )

  // Le rang se déduit de la position, jamais figé à la création : fermer une
  // colonne du milieu renumérote les suivantes, sinon deux « 3ᵉ service »
  // coexistaient après une fermeture puis une réouverture.
  // Le prochain rang tient compte des passages déjà enregistrés, y compris
  // ceux que la page vient de recharger : sinon une colonne ouverte porterait
  // le même numéro qu'un service existant.
  const base = Math.max(1, ...Object.values(service.rangs), ...rangsServis)
  const rangDe = (cle: number) => base + colonnes.findIndex((c) => c.cle === cle) + 1

  /**
   * Un seul passage se prépare à la fois.
   *
   * Tant que le bon du 2ᵉ servi n'est pas émis, sa colonne reste ouverte et
   * modifiable : ouvrir un 3ᵉ à côté ferait servir deux passages qui n'ont
   * pas encore eu lieu, et le second n'aurait de sens qu'après le premier.
   * Le « + » attend donc que le bon soit parti — la colonne disparaît alors,
   * et le passage suivant peut s'ouvrir.
   */
  const ajouterColonne = () => {
    if (colonnes.length > 0) {
      prevenir('Servi en cours',
        `Le ${rangDe(colonnes[0].cle)}ᵉ servi est encore ouvert : émettez son bon de livraison `
        + 'avant d’ouvrir le suivant.')
      return
    }
    setColonnes([{ cle: Date.now() }])
  }

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

  const vider = (cle: number) => {
    setSaisie((s) => ({ ...s, [String(cle)]: {} }))
    // Les rattrapages saisis dans les colonnes déjà servies partent avec :
    // « Réinitialiser » rend la feuille telle qu'elle était enregistrée.
    setRattrapage({})
  }

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
   * Les passages d'un rang, séparés selon que le département les a signés.
   *
   * Un même rang touche plusieurs tickets du rayon, et chacun se réceptionne
   * de son côté : un passage peut être reçu sur une commande et pas encore
   * sur l'autre.
   */
  const reception = (rang: number) => {
    const passages = service.passages.filter((p) => p.rank === rang)
    return {
      recus: passages.filter((p) => p.receivedAt),
      enAttente: passages.filter((p) => !p.receivedAt),
    }
  }

  /**
   * Annule un passage complémentaire, après confirmation.
   *
   * Le premier service n'est pas concerné : son bon est parti, la marchandise
   * est sortie du magasin, et l'effacer ferait mentir un papier qui circule.
   *
   * Un passage que le département a réceptionné ne s'efface pas non plus : il
   * a signé pour cette marchandise, et le serveur refuserait de toute façon.
   * Seuls les tickets encore en attente de réception sont touchés.
   */
  const annulerService = async (rang: number) => {
    if (rangEmis(rang)) {
      prevenir('Passage verrouillé',
        `Le bon de livraison du ${rang}ᵉ servi est émis : ce passage ne peut plus être supprimé.`)
      return
    }
    const { recus, enAttente } = reception(rang)
    if (enAttente.length === 0) {
      prevenir('Passage verrouillé',
        `Le ${rang}ᵉ servi a été réceptionné par le département : il ne peut plus être supprimé.`)
      return
    }
    const ids = enAttente.map((p) => p.orderId)
    const concernees = service.lignes.filter(
      (l) => ids.includes(l.orderId) && l.refills.some((r) => r.rank === rang),
    ).length
    const ok = await confirmer({
      title: `Supprimer le ${rang}ᵉ servi ?`,
      message: `Les ${concernees} ligne(s) servies à ce passage seront effacées, et les `
        + 'quantités redeviendront dues.'
        + (recus.length > 0
          ? ` ${recus.length} ticket(s) déjà réceptionné(s) à ce passage seront conservés.`
          : ''),
      confirmLabel: 'Supprimer',
      tone: 'danger',
    })
    if (!ok) return

    setBusy(true)
    try {
      for (const id of ids) await gql(CANCEL_SERVICE, { id, rank: rang })
      push('success', `Le ${rang}ᵉ servi a été supprimé.`)
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Émet le bon des passages qui l'attendent, sans passer par une colonne.
   *
   * C'est la fin de la relecture : on a vérifié ce qui a été servi, on sort
   * le papier. Les passages couverts se figent — ni saisie ni suppression
   * ensuite — et l'écran propose aussitôt de l'imprimer.
   */
  const emettreBon = async (cle?: number) => {
    // Rien n'a encore été écrit : le bon enregistre la saisie, puis l'émet.
    // C'est le seul geste qui pose le servi en base.
    const aSaisir = cle !== undefined && compte(cle) > 0
    const aRattraper = Object.values(rattrapage)
      .some((par) => Object.values(par).some((v) => toNumber(v) > 0))
    if (aSaisir || aRattraper) {
      // On reste sur la relecture : le papier sort d'ici, et repartir à la
      // saisie obligerait à revenir pour l'imprimer.
      await enregistrer(cle ?? colonnes[0]?.cle ?? 0, true)
      return
    }
    if (rangsSansBon.length === 0) return
    const lu = await confirmer({
      title: 'Bon de livraison',
      single: true,
      tone: 'info',
      confirmLabel: 'OK',
      icon: <Truck className="size-6" />,
      message: (
        <>
          <p className="font-semibold text-fg">
            La commande sera effectuée avec succès.
          </p>
          <p className="mt-2">
            Ensuite, vous n’aurez plus le droit de modifier ni de supprimer aucun
            article : la commande sera bloquée.
          </p>
        </>
      ),
    })
    if (!lu) return

    setBusy(true)
    try {
      await gql(DELIVER_REFILLS, {
        departmentId: service.id, day: service.jour, ranks: rangsSansBon,
      })
      setRangsARenvoyer([])
      setRangsBon(rangsSansBon)
      push('success', `Bon de livraison du ${libelleRangs(rangsSansBon)} — prêt à imprimer.`)
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Enregistre le passage saisi dans une colonne.
   *
   * `avertir` distingue les deux gestes de la barre : « Enregistrer » pose
   * le servi en base, « Bon de livraison » fait la même chose mais prévient
   * d'abord — passé ce point, plus personne ne corrige une quantité.
   */
  /** Ce qui a été tapé dans une colonne déjà émise, et n'est pas encore en base. */
  const rattrapagesEnAttente = Object.values(rattrapage)
    .reduce((n, par) => n + Object.values(par).filter((v) => toNumber(v) > 0).length, 0)

  /**
   * Envoie les rattrapages : ils complètent un passage existant, rang par
   * rang et commande par commande. Rend le nombre de passages touchés.
   */
  const envoyerRattrapages = async (): Promise<number> => {
    let touches = 0
    for (const [rang, parLigne] of Object.entries(rattrapage)) {
      const parCmd = new Map<string, { lineId: string; quantity: number }[]>()
      for (const [lineId, v] of Object.entries(parLigne)) {
        const q = toNumber(v)
        if (q <= 0) continue
        const ligne = service.lignes.find((l) => l.id === lineId)
        if (!ligne) continue
        const acc = parCmd.get(ligne.orderId) ?? []
        acc.push({ lineId, quantity: q })
        parCmd.set(ligne.orderId, acc)
      }
      for (const [orderId, lines] of parCmd) {
        await gql(COMPLETE_REFILL, { id: orderId, rank: Number(rang), lines })
      }
      // Ce passage a changé depuis son bon : il en faudra un nouveau.
      if (parCmd.size > 0) {
        touches += 1
        setRangsARenvoyer((v) => [...new Set([...v, Number(rang)])])
      }
    }
    return touches
  }

  /**
   * Imprimer un bon.
   *
   * Le papier se fabrique à partir de la base : ce qui a été tapé dans une
   * colonne déjà émise et pas encore enregistré n'y figurerait pas. On
   * l'envoie donc d'abord, puis on ouvre le bon — dans un onglet ouvert
   * avant l'attente, sinon le navigateur le prendrait pour une fenêtre
   * intempestive.
   */
  const imprimer = async (rangs: number[]) => {
    const url = `/api/bon-service/departement?dep=${service.id}&rang=${rangs.join(',')}&jour=${service.jour}`
    if (rattrapagesEnAttente === 0 || busy) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    const onglet = window.open('', '_blank')
    setBusy(true)
    try {
      await envoyerRattrapages()
      setRattrapage({})
      router.refresh()
      if (onglet) onglet.location.href = url
      else window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      onglet?.close()
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const enregistrer = async (cle: number, avertir = false) => {
    const groupes = parCommande(cle)
    const rattrapages = rattrapagesEnAttente
    if (groupes.size === 0 && rattrapages === 0) {
      // Rien de saisi, mais des passages attendent leur bon : on l'émet pour
      // eux. C'est le cas après « Enregistrer », qui vide la colonne sans
      // faire partir le papier.
      if (!avertir || rangsSansBon.length === 0) {
        prevenir('Rien à enregistrer', 'Saisissez au moins une quantité.')
        return
      }
    }

    if (avertir) {
      const lu = await confirmer({
        title: 'Bon de livraison',
        single: true,
        tone: 'info',
        confirmLabel: 'OK',
        icon: <Truck className="size-6" />,
        message: (
          <>
            <p className="font-semibold text-fg">
              La commande sera effectuée avec succès.
            </p>
            <p className="mt-2">
              Ensuite, vous n’aurez plus le droit de modifier ni de supprimer aucun
              article : la commande sera bloquée.
            </p>
          </>
        ),
      })
      if (!lu) return
    }

    setBusy(true)
    try {
      // Les rattrapages d'abord : ils complètent un passage existant, rang par
      // rang et commande par commande. Le nouveau passage vient ensuite, avec
      // ce qui reste.
      await envoyerRattrapages()

      // Un passage par commande : les bons partent séparément, chacun vers
      // son ticket.
      const crees: { id: string; ref: string; rang: number }[] = []
      for (const [orderId, c] of groupes) {
        const d = await gql<{ addRefill: { id: string; rank: number } }>(ADD_REFILL, {
          id: orderId, lines: c.lines,
        })
        crees.push({ id: d.addRefill.id, ref: c.ref, rang: d.addRefill.rank })
      }
      // Les rattrapages sont partis en base : l'écran repart des données
      // rechargées, sinon les champs garderaient des quantités déjà servies.
      setRattrapage({})
      // Un passage créé par « Enregistrer » attend lui aussi son papier : le
      // rechargement le dira, mais le bouton doit rester actif d'ici là.
      if (!avertir && crees.length > 0) {
        setRangsARenvoyer((v) => [...new Set([...v, ...crees.map((c) => c.rang)])])
        // Le bon précédent n'est plus « celui qu'on vient d'émettre ».
        setRangsBon([])
      }
      // Le bon couvre les passages en attente d'impression, celui-ci compris :
      // on les fige d'un coup, et le papier les portera tous.
      const rangsDuBon = avertir
        ? [...new Set([...rangsSansBon, ...crees.map((c) => c.rang)])].sort((a, b) => a - b)
        : []
      if (avertir && rangsDuBon.length > 0) {
        await gql(DELIVER_REFILLS, {
          departmentId: service.id, day: service.jour, ranks: rangsDuBon,
        })
        setRangsARenvoyer([])
        setRangsBon(rangsDuBon)
      }
      setBons(crees)
      push('success',
        crees.length === 0
          ? `${rattrapages} ligne(s) rattrapée(s) dans un servi existant.`
          : avertir
            ? `${crees.length} commande(s) complétée(s) — le bon de livraison du ${crees[0].rang}ᵉ servi est prêt.`
            : `${crees.length} commande(s) complétée(s) — le ${crees[0].rang}ᵉ servi est enregistré.`)
      // Le bon émis clôt le passage : la colonne disparaît, et il faut en
      // ouvrir une nouvelle pour servir de nouveau. « Enregistrer » la
      // laisse ouverte mais vidée — son contenu est en base, et le « déjà
      // servi » de chaque ligne l'intègre, mais on peut encore compléter.
      if (avertir) retirerColonne(cle)
      else vider(cle)
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3" data-rayon={service.id} data-relu={vue === 'servies' ? 'oui' : undefined}>
      {/* Le dernier service enregistré : son bon s'imprime dès l'ouverture de
          la page, sans qu'il faille l'avoir saisi dans la session. */}
      {vue !== 'servies' && bons.length === 0 && rangsAEmettre.length > 0 ? (
        <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border border-info/30 bg-info/[0.08] px-4 py-3">
          <p className="text-[0.85rem] font-medium text-fg">
            {libelleRangs(rangsAEmettre)} enregistré{rangsAEmettre.length > 1 ? 's' : ''} —
            imprimez le bon de livraison :
          </p>
          {/* Un seul bon pour le département : le même passage touche
              plusieurs commandes du rayon, et deux papiers pour une tournée
              ne servaient personne. */}
          <button
            type="button"
            onClick={() => void imprimer(rangsAEmettre)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-info/40 bg-white/70 px-2.5 py-1 text-[0.8rem] font-semibold text-info transition-colors hover:bg-white disabled:opacity-60"
          >
            <Printer className="size-3.5" />
            Bon de livraison du {libelleRangs(rangsAEmettre)} — {service.nom}
          </button>
        </div>
      ) : null}

      {/* Les bons du passage qu'on vient d'enregistrer : chacun ne porte que
          ce qui sort de ce coup-ci. */}
      {/* Le bon déjà émis, à portée de main : on le réimprime tel quel, sans
          rouvrir un passage ni chercher la commande. */}
      {vue !== 'servies' && bons.length === 0 && rangsEmis.length > 0 ? (
        <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border border-[rgb(var(--glass-edge)/0.28)] bg-white/50 px-4 py-3">
          <p className="text-[0.85rem] font-medium text-fg-muted">
            {libelleRangs(rangsEmis)} — bon de livraison déjà émis :
          </p>
          <button
            type="button"
            onClick={() => void imprimer(rangsEmis)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--glass-edge)/0.34)] bg-white/70 px-2.5 py-1 text-[0.8rem] font-semibold text-fg transition-colors hover:bg-white disabled:opacity-60"
          >
            <Printer className="size-3.5" />
            Réimprimer le bon — {service.nom}
          </button>
        </div>
      ) : null}

      {/* En relecture, le bouton d'impression vit dans la barre du rayon :
          ce bandeau ferait doublon juste au-dessus. */}
      {vue !== 'servies' && rangsImprimables.length > 0 ? (
        <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border border-info/30 bg-info/[0.08] px-4 py-3">
          <p className="text-[0.85rem] font-medium text-fg">
            Servi enregistré — imprimez le bon de livraison :
          </p>
          <button
            type="button"
            onClick={() => void imprimer(rangsImprimables)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-info/40 bg-white/70 px-2.5 py-1 text-[0.8rem] font-semibold text-info transition-colors hover:bg-white disabled:opacity-60"
          >
            <Printer className="size-3.5" />
            Bon de livraison du {libelleRangs(rangsImprimables)} — {service.nom}
          </button>
        </div>
      ) : null}

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
                {enAttente.length} ligne{enAttente.length > 1 ? 's' : ''} en écart
                {soldees.length > 0 ? (
                  <span className="text-fg-muted"> · {soldees.length} soldée{soldees.length > 1 ? 's' : ''}</span>
                ) : null}
              </span>
            </span>
          </h2>

          <SearchField value={recherche} onChange={setRecherche} className="w-full sm:w-64" />

          {/* La correction en cours a sa barre : elle remplace les gestes de
              saisie le temps qu'elle dure, pour qu'on ne mélange pas les deux. */}
          {edition ? (
            <div className="no-print flex flex-wrap items-center gap-2">
              <span className="text-[0.83rem] font-semibold text-warn">
                Correction du {edition.rang === 1 ? '1ᵉʳ' : `${edition.rang}ᵉ`} servi
              </span>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void annulerEdition()}>
                <X className="size-3.5" />
                Annuler
              </Button>
              <Button variant="primary" size="sm" loading={busy} onClick={() => void enregistrerEdition()}>
                {!busy ? <Check className="size-3.5" /> : null}
                Enregistrer le {edition.rang === 1 ? '1ᵉʳ' : `${edition.rang}ᵉ`} servi
              </Button>
            </div>
          ) : null}

          {/* Les actions d'une colonne ouverte vivent ici : elles portent sur
              ce tableau, et une barre de plus au-dessus éloignait le geste de
              son objet. */}
          {/* En relecture, la consigne prend la place des actions de saisie :
              c'est elle qu'on lit avant d'émettre, et les boutons du papier
              se rangent au bout de la ligne. */}
          {vue === 'servies' ? (
            <p className="no-print text-[0.85rem] font-semibold text-danger">
              Vérifiez la commande avant de passer au bon de livraison.
            </p>
          ) : null}

          {vue !== 'servies' && colonnes.length > 0 && !edition ? (
            <div className="no-print flex flex-wrap items-center gap-2">
              {colonnes.map((c) => {
                const n = compte(c.cle)
                  + Object.values(rattrapage)
                    .reduce((m, par) => m + Object.values(par).filter((v) => toNumber(v) > 0).length, 0)
                const rang = rangDe(c.cle)
                return (
                  <React.Fragment key={c.cle}>
                    <a
                      href={`/api/feuille-service?dep=${service.id}&rang=${rang}&jour=${service.jour}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[rgb(var(--glass-edge)/0.3)] bg-white/60 px-3 text-[0.8rem] font-medium text-fg transition-colors hover:bg-white"
                    >
                      <Printer className="size-3.5" />
                      Imprimer la feuille
                    </a>
                    {/* Toujours là, même sur une colonne vierge : c'est le
                        geste qu'on cherche après s'être trompé, et le voir
                        apparaître seulement une fois rempli le rendait
                        introuvable. */}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={n === 0}
                      onClick={() => vider(c.cle)}
                    >
                      <RotateCcw className="size-3.5" />
                      Réinitialiser
                    </Button>
                    {/* Enregistrer pose le servi sans rien annoncer ; le bon
                        de livraison fait de même, en prévenant que la
                        commande se fige. Deux gestes, une seule écriture. */}
                    {/* Le papier ne part plus d'ici : on relit d'abord ce qui
                        a été servi, puis on émet le bon depuis cette relecture.
                        Un bouton d'impression au milieu de la saisie invitait
                        à conclure avant d'avoir vérifié. */}
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={n === 0 && servies.length === 0}
                      // La relecture ne touche à rien : elle montre ce qui est
                      // en base et ce qui vient d'être saisi, côte à côte.
                      // Rien ne part en base avant le bon de livraison.
                      onClick={() => setVue('servies')}
                      className="h-auto flex-col items-center gap-0 py-1.5"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <ClipboardList className="size-4" />
                        Filtrer la commande
                      </span>
                      {/* Le compte sous le libellé : combien d'articles le bon
                          portera, sans avoir à ouvrir la relecture. */}
                      <span className="text-[0.72rem] font-medium opacity-70">
                        {servies.length} article{servies.length > 1 ? 's' : ''} servi{servies.length > 1 ? 's' : ''}
                      </span>
                    </Button>
                  </React.Fragment>
                )
              })}
            </div>
          ) : null}
          {/* Ce qui a été couvert par les passages précédents : masqué par
              défaut pour ne pas noyer ce qui attend, mais à portée de clic
              quand on veut vérifier qu'un article est bien sorti. */}
          <div className="no-print flex flex-wrap items-center gap-2">
            {/* Le tri des soldées appartient à la saisie : en relecture, on
                ne choisit plus ce qu'on regarde, on vérifie le bon. */}
            {vue !== 'servies' && soldees.length > 0 ? (
              <button
                type="button"
                onClick={() => setVue(vue === 'toutes' ? 'attente' : 'toutes')}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border',
                  'px-3 py-1.5 text-[0.78rem] font-semibold transition-colors',
                  vue === 'toutes'
                    ? 'border-ok/45 bg-ok/15 text-ok'
                    : 'border-ok/30 bg-white/60 text-ok hover:bg-ok/10',
                )}
              >
                <CheckCircle2 className="size-3.5" />
                {vue === 'toutes'
                  ? `Masquer les ${soldees.length} soldée${soldees.length > 1 ? 's' : ''}`
                  : `Voir les ${soldees.length} soldée${soldees.length > 1 ? 's' : ''}`}
              </button>
            ) : null}

            {/* Revenir à la saisie depuis la relecture : le seul chemin de
                retour, puisque le filtre vit dans la barre d'actions. */}
            {vue === 'servies' ? (
              <button
                type="button"
                onClick={() => setVue('attente')}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border',
                  'border-[rgb(var(--glass-edge)/0.34)] bg-white/60 px-3 py-1.5',
                  'text-[0.78rem] font-semibold text-fg-muted transition-colors hover:bg-white',
                )}
              >
                <ClipboardList className="size-3.5" />
                Revenir à la saisie
              </button>
            ) : null}

            {/* Au bout de la relecture, le papier. Il fige les passages
                couverts : plus de saisie ni de suppression ensuite. */}
            {/* Le bon vient d'être émis : on l'imprime sans quitter la
                relecture, qui montre exactement ce qu'il porte. */}
            {vue === 'servies' && rangsImprimables.length > 0 ? (
              <button
                type="button"
                onClick={() => void imprimer(rangsImprimables)}
                disabled={busy}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-info/40 bg-info/10 px-3 text-[0.8rem] font-semibold text-info transition-colors hover:bg-info/15 disabled:opacity-60"
              >
                <Printer className="size-3.5" />
                Imprimer le bon du {libelleRangs(rangsImprimables)}
              </button>
            ) : null}

            {/* Au bout de la relecture, le papier : c'est le seul endroit
                d'où il part désormais, une fois les lignes vérifiées. */}
            {vue === 'servies' && (rangsSansBon.length > 0 || (bons.length === 0 && servies.length > 0)) ? (
              <Button
                variant="success"
                size="sm"
                loading={busy}
                onClick={() => void emettreBon(colonnes[0]?.cle)}
              >
                {!busy ? <PackageCheck className="size-4" /> : null}
                {/* Le rang que le papier portera : celui de la colonne en
                    cours quand rien n'est encore en base, sinon les passages
                    qui attendent leur bon. « du servi » ne disait pas lequel. */}
                Bon de livraison du {libelleRangs(
                  rangsSansBon.length > 0
                    ? rangsSansBon
                    : colonnes.length > 0 ? [rangDe(colonnes[0].cle)] : [],
                )}
              </Button>
            ) : null}
          </div>
        </header>

        <TableWrap minWidth={`${46 + (rangsServis.length + colonnes.length) * 7}rem`}>
          <thead>
            <tr>
              <Th className="w-10 text-right">#</Th>
              <Th className="w-full">Article</Th>
              <Th className="text-right">Commande</Th>
              <Th className="text-right">
                {admin ? (
                  <button
                    type="button"
                    onClick={() => void runGeste(() => ouvrirEdition(1))} disabled={gesteEnCours}
                    title="Rouvrir le 1ᵉʳ servi pour corriger ses quantités"
                    aria-label="Rouvrir le 1er servi"
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-1 transition-colors hover:bg-warn/15 hover:text-warn',
                      edition?.rang === 1 && 'bg-warn/15 text-warn',
                    )}
                  >
                    1ᵉʳ servi
                  </button>
                ) : '1ᵉʳ servi'}
              </Th>
              {/* Les passages s'intercalent entre le premier service et le
                  reste : la ligne se lit alors dans l'ordre où elle s'est
                  jouée, et le reste conclut. */}
              {rangsServis.map((rang) => {
                const { recus, enAttente } = reception(rang)
                // Qui a signé, et quand : le nom se lit au survol de la coche.
                const signature = recus
                  .map((p) => `${p.receivedBy?.fullName ?? 'le département'} à ${formatTime(p.receivedAt)}`)
                  .join(', ')
                return (
                  <Th key={`servi-${rang}`} className="w-32 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      {admin ? (
                        <button
                          type="button"
                          onClick={() => void runGeste(() => ouvrirEdition(rang))} disabled={gesteEnCours}
                          title={`Rouvrir le ${rang}ᵉ servi pour corriger ses quantités`}
                          aria-label={`Rouvrir le ${rang}e servi`}
                          className={cn(
                            'rounded-md px-1 transition-colors hover:bg-warn/15 hover:text-warn',
                            edition?.rang === rang && 'bg-warn/15 text-warn',
                          )}
                        >
                          {rang}ᵉ servi
                        </button>
                      ) : `${rang}ᵉ servi`}
                      {rangEmis(rang) ? (
                        /* Le bon est parti avec la marchandise : le passage
                           se fige, et il n'y a plus rien à annuler ici. */
                        <span
                          title={`Bon de livraison du ${rang}ᵉ servi émis`}
                          aria-label={`${rang}e servi : bon de livraison émis`}
                          className="grid size-5 place-items-center rounded-md bg-info/15 text-info"
                        >
                          <Truck className="size-3.5" />
                        </span>
                      ) : enAttente.length === 0 && recus.length > 0 ? (
                        /* Le département a réceptionné ce passage : la coche
                           remplace le X, il n'y a plus rien à annuler. */
                        <span
                          title={`Réceptionné par ${signature}`}
                          aria-label={`${rang}e servi réceptionné par ${signature}`}
                          className="grid size-5 place-items-center rounded-md bg-ok/15 text-ok"
                        >
                          <Check className="size-3.5" />
                        </span>
                      ) : (
                        /* Ce passage est enregistré : le X l'annule en base. */
                        <button
                          type="button"
                          onClick={() => void runGeste(() => annulerService(rang))} disabled={gesteEnCours}
                          title={`Supprimer le ${rang}ᵉ servi`}
                          aria-label={`Supprimer le ${rang}e servi`}
                          className="grid size-5 place-items-center rounded-md text-danger transition-colors hover:bg-danger/15"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </span>
                  </Th>
                )
              })}
              {colonnes.map((c) => (
                <Th key={c.cle} className="w-36 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    {rangDe(c.cle)}ᵉ servi
                    {/* Celle-ci n'est qu'une saisie en cours : le X la ferme. */}
                    <button
                      type="button"
                      onClick={() => void fermerColonne(c.cle)}
                      title="Supprimer cette colonne"
                      aria-label={`Supprimer la colonne du ${rangDe(c.cle)}e servi`}
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
                      arrive en plusieurs fois, et chaque passage a la sienne.
                      Il se retire dès qu'une colonne est ouverte, ou pendant
                      la relecture : on n'y ouvre rien. */}
                  {colonnes.length === 0 && vue !== 'servies' ? (
                  <button
                    type="button"
                    onClick={ajouterColonne}
                    title="Ajouter un servi"
                    aria-label="Ajouter une colonne de servi"
                    className="grid size-6 place-items-center rounded-lg bg-ok text-white transition-colors hover:bg-ok/85"
                  >
                    <Plus className="size-4" />
                  </button>
                  ) : null}
                </span>
              </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
            {visibles.length === 0 ? (
              <tr>
                <td
                  colSpan={6 + rangsServis.length + colonnes.length}
                  className="px-4 py-6 text-center text-[0.85rem] text-fg-muted"
                >
                  {mot !== ''
                    ? `Aucun article ne correspond à « ${recherche} ».`
                    : voirSoldees
                      ? 'Aucune ligne pour ce rayon.'
                      : 'Tout est soldé : plus rien à servir pour ce rayon.'}
                </td>
              </tr>
            ) : null}
            {visibles.map((l, i) => {
              // En correction, la colonne rouverte se lit comme une saisie :
              // le reste part de ce que les autres servis ont sorti, et ce
              // qu'on tape dans la colonne s'y ajoute — même reste vivant,
              // mêmes couleurs, même état que pendant un servi ordinaire.
              const sortiHors = edition
                ? (edition.rang === 1 ? 0 : (l.quantityServed ?? 0))
                  + l.refills.filter((x) => x.rank !== edition.rang).reduce((n, x) => n + x.quantity, 0)
                : 0
              const r = edition ? Math.max(l.quantityAsked - sortiHors, 0) : reste(l)
              // Ce que la saisie en cours ajoute à cette ligne : les colonnes
              // ouvertes, et le rattrapage posé dans un passage antérieur.
              // Les deux servent la même ligne, donc la même marchandise : les
              // séparer laissait une ligne rattrapée en rouge alors qu'elle
              // venait d'être soldée.
              const enCours = edition
                ? toNumber(edition.saisie[l.id] ?? '')
                : colonnes.reduce(
                  (n, c) => n + toNumber(saisie[String(c.cle)]?.[l.id] ?? ''), 0,
                ) + Object.values(rattrapage).reduce((n, par) => n + toNumber(par[l.id] ?? ''), 0)
              // Rien de sorti du tout : rouge. Sans correction, l'état en base
              // le dit ; en correction, c'est ce que les autres servis ont
              // laissé, plus la saisie, qui le décide.
              const rien = edition ? sortiHors === 0 && enCours === 0 : l.status === 'REJECTED'
              // La colonne « 1ᵉʳ servi » ne porte que le premier service :
              // les compléments ont chacun leur colonne, et les additionner
              // ici les comptait deux fois — 10 servis et 1 complété
              // s'affichaient « 11 » en face d'une colonne qui disait déjà 1.
              const servi = l.quantityServed ?? 0
              // L'état suit la saisie : servir tout le reste solde la ligne,
              // en servir une partie la laisse ajustée — y compris une
              // rupture, qui cesse d'en être une dès qu'un peu sort.
              const soldee = r === 0 || enCours >= r
              const partiel = enCours > 0 && enCours < r
              return (
                <React.Fragment key={l.id}>
                  {i === 0 || visibles[i - 1].categoryName !== l.categoryName ? (
                    <FamilyBand
                      name={l.categoryName}
                      count={groupSize(visibles, i)}
                      colSpan={6 + rangsServis.length + colonnes.length}
                    />
                  ) : null}
                  <tr
                    className={cn(
                      // Vert dès que le reste est couvert, orange tant qu'il
                      // manque quelque chose, rouge si rien n'est encore sorti.
                      // La relecture se lit, elle ne se modifie pas : tout
                      // en gris, sans les couleurs qui appellent une action.
                      vue === 'servies' && 'bg-[rgb(var(--glass-edge)/0.10)] text-fg-muted',
                      vue !== 'servies' && soldee && 'bg-ok/[0.14]',
                      vue !== 'servies' && !soldee && partiel && 'bg-warn/[0.12]',
                      vue !== 'servies' && !soldee && !partiel && rien && 'bg-danger/[0.06]',
                      vue !== 'servies' && !soldee && !partiel && !rien && 'bg-warn/[0.07]',
                    )}
                  >
                    {/* Le numéro du ticket, pas celui de la vue : filtrer ne
                        renumérote pas, et le papier porte le même chiffre. */}
                    <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{l.rang || i + 1}</Td>
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
                      {edition?.rang === 1 ? (
                        <span className="inline-flex items-center justify-end gap-1.5">
                          <input
                            inputMode="decimal"
                            value={edition.saisie[l.id] ?? ''}
                            onChange={(e) => poserEdition(l, e.target.value)}
                            aria-label={`1er servi — ${l.productName}`}
                            className="field h-9 w-20 px-2 py-0 text-right text-[0.85rem] tabular-nums"
                          />
                          <span className="w-6 text-left text-[0.78rem] font-medium">{l.unitSymbol}</span>
                        </span>
                      ) : (
                        <>{formatQty(servi)} {l.unitSymbol}</>
                      )}
                    </Td>
                    {rangsServis.map((rang) => {
                      const q = l.refills.find((x) => x.rank === rang)?.quantity ?? 0
                      // On ne rattrape que dans le premier passage resté vide
                      // pour cette ligne : le magasin l'y a sorti, et le bon
                      // doit le dire. Les passages suivants restent fermés,
                      // sinon la même ligne s'offrirait deux fois.
                      const rattrapable = rangRattrapable(l) === rang
                      // Ce qui a été saisi dans ce passage sans être encore
                      // en base : la relecture doit le montrer.
                      const enRattrapage = toNumber(rattrapage[String(rang)]?.[l.id] ?? '')
                      return (
                        <Td
                          key={`servi-${rang}`}
                          className="whitespace-nowrap text-right tabular-nums text-fg-muted"
                        >
                          {/* La même charpente dans toutes les cellules de
                              la colonne : un emplacement pour le nombre, un
                              pour l'unité. Sans elle, un champ de saisie et
                              un nombre nu ne tombaient pas sur le même axe et
                              la colonne partait en zigzag. */}
                          <span className="inline-flex items-center justify-end gap-1.5">
                            {edition?.rang === rang ? (
                              <input
                                inputMode="decimal"
                                value={edition.saisie[l.id] ?? ''}
                                onChange={(e) => poserEdition(l, e.target.value)}
                                placeholder="0"
                                aria-label={`${rang}e servi — ${l.productName} (correction)`}
                                className="field h-9 w-20 px-2 py-0 text-right text-[0.85rem] tabular-nums"
                              />
                            ) : q > 0 ? (
                              <span className="w-20 text-right">{formatQty(q)}</span>
                            ) : rattrapable ? (
                              <input
                                inputMode="decimal"
                                value={rattrapage[String(rang)]?.[l.id] ?? ''}
                                onChange={(e) => setRattrapage_(rang, l.id, e.target.value)}
                                placeholder="0"
                                aria-label={`${rang}e servi — ${l.productName}`}
                                className="field h-9 w-20 px-2 py-0 text-right text-[0.85rem] tabular-nums"
                              />
                            ) : enRattrapage > 0 ? (
                              /* Relecture : le rattrapage saisi dans ce
                                 passage s'affiche, en lecture seule. Sans
                                 lui, la ligne semblait n'avoir rien reçu au
                                 moment même de vérifier le bon. */
                              <span className="w-20 text-right font-semibold text-fg">
                                {formatQty(enRattrapage)}
                              </span>
                            ) : (
                              <span className="w-20 text-right">—</span>
                            )}
                            <span className="w-6 text-left text-[0.78rem] font-medium text-fg-muted">
                              {q > 0 || rattrapable || enRattrapage > 0 || edition?.rang === rang ? l.unitSymbol : ''}
                            </span>
                          </span>
                        </Td>
                      )
                    })}
                    {colonnes.map((c) => (
                      <Td key={c.cle} className="text-right">
                        {/* La même charpente que les colonnes servies : le
                            nombre sur le même axe d'une ligne à l'autre. */}
                        <span className="inline-flex items-center justify-end gap-1.5">
                        {vue === 'servies' ? (
                          /* Relecture : on montre ce qui vient d'être saisi,
                             en lecture seule. C'est ce que le bon portera. */
                          <span className="w-20 text-right font-semibold tabular-nums text-fg">
                            {toNumber(saisie[String(c.cle)]?.[l.id] ?? '') > 0
                              ? `${formatQty(toNumber(saisie[String(c.cle)]?.[l.id] ?? ''))} ${l.unitSymbol}`
                              : '—'}
                          </span>
                        ) : r === 0 || rangRattrapable(l) !== null ? (
                          /* Rien à servir, ou la ligne attend d'être rattrapée
                             dans un passage antérieur : c'est là qu'on la
                             sert, et sa case reste fermée ici. Un article
                             oublié au 2ᵉ ne se reporte pas sur le 3ᵉ. */
                          <span className="w-20 text-right text-[0.8rem] text-fg-subtle">—</span>
                        ) : (
                          /* L'unité auprès du champ : « 16 » seul ne dit pas
                             si ce sont des kilos ou des unités. */
                          <>
                            <input
                              inputMode="decimal"
                              value={saisie[String(c.cle)]?.[l.id] ?? ''}
                              onChange={(e) => set(c.cle, l.id, e.target.value)}
                              placeholder="0"
                              aria-label={`${rangDe(c.cle)}e servi — ${l.productName}`}
                              className="field h-9 w-20 px-2 py-0 text-right text-[0.85rem] tabular-nums"
                            />
                            <span className="w-6 text-left text-[0.78rem] font-medium text-fg-muted">
                              {l.unitSymbol}
                            </span>
                          </>
                        )}
                        </span>
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
                        <Badge tone={rien ? 'danger' : 'warn'}>
                          {rien ? 'Rupture' : 'Ajusté'}
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
