'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ListChecks, PackageCheck, Printer, RotateCcw } from 'lucide-react'
import { Button, Badge, TableWrap, Th, Td } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { FamilyBand, countByFamily } from '@/components/ui/family-band'
import { useToast } from '@/components/ui/toast'
import { gql, errorMessage } from '@/lib/graphql-client'
import { cn, formatQty, toNumber } from '@/lib/utils'

const ADD_REFILL = /* GraphQL */ `
  mutation AddRefill($id: ID!, $lines: [RefillInput!]!) {
    addRefill(id: $id, lines: $lines) { id rank }
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
  const [busy, setBusy] = React.useState(false)
  const [saisie, setSaisie] = React.useState<Record<string, string>>({})
  // Les bons du dernier passage enregistré : c'est maintenant qu'on les
  // imprime, pas en retrouvant la commande plus tard.
  const [bons, setBons] = React.useState<{ id: string; ref: string; rang: number }[]>([])

  // Une ligne entièrement servie n'attend plus rien : elle sort de la saisie
  // mais reste visible, pour qu'on voie qu'elle est soldée.
  const aServir = service.lignes.filter((l) => reste(l) > 0)

  const parFamille = countByFamily(service.lignes)

  const set = (id: string, v: string) => {
    const n = v.replace(',', '.')
    if (n !== '' && !/^\d*\.?\d*$/.test(n)) return
    const ligne = service.lignes.find((l) => l.id === id)
    if (ligne && n !== '' && toNumber(n) > reste(ligne)) {
      push('error',
        `${ligne.productName} : il ne reste que ${formatQty(reste(ligne))} ${ligne.unitSymbol} à servir.`)
      return
    }
    setSaisie((s) => ({ ...s, [id]: n }))
  }

  const toutServir = () => {
    setSaisie(Object.fromEntries(aServir.map((l) => [l.id, String(reste(l))])))
    push('info', `${aServir.length} ligne(s) au reste à servir.`)
  }

  const vider = () => setSaisie({})

  // Les lignes saisies, groupées par commande : chaque ticket a son passage.
  const parCommande = React.useMemo(() => {
    const m = new Map<string, { ref: string; lines: { lineId: string; quantity: number }[] }>()
    for (const l of service.lignes) {
      const v = (saisie[l.id] ?? '').trim()
      if (v === '' || toNumber(v) <= 0) continue
      const e = m.get(l.orderId) ?? { ref: l.orderRef, lines: [] }
      e.lines.push({ lineId: l.id, quantity: toNumber(v) })
      m.set(l.orderId, e)
    }
    return m
  }, [saisie, service.lignes])

  const total = [...parCommande.values()].reduce((n, c) => n + c.lines.length, 0)

  const enregistrer = async () => {
    if (total === 0) {
      push('error', 'Saisissez au moins une quantité.')
      return
    }
    setBusy(true)
    try {
      // Un passage par commande : les bons partent séparément, chacun vers
      // son ticket.
      const crees: { id: string; ref: string; rang: number }[] = []
      for (const [orderId, c] of parCommande) {
        const d = await gql<{ addRefill: { id: string; rank: number } }>(ADD_REFILL, {
          id: orderId, lines: c.lines,
        })
        crees.push({ id: d.addRefill.id, ref: c.ref, rang: d.addRefill.rank })
      }
      setBons(crees)
      push('success',
        `${crees.length} bon(s) prêt(s) : ${crees.map((b) => `${b.ref} — ${b.rang}ᵉ service`).join(' · ')}`)
      setSaisie({})
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Les bons du passage qu'on vient d'enregistrer : chacun ne porte que
          ce qui sort de ce coup-ci. */}
      {bons.length > 0 ? (
        <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border border-info/30 bg-info/[0.08] px-4 py-3">
          <p className="text-[0.85rem] font-medium text-fg">
            Service enregistré — imprimez le bon :
          </p>
          {bons.map((b) => (
            <a
              key={b.id}
              href={`/api/bon-service/${b.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-info/40 bg-white/70 px-2.5 py-1 text-[0.8rem] font-semibold text-info transition-colors hover:bg-white"
            >
              <Printer className="size-3.5" />
              {b.ref} — {b.rang}ᵉ service
            </a>
          ))}
        </div>
      ) : null}

      {/* Barre d'action : ce qu'on s'apprête à sortir. */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ok/30 bg-ok/[0.07] px-4 py-3">
        <p className="text-[0.85rem] leading-snug text-fg">
          La marchandise est arrivée : saisissez ce qui sort pour ce passage.
          {' '}
          <span className="font-semibold">
            {aServir.length} ligne{aServir.length > 1 ? 's' : ''} en attente
          </span>
          {total > 0 ? (
            <span className="font-semibold text-ok"> · {total} saisie{total > 1 ? 's' : ''}</span>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={toutServir}>
            <ListChecks className="size-3.5" />
            Tout servir
          </Button>
          {total > 0 ? (
            <Button variant="ghost" size="sm" onClick={vider}>
              <RotateCcw className="size-3.5" />
              Vider
            </Button>
          ) : null}
          <Button variant="success" size="sm" loading={busy} onClick={enregistrer}>
            {!busy ? <PackageCheck className="size-4" /> : null}
            Enregistrer le service
          </Button>
        </div>
      </div>

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

        <TableWrap minWidth="52rem">
          <thead>
            <tr>
              <Th className="w-10 text-right">#</Th>
              <Th className="w-full">Article</Th>
              <Th className="text-right">Commande</Th>
              <Th className="text-right">Déjà servi</Th>
              <Th className="text-right">Reste</Th>
              {/* La colonne de saisie : ce qui sort à ce passage. */}
              <Th className="w-32 text-right">Ce service</Th>
              <Th>État</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
            {service.lignes.map((l, i) => {
              const r = reste(l)
              const saisi = (saisie[l.id] ?? '').trim()
              const servi = (l.quantityServed ?? 0) + l.quantityRefilled
              return (
                <React.Fragment key={l.id}>
                  {i === 0 || service.lignes[i - 1].categoryName !== l.categoryName ? (
                    <FamilyBand
                      name={l.categoryName}
                      count={parFamille.get(l.categoryName) ?? 0}
                      colSpan={7}
                    />
                  ) : null}
                  <tr
                    className={cn(
                      r === 0 && 'bg-ok/[0.07]',
                      r > 0 && l.status === 'REJECTED' && 'bg-danger/[0.06]',
                      r > 0 && l.status === 'ADJUSTED' && 'bg-warn/[0.07]',
                      saisi !== '' && toNumber(saisi) > 0 && '!bg-ok/[0.16]',
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
                    <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">
                      {formatQty(servi)} {l.unitSymbol}
                    </Td>
                    <Td className="whitespace-nowrap text-right font-bold tabular-nums">
                      {r === 0 ? (
                        <span className="text-ok">—</span>
                      ) : (
                        <span className="text-danger">{formatQty(r)} {l.unitSymbol}</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      {r === 0 ? (
                        <span className="text-[0.8rem] text-fg-subtle">soldé</span>
                      ) : (
                        <input
                          inputMode="decimal"
                          value={saisie[l.id] ?? ''}
                          onChange={(e) => set(l.id, e.target.value)}
                          placeholder="0"
                          aria-label={`Quantité servie pour ${l.productName}`}
                          className="field h-9 w-24 px-2 py-0 text-right text-[0.85rem] tabular-nums"
                        />
                      )}
                    </Td>
                    <Td>
                      {r === 0 ? (
                        <Badge tone="ok">Soldé</Badge>
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
