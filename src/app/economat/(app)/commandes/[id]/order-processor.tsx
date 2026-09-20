'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Check, Ban, Pencil, Printer, Truck, PackageOpen, Save, RotateCcw, Undo2, ChevronRight,
} from 'lucide-react'
import { GlassCard, Button, Badge, TableWrap, Th, Td } from '@/components/ui/glass'
import { FamilyBand, countByFamily } from '@/components/ui/family-band'
import { Icon } from '@/components/ui/icon'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import { StatusBadge } from '@/components/ui/status'
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

  // Rang de la dernière ligne atteinte, par état : un second clic conduit à la
  // suivante. Sur trois ruptures éparpillées dans cent lignes, revenir
  // toujours à la première obligerait à chercher les autres à la main.
  const curseur = React.useRef<Record<string, number>>({})

  const parcourir = React.useCallback((etat: LineStatus) => {
    const cibles = lignes.filter((l) => (draft[l.id]?.status ?? 'PENDING') === etat)
    if (cibles.length === 0) return
    const suivant = ((curseur.current[etat] ?? -1) + 1) % cibles.length
    curseur.current[etat] = suivant
    allerA(cibles[suivant].id)
  }, [lignes, draft, allerA])

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

  const accept = () =>
    call('accept', () => gql(ACCEPT, { id: order.id }), 'Commande acceptée — vous pouvez la servir.')

  // Rendre la commande au département. La préparation déjà saisie est perdue :
  // on le dit avant, pas après.
  const cancelAccept = async () => {
    const dejaTraitees = order.lines.length - counts.pending
    const ok = await confirmer({
      title: 'Annuler l’acceptation ?',
      message: dejaTraitees > 0
        ? `La commande repassera en attente et ${dejaTraitees} ligne(s) déjà traitée(s) seront `
          + 'remises à zéro. Le département pourra de nouveau la modifier.'
        : 'La commande repassera en attente. Le département pourra de nouveau la modifier.',
      confirmLabel: 'Rendre au département',
      tone: 'danger',
    })
    if (!ok) return
    await call(
      'cancel',
      () => gql(CANCEL_ACCEPT, { id: order.id }),
      'Commande rendue au département — elle est de nouveau en attente.',
    )
  }

  const save = () =>
    call('save', () => gql(SET_LINES, { id: order.id, lines: payload() }), 'Lignes enregistrées.')

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
      allerA(premiere.id)
      return
    }

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
   * Rend toutes les lignes à leur état enregistré.
   *
   * Utile après avoir coché de travers sur 72 lignes : les reprendre une à une
   * avec le bouton de chaque ligne serait interminable.
   */
  const resetAll = async () => {
    const touchees = order.lines.filter((l) => {
      const d = draft[l.id]
      const ref = l.quantityServed === null ? String(l.quantityAsked) : String(l.quantityServed)
      return d?.status !== l.status || d?.served !== ref || d?.reason !== (l.rejectReason ?? '')
    }).length

    if (touchees === 0) return

    const ok = await confirmer({
      title: 'Tout réinitialiser',
      confirmLabel: 'Réinitialiser',
      tone: 'warn',
      message: (
        <>
          <p>
            Annuler vos {touchees} modification{touchees > 1 ? 's' : ''} en cours et revenir
            à l’état enregistré ?
          </p>
          <p className="mt-2 text-[0.82rem] text-fg-subtle">
            Ce qui a déjà été enregistré est conservé.
          </p>
        </>
      ),
    })
    if (!ok) return

    setDraft(initial())
    push('success', 'Lignes réinitialisées.')
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
      <GlassCard>
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
          <StatusBadge status={order.status} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 sm:px-5">
          <Badge tone="neutral" className="capitalize">{formatLongDate(order.businessDay)}</Badge>
          <Badge tone="neutral">{order.lineCount} article{order.lineCount > 1 ? 's' : ''}</Badge>

          {/* Cliquables : un compte qui ne mène nulle part oblige à parcourir
              cent lignes pour retrouver les trois qu'il désigne. Chaque clic
              conduit à la suivante, puis revient à la première. */}
          {counts.rejected > 0 ? (
            <BadgeLien
              tone="danger"
              onClick={() => parcourir('REJECTED')}
              label={`Voir les ${counts.rejected} ligne(s) en rupture`}
            >
              {counts.rejected} rupture(s)
            </BadgeLien>
          ) : null}

          {counts.adjusted > 0 ? (
            <BadgeLien
              tone="warn"
              onClick={() => parcourir('ADJUSTED')}
              label={`Voir les ${counts.adjusted} ligne(s) ajustée(s)`}
            >
              {counts.adjusted} ajustée{counts.adjusted > 1 ? 's' : ''}
            </BadgeLien>
          ) : null}
        </div>

        {order.note ? (
          <p className="border-t border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 text-[0.83rem] italic text-fg-muted sm:px-5">
            {order.note}
          </p>
        ) : null}

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
              <Button variant="ghost" size="sm" onClick={() => void resetAll()}>
                <RotateCcw className="size-3.5" />
                Tout réinitialiser
              </Button>
              <Button variant="secondary" size="sm" loading={busy === 'save'} onClick={save}>
                {busy !== 'save' ? <Save className="size-3.5" /> : null}
                Enregistrer
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
                Émettre le bon de livraison
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
            {lignes.map((l, i) => {
              // Un bandeau ouvre chaque famille : on sert le rayon d'un bloc,
              // pas article par article dans le désordre.
              const ouvreFamille = i === 0 || lignes[i - 1].categoryName !== l.categoryName
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
                    <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{i + 1}</Td>
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
                            setLine(l.id, { served: v })
                          }}
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

/**
 * Compteur cliquable, qui conduit aux lignes qu'il dénombre.
 *
 * Il a l'apparence d'un badge mais le comportement d'un bouton : il ne change
 * rien à la commande, il déplace seulement le regard.
 */
function BadgeLien({
  tone, onClick, label, children,
}: {
  tone: 'danger' | 'warn'
  onClick: () => void
  /** Ce que le bouton fait, pour les lecteurs d'écran et l'infobulle. */
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5',
        'text-[0.8rem] font-medium leading-5 tracking-tight sm:text-[0.72rem]',
        'cursor-pointer transition-colors',
        tone === 'danger'
          ? 'border-danger/30 bg-danger/12 text-danger hover:bg-danger/20'
          : 'border-warn/30 bg-warn/14 text-warn hover:bg-warn/24',
      )}
    >
      {children}
      <ChevronRight className="size-3.5" />
    </button>
  )
}

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
