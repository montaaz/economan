'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Check, Ban, Pencil, Printer, Truck, PackageOpen, Save, RotateCcw,
} from 'lucide-react'
import { GlassCard, Button, Badge, TableWrap, Th, Td } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import { StatusBadge } from '@/components/ui/status'
import { ticketVariant } from '@/components/ui/ticket'
import { gql, errorMessage } from '@/lib/graphql-client'
import { cn, formatLongDate, formatQty, formatTime, toNumber } from '@/lib/utils'
import type { LineStatus, ProcessOrder } from '@/lib/order-types'

export type { ProcessLine, ProcessOrder } from '@/lib/order-types'

const ACCEPT = /* GraphQL */ `mutation Accept($id: ID!) { acceptOrder(id: $id) { id status } }`
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

  const save = () =>
    call('save', () => gql(SET_LINES, { id: order.id, lines: payload() }), 'Lignes enregistrées.')

  const deliver = async () => {
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
          <Badge tone="accent">{formatQty(order.totalAsked)} demandé</Badge>
          <Badge tone="ok">{formatQty(closed ? order.totalServed : servedTotal)} servi</Badge>
          {counts.rejected > 0 ? <Badge tone="danger">{counts.rejected} rupture(s)</Badge> : null}
        </div>

        {order.note ? (
          <p className="border-t border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 text-[0.83rem] italic text-fg-muted sm:px-5">
            {order.note}
          </p>
        ) : null}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
          {/* Le libellé nomme ce qui sort de l'imprimante, et suit donc la
              même règle que la feuille elle-même. */}
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="size-3.5" />
            {{
              ticket: 'Imprimer le ticket',
              commande: 'Imprimer le bon de commande',
              livraison: 'Imprimer le bon de livraison',
            }[ticketVariant(order.status)]}
          </Button>

          {order.status === 'PENDING' ? (
            <Button variant="primary" loading={busy === 'accept'} onClick={accept}>
              {busy !== 'accept' ? <PackageOpen className="size-4" /> : null}
              Accepter la commande
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
              <Button variant="success" loading={busy === 'deliver'} onClick={deliver} className="ml-auto">
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
                <strong className="text-fg">{counts.pending}</strong> ligne(s) non traitée(s) — elles
                seront servies telles que demandées à l’émission du bon.
              </>
            ) : (
              <>Toutes les lignes sont traitées.</>
            )}
          </p>
        ) : null}
      </GlassCard>

      {/* Lignes */}
      <GlassCard>
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
            {order.lines.map((l, i) => {
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
                  <tr
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
                      <p className="truncate text-[0.7rem] text-fg-subtle">
                        <span className="font-mono">{l.productRef}</span>
                        <span className="mx-1.5">·</span>
                        {l.categoryName}
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
                            // Non traitée : on montre déjà ce qui sera servi —
                            // les lignes non touchées partent telles quelles —
                            // mais en gris, car rien n'est encore décidé.
                            status === 'PENDING' && 'text-fg-subtle',
                          )}
                        >
                          {status === 'REJECTED'
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
                            active={status === 'VALIDATED'}
                            tone="ok"
                            label="Valider"
                            onClick={() =>
                              setLine(l.id, { status: 'VALIDATED', served: String(l.quantityAsked) })
                            }
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

function LineAction({
  active, tone, label, onClick, children,
}: {
  active: boolean
  tone: keyof typeof ACTION_TONES
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-lg border transition-colors',
        active
          ? ACTION_TONES[tone]
          : 'border-[rgb(var(--glass-edge)/0.3)] bg-white/50 text-fg-subtle hover:bg-white/90 hover:text-fg',
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
