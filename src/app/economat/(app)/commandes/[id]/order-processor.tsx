'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Check, Ban, Pencil, Printer, Truck, PackageOpen, RotateCcw, Undo2,
  MessageSquareWarning, Siren,
} from 'lucide-react'
import { GlassCard, Button, Badge, TableWrap, Th, Td } from '@/components/ui/glass'
import { FamilyBand, countByFamily } from '@/components/ui/family-band'
import { FilterBadge, FilterReset } from '@/components/ui/filter-badge'
import { OrderDates } from '@/components/orders/order-dates'
import { Icon } from '@/components/ui/icon'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import { StatusBadge } from '@/components/ui/status'
import { SearchField } from '@/components/ui/search-field'
import { correspond, normaliser } from '@/lib/search'
import { ticketVariant } from '@/components/ui/ticket'
import { PrintButton } from '@/components/ui/print-button'
import { gql, errorMessage } from '@/lib/graphql-client'
import { cn, formatLongDate, formatQty, formatTime, toNumber } from '@/lib/utils'
import type { LineStatus, ProcessOrder } from '@/lib/order-types'

export type { ProcessLine, ProcessOrder } from '@/lib/order-types'

const ACCEPT = /* GraphQL */ `mutation Accept($id: ID!) { acceptOrder(id: $id) { id status } }`
const CANCEL_ACCEPT = /* GraphQL */ `
  mutation CancelAccept($id: ID!) { cancelAcceptance(id: $id) { id status } }
`
const SET_LINES = /* GraphQL */ `
  mutation SetLines($id: ID!, $lines: [ServedLineInput!]!) {
    setServedLines(id: $id, lines: $lines) { id status }
  }
`
const DELIVER = /* GraphQL */ `mutation Deliver($id: ID!) { deliverOrder(id: $id) { id status } }`
const CANCEL_SERVICE = /* GraphQL */ `
  mutation CancelService($id: ID!, $rank: Int!) {
    cancelService(id: $id, rank: $rank) { id status }
  }
`

type Draft = { status: LineStatus; served: string; reason: string }

export function OrderProcessor({ order }: { order: ProcessOrder }) {
  const router = useRouter()
  const { push } = useToast()
  const confirmer = useConfirm()
  const [busy, setBusy] = React.useState<string | null>(null)

  // L'état tel qu'il est en base. Sert au démarrage et au retour en arrière :
  // « réinitialiser » rend ce qui est enregistré, pas une feuille vierge —
  // sinon on effacerait un travail déjà sauvegardé sans le dire.
  const initial = React.useCallback(
    (): Record<string, Draft> =>
      Object.fromEntries(
        order.lines.map((l) => [
          l.id,
          {
            status: l.status,
            served: l.quantityServed === null ? String(l.quantityAsked) : String(l.quantityServed),
            reason: l.rejectReason ?? '',
          },
        ]),
      ),
    [order.lines],
  )

  // État local des lignes : l'économe coche au fur et à mesure, on n'envoie
  // au serveur qu'à l'enregistrement ou à la livraison.
  const [draft, setDraft] = React.useState<Record<string, Draft>>(initial)

  /**
   * La feuille vierge : toutes les lignes en attente, rien de servi.
   *
   * Elle ne dépend pas de ce que le serveur a envoyé, contrairement à
   * `initial()` : après avoir effacé le service, l'écran doit se vider tout
   * de suite, sans attendre que les données rechargées lui apprennent ce
   * qu'il vient lui-même de demander.
   */
  const vierge = React.useCallback(
    (): Record<string, Draft> =>
      Object.fromEntries(
        order.lines.map((l) => [
          l.id,
          { status: 'PENDING' as LineStatus, served: String(l.quantityAsked), reason: '' },
        ]),
      ),
    [order.lines],
  )

  /**
   * Resynchronise l'écran quand le serveur a changé les lignes.
   *
   * L'état local est saisi ici et n'est envoyé qu'à l'enregistrement : le
   * recharger à chaque rendu écraserait la saisie en cours. Mais après un
   * « Tout réinitialiser » ou une acceptation annulée, la base ne porte plus
   * rien et l'écran gardait les anciennes quantités — le bouton semblait
   * alors ne rien faire. On se recale donc sur la signature des lignes
   * enregistrées : elle ne bouge que lorsque le serveur, lui, a bougé.
   */
  const signature = React.useMemo(
    () => order.lines
      .map((l) => `${l.id}:${l.status}:${l.quantityServed ?? ''}:${l.rejectReason ?? ''}`)
      .join('|'),
    [order.lines],
  )
  const derniereSignature = React.useRef(signature)
  React.useEffect(() => {
    if (derniereSignature.current === signature) return
    derniereSignature.current = signature
    setDraft(initial())
  }, [signature, initial])

  const open = order.status === 'ACCEPTED'
  const closed = order.status === 'DELIVERED' || order.status === 'RECEIVED'

  const setLine = (id: string, patch: Partial<Draft>) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }))

  // Les lignes d'une commande sont figées à l'envoi : celles passées avant que
  // les feuilles soient regroupées gardent leurs familles éparpillées. On les
  // rassemble pour l'affichage, en conservant l'ordre d'apparition de chaque
  // famille et celui des articles à l'intérieur.
  const lignes = React.useMemo(() => {
    const ordre: string[] = []
    for (const l of order.lines) {
      if (!ordre.includes(l.categoryName)) ordre.push(l.categoryName)
    }
    return ordre.flatMap((c) => order.lines.filter((l) => l.categoryName === c))
  }, [order.lines])

  // Le compte accompagne le nom sur le bandeau : il porte sur ce qui est
  // réellement affiché.
  const parFamille = React.useMemo(() => countByFamily(lignes), [lignes])

  // Repères de ligne : sur 72 articles, dire « 3 lignes manquent » sans
  // montrer lesquelles obligerait à tout reparcourir.
  const rowRefs = React.useRef<Record<string, HTMLTableRowElement | null>>({})

  /** Conduit à une ligne et la souligne brièvement. */
  const allerA = React.useCallback((id: string) => {
    const el = rowRefs.current[id]
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Un surlignage bref : après un défilement, retrouver la bonne ligne
    // parmi ses voisines demande encore un effort.
    el.animate(
      [{ background: 'rgb(var(--glass-edge) / 0.35)' }, { background: 'transparent' }],
      { duration: 1600, easing: 'ease-out' },
    )
  }, [])

  // Filtre par état : cliquer sur « 3 rupture(s) » ne laisse que ces trois
  // lignes. Sur cent articles, les chercher une à une était le travail que ce
  // compteur devait justement épargner.
  const [filtre, setFiltre] = React.useState<LineStatus | null>(null)

  // Le rang est celui de la feuille, figé avant tout filtrage : renuméroter
  // de 1 à n une liste filtrée ferait que « l'article 16 » ne désignerait plus
  // la même chose d'un écran à l'autre.
  const numerotees = React.useMemo(
    () => lignes.map((l, i) => ({ ...l, rang: l.rang || i + 1 })),
    [lignes],
  )

  // Chercher un article par son nom ou sa référence : sur cent lignes, on
  // ne descend pas la feuille pour en pointer une.
  const [recherche, setRecherche] = React.useState('')
  const affichees = React.useMemo(() => {
    const mot = normaliser(recherche)
    return numerotees.filter((l) =>
      (filtre === null || (draft[l.id]?.status ?? 'PENDING') === filtre)
      && correspond(mot, l.productName, l.productRef, l.categoryName))
  }, [numerotees, draft, filtre, recherche])

  const counts = React.useMemo(() => {
    let validated = 0
    let adjusted = 0
    let rejected = 0
    for (const l of order.lines) {
      const s = draft[l.id]?.status ?? 'PENDING'
      if (s === 'VALIDATED') validated++
      else if (s === 'ADJUSTED') adjusted++
      else if (s === 'REJECTED') rejected++
    }
    return { validated, adjusted, rejected, pending: order.lines.length - validated - adjusted - rejected }
  }, [draft, order.lines])

  const servedTotal = React.useMemo(
    () =>
      order.lines.reduce((sum, l) => {
        const d = draft[l.id]
        if (!d || d.status === 'REJECTED') return sum
        if (d.status === 'VALIDATED') return sum + l.quantityAsked
        if (d.status === 'ADJUSTED') return sum + toNumber(d.served)
        return sum
      }, 0),
    [draft, order.lines],
  )

  const payload = () =>
    order.lines
      .filter((l) => draft[l.id]?.status !== 'PENDING')
      .map((l) => {
        const d = draft[l.id]
        return {
          lineId: l.id,
          status: d.status,
          quantityServed: d.status === 'ADJUSTED' ? toNumber(d.served) : null,
          rejectReason: d.status === 'REJECTED' ? d.reason.trim() || null : null,
        }
      })

  // Ce qu'on saisit s'enregistre tout seul, un instant après la dernière
  // frappe : l'économe peut quitter la page et revenir sans rien perdre, et
  // n'a plus de bouton à penser à cliquer. Rien ne part tant qu'une action
  // (émettre, annuler l'acceptation) est en cours, ni si rien n'a changé.
  const dernierEnvoi = React.useRef<string>('')
  React.useEffect(() => {
    if (!open || busy) return
    const lines = payload()
    const cle = JSON.stringify(lines)
    // Au premier passage, l'écran montre ce que le serveur a déjà : rien à envoyer.
    if (dernierEnvoi.current === '') { dernierEnvoi.current = cle; return }
    if (lines.length === 0 || cle === dernierEnvoi.current) return
    const t = window.setTimeout(async () => {
      try {
        await gql(SET_LINES, { id: order.id, lines })
        dernierEnvoi.current = cle
      } catch {
        // Une saisie qui ne s'enregistre pas reste à l'écran : l'émission du
        // bon la renverra, et dira alors ce qui ne va pas.
      }
    }, 900)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, open, busy])

  const call = async (label: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(label)
    try {
      await fn()
      push('success', success)
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  // Accepter engage l'économat : la commande passe en préparation et le
  // département ne peut plus la modifier. On le demande avant. La croix et
  // « Annuler » ferment la question sans rien faire.
  const accept = async () => {
    const ok = await confirmer({
      title: 'Accepter cette commande ?',
      message: `${order.reference} passera en préparation : le département ne pourra plus la modifier, et vous pourrez servir ses ${order.lines.length} article(s).`,
      confirmLabel: 'OK',
      tone: 'info',
    })
    if (!ok) return
    await call('accept', () => gql(ACCEPT, { id: order.id }), 'Commande acceptée — vous pouvez la servir.')
  }

  // Rendre la commande au département. La préparation déjà saisie est perdue :
  // on le dit avant, pas après.
  const cancelAccept = async () => {
    const dejaTraitees = order.lines.length - counts.pending
    // Rouverte par l'administration après livraison : le bon émis et les
    // servis complémentaires partent avec l'acceptation. On le dit en clair.
    const rouverte = !!order.deliveredAt
    const nbServis = order.refills.length
    const ok = await confirmer({
      title: 'Annuler l’acceptation ?',
      message: (dejaTraitees > 0
        ? `La commande repassera en attente et ${dejaTraitees} ligne(s) déjà traitée(s) seront `
          + 'remises à zéro.'
        : 'La commande repassera en attente.')
        + (rouverte
          ? ` Le bon de livraison déjà émis sera annulé${nbServis > 0 ? ` et ${nbServis === 1 ? 'son servi complémentaire sera supprimé' : `ses ${nbServis} servis complémentaires seront supprimés`}` : ''}.`
          : '')
        + ' Le département pourra de nouveau la modifier.',
      confirmLabel: 'Rendre au département',
      tone: 'danger',
    })
    if (!ok) return
    await call(
      'cancel',
      async () => {
        await gql(CANCEL_ACCEPT, { id: order.id })
        // Le serveur a remis les lignes en attente : l'écran se vide dans la
        // foulée, sans attendre le rechargement.
        setDraft(vierge())
      },
      'Commande rendue au département — le service est effacé.',
    )
  }

  const deliver = async () => {
    // Rien ne part tant qu'une ligne n'a pas été vue. Plutôt que de refuser en
    // silence, on conduit à la première ligne restante : sur 72 articles,
    // chercher soi-même celles qui manquent prendrait plus de temps que de les
    // traiter.
    // On cherche dans l'ordre affiché, pas dans l'ordre d'enregistrement :
    // sinon on conduirait à une ligne qui n'est pas la première à l'écran.
    const premiere = lignes.find((l) => (draft[l.id]?.status ?? 'PENDING') === 'PENDING')
    if (premiere) {
      push('error', `${counts.pending} ligne(s) à traiter — la première est mise en évidence.`)
      // Une ligne masquée par le filtre n'est pas dans la page : on rend la
      // liste entière avant d'y conduire, sinon rien ne bougerait.
      setFiltre(null)
      // Le temps que React rende les lignes rétablies.
      window.setTimeout(() => allerA(premiere.id), 60)
      return
    }

    /**
     * Émettre le bon fige la commande : passé ce point, plus personne ne
     * corrige une quantité ni ne retire un article. L'économe doit le savoir
     * avant, pas le découvrir après — d'où cet avertissement à lire, sans
     * autre issue que de le valider.
     */
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

    // On pousse les lignes travaillées avant de livrer : sinon le bon partirait
    // sans les ajustements saisis à l'écran.
    setBusy('deliver')
    try {
      const lines = payload()
      if (lines.length > 0) await gql(SET_LINES, { id: order.id, lines })
      await gql(DELIVER, { id: order.id })
      push('success', 'Bon de livraison émis — la commande part au département.')
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  /**
   * Efface tout le service de la commande et rend la feuille vierge.
   *
   * Deux situations, et une seule intention : repartir de zéro. Tant que
   * rien n'est enregistré, il suffit de rendre l'écran à son état de départ.
   * Dès qu'il y a du servi en base, le rendre aussi : sinon le bouton ne
   * faisait rien sur une feuille déjà enregistrée — ce que l'économe lisait
   * comme une panne, puisque les quantités restaient à l'écran.
   */
  const resetAll = async () => {
    const enregistre = order.lines.some(
      (l) => l.status !== 'PENDING' || l.quantityServed !== null,
    )
    const touchees = order.lines.filter((l) => {
      const d = draft[l.id]
      const ref = l.quantityServed === null ? String(l.quantityAsked) : String(l.quantityServed)
      return d?.status !== l.status || d?.served !== ref || d?.reason !== (l.rejectReason ?? '')
    }).length

    if (touchees === 0 && !enregistre) {
      push('info', 'Rien à réinitialiser : aucune ligne n’a été traitée.')
      return
    }

    const traitees = order.lines.filter((l) => l.status !== 'PENDING').length
    const ok = await confirmer({
      title: 'Tout réinitialiser',
      confirmLabel: 'Réinitialiser',
      tone: enregistre ? 'danger' : 'warn',
      message: enregistre ? (
        <>
          <p>
            Effacer le service de cette commande ? Les {traitees} ligne
            {traitees > 1 ? 's' : ''} traitée{traitees > 1 ? 's' : ''} redeviennent en attente,
            et les quantités servies sont perdues.
          </p>
          <p className="mt-2 text-[0.82rem] text-fg-subtle">
            La commande reste ouverte : vous pouvez la servir de nouveau.
          </p>
        </>
      ) : (
        <p>
          Annuler vos {touchees} modification{touchees > 1 ? 's' : ''} en cours et revenir
          à la feuille vierge ?
        </p>
      ),
    })
    if (!ok) return

    // Rien en base : l'écran seul suffit, sans aller-retour serveur.
    if (!enregistre) {
      setDraft(initial())
      push('success', 'Lignes réinitialisées.')
      return
    }

    setBusy('reset')
    try {
      // Le rang 1 est le service initial : celui porté par les lignes de la
      // commande. Le serveur les rend à l'attente et efface les quantités.
      await gql(CANCEL_SERVICE, { id: order.id, rank: 1 })
      setDraft(vierge())
      push('success', 'Service effacé — toutes les lignes sont de nouveau en attente.')
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  /** Tout valider d'un coup : le cas d'une commande servie telle quelle. */
  const validateAll = () =>
    setDraft((d) =>
      Object.fromEntries(
        order.lines.map((l) => [
          l.id,
          { ...d[l.id], status: 'VALIDATED' as LineStatus, served: String(l.quantityAsked) },
        ]),
      ),
    )

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <GlassCard className={order.isUrgent ? 'border-2 border-[#8b1e2d] shadow-[0_0_0_3px_rgb(139_30_45/0.16)]' : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid size-12 shrink-0 place-items-center rounded-xl text-[1.05rem] font-bold tabular-nums text-white shadow-md"
              style={{ background: `linear-gradient(140deg, ${order.department.color}, ${order.department.color}bb)` }}
            >
              {order.ticketNumber}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 truncate text-[1rem] font-bold leading-tight text-fg">
                <Icon name={order.department.icon ?? 'Building2'} className="size-4 shrink-0" />
                {order.department.name}
              </p>
              <p className="truncate text-[0.8rem] text-fg-muted">
                <span className="font-mono">{order.reference}</span>
                <span className="mx-1.5">·</span>
                {order.createdBy.fullName}
                <span className="mx-1.5">·</span>
                {formatTime(order.createdAt)}
              </p>
            </div>
          </div>
          <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {order.isUrgent ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#8b1e2d] px-2.5 py-1 text-[0.72rem] font-bold uppercase tracking-wide text-white">
                <Siren className="size-3.5" aria-hidden="true" />
                Urgent — {order.createdBy.fullName}
              </span>
            ) : null}
            <StatusBadge status={order.status} />
          </span>
        </div>

        {/* Les quatre moments de la commande, nommés : « 23:12 » seul ne dit
            pas de quoi il est l'heure. */}
        <OrderDates
          order={order}
          className="border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-2.5 sm:px-5"
        />

        <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 sm:px-5">
          <Badge tone="neutral" className="capitalize">{formatLongDate(order.businessDay)}</Badge>
          <Badge tone="neutral">{order.lineCount} article{order.lineCount > 1 ? 's' : ''}</Badge>


          {/* Cliquables : un compte qui ne mène nulle part oblige à parcourir
              cent lignes pour retrouver les trois qu'il désigne. Le clic ne
              garde que ces lignes-là ; un second clic rend la liste entière. */}
          {counts.rejected > 0 ? (
            <FilterBadge
              tone="danger"
              actif={filtre === 'REJECTED'}
              onClick={() => setFiltre(filtre === 'REJECTED' ? null : 'REJECTED')}
              label={filtre === 'REJECTED'
                ? 'Afficher de nouveau toutes les lignes'
                : `N’afficher que les ${counts.rejected} ligne(s) en rupture`}
            >
              {counts.rejected} rupture(s)
            </FilterBadge>
          ) : null}

          {counts.validated > 0 ? (
            <FilterBadge
              tone="ok"
              actif={filtre === 'VALIDATED'}
              onClick={() => setFiltre(filtre === 'VALIDATED' ? null : 'VALIDATED')}
              label={filtre === 'VALIDATED'
                ? 'Afficher de nouveau toutes les lignes'
                : `N’afficher que les ${counts.validated} ligne(s) servie(s) comme demandé`}
            >
              {counts.validated} conforme{counts.validated > 1 ? 's' : ''}
            </FilterBadge>
          ) : null}

          {counts.adjusted > 0 ? (
            <FilterBadge
              tone="warn"
              actif={filtre === 'ADJUSTED'}
              onClick={() => setFiltre(filtre === 'ADJUSTED' ? null : 'ADJUSTED')}
              label={filtre === 'ADJUSTED'
                ? 'Afficher de nouveau toutes les lignes'
                : `N’afficher que les ${counts.adjusted} ligne(s) ajustée(s)`}
            >
              {counts.adjusted} ajustée{counts.adjusted > 1 ? 's' : ''}
            </FilterBadge>
          ) : null}

          {/* Une liste filtrée ne dit pas d'elle-même qu'elle est partielle :
              sans ce rappel, on croirait la commande réduite à trois lignes. */}
          {filtre !== null ? (
            <FilterReset total={order.lineCount} onClick={() => setFiltre(null)} />
          ) : null}
        </div>

        {order.note ? (
          <p className="border-t border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 text-[0.83rem] italic text-fg-muted sm:px-5">
            {order.note}
          </p>
        ) : null}

        <div className="no-print border-t border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
          <SearchField value={recherche} onChange={setRecherche} className="max-w-md" />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
          {/* Rien ne s'imprime avant l'acceptation : un ticket sorti d'une
              commande que le département peut encore corriger circulerait en
              magasin sans correspondre à ce qui sera servi.

              Le libellé nomme ce qui sort de l'imprimante, et suit donc la
              même règle que la feuille elle-même.

              PrintButton vide le titre de l'onglet le temps de l'impression :
              l'en-tête haut reste blanc. */}
          {order.status !== 'PENDING' ? (
            <PrintButton orderId={order.id} variant="secondary" size="sm">
              <Printer className="size-3.5" />
              {{
                ticket: 'Imprimer le ticket',
                commande: 'Imprimer le bon de commande',
                livraison: 'Imprimer le bon de livraison',
              }[ticketVariant(order.status)]}
            </PrintButton>
          ) : null}

          {order.status === 'PENDING' ? (
            <Button variant="primary" loading={busy === 'accept'} onClick={accept}>
              {busy !== 'accept' ? <PackageOpen className="size-4" /> : null}
              Accepter la commande
            </Button>
          ) : null}

          {/* Se tromper de ticket arrive : tant que le bon n'est pas émis, on
              rend la commande au département plutôt que de le forcer à en
              refaire une, qui prendrait un second numéro. */}
          {order.status === 'ACCEPTED' ? (
            <Button
              variant="ghost"
              size="sm"
              loading={busy === 'cancel'}
              onClick={() => void cancelAccept()}
            >
              {busy !== 'cancel' ? <Undo2 className="size-3.5" /> : null}
              Annuler l’acceptation
            </Button>
          ) : null}

          {open ? (
            <>
              <Button variant="ghost" size="sm" onClick={validateAll}>
                <Check className="size-3.5" />
                Tout valider
              </Button>
              <Button
                variant="ghost"
                size="sm"
                loading={busy === 'reset'}
                onClick={() => void resetAll()}
              >
                <RotateCcw className="size-3.5" />
                Tout réinitialiser
              </Button>
              {/* Émettre engage : le bon part au département et la commande
                  n'est plus modifiable. Tant qu'une ligne n'a pas été vue, le
                  bouton reste fermé plutôt que de laisser découvrir le refus
                  après le clic. */}
              <Button
                variant="success"
                loading={busy === 'deliver'}
                onClick={deliver}
                className="ml-auto"
                title={
                  counts.pending > 0
                    ? `${counts.pending} ligne(s) restent à traiter`
                    : undefined
                }
              >
                {busy !== 'deliver' ? <Truck className="size-4" /> : null}
                bon de livraison
              </Button>
            </>
          ) : null}
        </div>

        {open ? (
          <p className="border-t border-[rgb(var(--glass-edge)/0.14)] bg-accent/[0.06] px-4 py-2.5 text-[0.79rem] text-fg-muted sm:px-5">
            {counts.pending > 0 ? (
              <>
                <strong className="text-fg">{counts.pending}</strong> ligne(s) non traitée(s) —
                validez-les, ajustez-les ou marquez-les en rupture avant d’émettre le bon.
                <strong className="text-fg"> Tout valider</strong> traite d’un coup une commande
                servie telle que demandée.
              </>
            ) : (
              <>Toutes les lignes sont traitées — vous pouvez émettre le bon.</>
            )}
          </p>
        ) : null}
      </GlassCard>

      {/* Lignes */}
      <GlassCard overflowVisible>
        <TableWrap minWidth="44rem">
          <thead>
            <tr>
              <Th className="w-10 text-right">#</Th>
              <Th className="w-full">Article</Th>
              {/* La cible du département, pour juger une demande inhabituelle
                  sans avoir à ouvrir l'écran Stock fixe. */}
              <Th className="text-right">Stock fixe</Th>
              {/* « Commande » plutôt que « Demandé » : sur cet écran l'économat
                  prépare une commande, il ne juge pas une demande. Les autres
                  tableaux gardent leur intitulé. */}
              <Th className="text-right">Commande</Th>
              <Th className="w-32 text-right">Servi</Th>
              <Th className="w-44">Action</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
            {affichees.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[0.85rem] text-fg-muted">
                  Aucun article ne correspond{recherche ? ` à « ${recherche} »` : ' à ce filtre'}.
                </td>
              </tr>
            ) : null}
            {affichees.map((l, i) => {
              // Un bandeau ouvre chaque famille : on sert le rayon d'un bloc,
              // pas article par article dans le désordre.
              const ouvreFamille = i === 0 || affichees[i - 1].categoryName !== l.categoryName
              const d = draft[l.id]
              const status = d?.status ?? 'PENDING'

              // Ouvrir le champ de saisie n'est pas ajuster. Tant que la valeur
              // reste celle commandée, la ligne est conforme : l'orange doit
              // signaler un écart réel, sinon il crie sans rien dire.
              const ecart = status === 'ADJUSTED' && (d?.served ?? '') !== ''
                && toNumber(d.served) !== l.quantityAsked

              // Une saisie en cours, encore vide ou identique à la commande,
              // se lit comme une ligne conforme.
              const conforme = status === 'VALIDATED' || (status === 'ADJUSTED' && !ecart)

              return (
                <React.Fragment key={l.id}>
                  {ouvreFamille ? (
                    <FamilyBand
                    name={l.categoryName}
                    count={parFamille.get(l.categoryName) ?? 0}
                    colSpan={6}
                  />
                  ) : null}
                  <tr
                    ref={(el) => { rowRefs.current[l.id] = el }}
                    className={cn(
                      'transition-colors',
                      // À 6 % d'opacité, la couleur ne se voyait pas : sur 72
                      // lignes, repérer ce qui est traité passe d'abord par le
                      // fond, pas par la lecture de chaque ligne. Un liseré
                      // gauche double le signal.
                      conforme && 'bg-ok/[0.16] shadow-[inset_3px_0_0_0_var(--ok)]',
                      ecart && 'bg-warn/[0.2] shadow-[inset_3px_0_0_0_var(--warn)]',
                      status === 'REJECTED' && 'bg-danger/[0.16] shadow-[inset_3px_0_0_0_var(--danger)]',
                    )}
                  >
                    <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{l.rang}</Td>
                    <Td className="max-w-0">
                      <p className="truncate text-[0.85rem] font-medium text-fg">{l.productName}</p>
                      {/* La famille est portée par le bandeau : la répéter à
                          chaque ligne allongeait sans rien apprendre. */}
                      <p className="truncate font-mono text-[0.7rem] text-fg-subtle">
                        {l.productRef}
                      </p>
                    </Td>
                    <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">
                      {formatQty(l.stockFixe)} {l.unitSymbol}
                    </Td>
                    <Td className="whitespace-nowrap text-right font-medium tabular-nums text-fg">
                      {formatQty(l.quantityAsked)} {l.unitSymbol}
                    </Td>
                    <Td className="text-right">
                      {status === 'ADJUSTED' && open ? (
                        <input
                          inputMode="decimal"
                          value={d.served}
                          onChange={(e) => {
                            const v = e.target.value.replace(',', '.')
                            if (v !== '' && !/^\d*\.?\d*$/.test(v)) return
                            // On ne sert pas plus que commandé : le serveur le
                            // refuse, autant ne pas laisser taper un chiffre
                            // qui sera rejeté à l'enregistrement.
                            if (v !== '' && toNumber(v) > l.quantityAsked) {
                              push('error',
                                `${l.productName} : ${formatQty(l.quantityAsked)} `
                                + `${l.unitSymbol} commandé, on ne peut pas en servir plus.`)
                              return
                            }
                            setLine(l.id, { served: v })
                          }}
                          max={l.quantityAsked}
                          aria-label={`Quantité servie pour ${l.productName}`}
                          className="field h-9 w-24 px-2 py-0 text-right text-[0.85rem] tabular-nums"
                          autoFocus
                        />
                      ) : (
                        <span
                          className={cn(
                            'whitespace-nowrap text-[0.85rem] tabular-nums',
                            status === 'REJECTED' && 'font-semibold text-danger',
                            conforme && 'font-semibold text-ok',
                            ecart && 'font-semibold text-warn',
                          )}
                        >
                          {/* Une ligne non traitée reste vide : afficher par
                              avance la quantité commandée donnait à lire un
                              chiffre que personne n'avait encore décidé, et on
                              ne distinguait plus d'un coup d'œil ce qui avait
                              été pointé de ce qui restait à faire. */}
                          {status === 'PENDING'
                            ? ''
                            : status === 'REJECTED'
                              ? 'Rupture'
                              : `${formatQty(
                                  status === 'ADJUSTED' ? toNumber(d?.served) : l.quantityAsked,
                                )} ${l.unitSymbol}`}
                        </span>
                      )}
                    </Td>
                    <Td>
                      {open ? (
                        <div className="flex items-center gap-1">
                          <LineAction
                            // Une ligne traitée garde sa coche allumée, que la
                            // quantité corresponde ou non : l'éteindre en
                            // revenant à la valeur commandée ferait croire que
                            // la ligne n'est plus traitée.
                            active={conforme || ecart || status === 'REJECTED'}
                            // La coche prend la couleur de l'état confirmé :
                            // verte si conforme, orange si la quantité diffère,
                            // rouge en rupture. Une coche verte au-dessus d'une
                            // ligne orange ou rouge disait deux choses opposées.
                            tone={status === 'REJECTED' ? 'danger' : ecart ? 'warn' : 'ok'}
                            // En rupture, rien n'est servi : valider n'a pas de
                            // sens. Le bouton reste visible pour ne pas faire
                            // sauter la colonne, mais ne fait rien.
                            disabled={status === 'REJECTED'}
                            label={
                              status === 'REJECTED'
                                ? 'Article en rupture — rien à valider'
                                : ecart
                                  ? 'Confirmer la quantité ajustée'
                                  : 'Valider'
                            }
                            onClick={() => {
                              // Valider confirme ce qui est saisi. Écraser la
                              // valeur par la quantité commandée effacerait le
                              // comptage que l'économat vient de faire.
                              const saisi = (d?.served ?? '').trim()
                              const garde = saisi !== '' && toNumber(saisi) !== l.quantityAsked
                              setLine(l.id, garde
                                // Une quantité différente reste « ajustée » :
                                // c'est ce statut qui fait enregistrer la
                                // valeur servie plutôt que celle demandée.
                                ? { status: 'ADJUSTED', served: saisi }
                                : { status: 'VALIDATED', served: String(l.quantityAsked) })
                            }}
                          >
                            <Check className="size-4" />
                          </LineAction>
                          <LineAction
                            active={status === 'ADJUSTED'}
                            tone="warn"
                            label="Ajuster la quantité"
                            onClick={() => setLine(l.id, { status: 'ADJUSTED' })}
                          >
                            <Pencil className="size-4" />
                          </LineAction>
                          <LineAction
                            active={status === 'REJECTED'}
                            tone="danger"
                            label="Rupture"
                            onClick={() => setLine(l.id, { status: 'REJECTED' })}
                          >
                            {/* Cercle barré plutôt qu'une croix : une croix se
                                lit « fermer », le panneau d'interdiction dit
                                « on ne sert pas ». C'est déjà l'icône d'une
                                commande annulée ailleurs dans l'application. */}
                            <Ban className="size-4" />
                          </LineAction>
                          {status !== 'PENDING' ? (
                            <LineAction
                              active={false}
                              tone="neutral"
                              label="Réinitialiser"
                              onClick={() => setLine(l.id, { status: 'PENDING' })}
                            >
                              <RotateCcw className="size-3.5" />
                            </LineAction>
                          ) : null}
                        </div>
                      ) : (
                        <LineBadge status={status} />
                      )}
                    </Td>
                  </tr>

                  {status === 'REJECTED' && open ? (
                    <tr className="bg-danger/[0.04]">
                      <Td />
                      <Td colSpan={5} className="pb-3 pt-0">
                        <input
                          value={d.reason}
                          onChange={(e) => setLine(l.id, { reason: e.target.value })}
                          placeholder="Motif de la rupture (facultatif)…"
                          aria-label={`Motif de rupture pour ${l.productName}`}
                          className="field h-8 py-0 text-[0.8rem]"
                        />
                      </Td>
                    </tr>
                  ) : null}

                  {/* Commande close : le champ de saisie a disparu, et avec
                      lui le motif écrit. L'économat qui rouvre un bon livré
                      doit pouvoir relire ce qu'il a annoncé au département. */}
                  {status === 'REJECTED' && !open && l.rejectReason ? (
                    <tr className="bg-danger/[0.04]">
                      <Td />
                      <Td colSpan={5} className="pb-2.5 pt-0">
                        <p className="flex items-start gap-1 text-[0.78rem] font-medium leading-snug text-danger">
                          <MessageSquareWarning className="mt-px size-3.5 shrink-0" />
                          {l.rejectReason}
                        </p>
                      </Td>
                    </tr>
                  ) : null}
                </React.Fragment>
              )
            })}
          </tbody>
        </TableWrap>
      </GlassCard>
    </div>
  )
}

const ACTION_TONES = {
  ok: 'border-ok/45 bg-ok text-white',
  warn: 'border-warn/45 bg-warn text-white',
  danger: 'border-danger/45 bg-danger text-white',
  neutral: 'border-[rgb(var(--glass-edge)/0.3)] bg-white/60 text-fg-muted',
} as const

function LineAction({
  active, tone, label, onClick, children, disabled,
}: {
  active: boolean
  tone: keyof typeof ACTION_TONES
  label: string
  onClick: () => void
  children: React.ReactNode
  /** Bouton montré mais sans effet : l'état l'exclut déjà. */
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-lg border transition-colors',
        active
          ? ACTION_TONES[tone]
          : 'border-[rgb(var(--glass-edge)/0.3)] bg-white/50 text-fg-subtle hover:bg-white/90 hover:text-fg',
        // Reste lisible : il porte la couleur de l'état, pas celle d'un
        // bouton éteint, mais n'invite plus au clic.
        disabled && 'cursor-not-allowed',
      )}
    >
      {children}
    </button>
  )
}

const BADGES = {
  PENDING: { tone: 'neutral', label: 'En attente' },
  VALIDATED: { tone: 'ok', label: 'Servi' },
  ADJUSTED: { tone: 'warn', label: 'Ajusté' },
  REJECTED: { tone: 'danger', label: 'Rupture' },
} as const

function LineBadge({ status }: { status: LineStatus }) {
  const b = BADGES[status]
  return <Badge tone={b.tone}>{b.label}</Badge>
}
