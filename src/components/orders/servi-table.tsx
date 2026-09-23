'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Save, Undo2, X } from 'lucide-react'
import { GlassCard, Badge, Button, TableWrap, Th, Td } from '@/components/ui/glass'
import { SearchField } from '@/components/ui/search-field'
import { useConfirm } from '@/components/ui/confirm'
import { useToast } from '@/components/ui/toast'
import { gql, errorMessage } from '@/lib/graphql-client'
import { correspond, normaliser } from '@/lib/search'
import { cn, formatQty, toNumber } from '@/lib/utils'

export type ServiLigne = {
  id: string
  /** La ligne de commande derrière cette ligne de servi. */
  lineId?: string
  rang: number
  productName: string
  productRef: string
  categoryName: string
  unitSymbol: string
  quantityAsked: number
  firstServed: number
  quantity: number
  remaining: number
  /** Au plus, sur ce passage : ce que les autres laissent encore à servir. */
  plafond?: number
  /** Les servis intermédiaires, par rang. */
  parRang: Record<number, number>
}

export type Candidat = {
  lineId: string
  rang: number
  productName: string
  productRef: string
  unitSymbol: string
  reste: number
}

const SET_LINES = /* GraphQL */ `
  mutation SetRefillLines($id: ID!, $lines: [RefillInput!]!) { setRefillLines(id: $id, lines: $lines) }
`

/**
 * Le tableau d'un servi, avec sa recherche — et, pour l'administration, sa
 * correction.
 *
 * La page reste rendue côté serveur ; seul le tableau vit côté client. En
 * mode correction, la colonne du servi devient saisissable, une ligne se
 * retire d'une croix, une autre s'ajoute depuis les lignes du ticket qui
 * attendent encore. Rien ne part avant « Enregistrer ».
 */
export function ServiTable({
  lignes, rang, rangsAvant, edition = null,
}: {
  lignes: ServiLigne[]
  rang: number
  rangsAvant: number[]
  /** Présent quand l'administration peut corriger ce servi. */
  edition?: { refillId: string; retour: string; candidats: Candidat[] } | null
}) {
  const router = useRouter()
  const confirmer = useConfirm()
  const { push } = useToast()
  const [recherche, setRecherche] = React.useState('')
  const [modif, setModif] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  // Les quantités en cours, par ligne de commande ; « '' » vaut zéro.
  const [saisie, setSaisie] = React.useState<Record<string, string>>({})
  // Les lignes ajoutées depuis le ticket, dans l'ordre où on les a prises.
  const [ajouts, setAjouts] = React.useState<Candidat[]>([])
  const [choix, setChoix] = React.useState('')

  const mot = normaliser(recherche)
  const visibles = lignes.filter((l) => correspond(mot, l.productName, l.productRef, l.categoryName))
  const colonnes = 7 + rangsAvant.length + (modif ? 1 : 0)

  const commencer = () => {
    const s: Record<string, string> = {}
    for (const l of lignes) if (l.lineId) s[l.lineId] = String(l.quantity)
    setSaisie(s)
    setAjouts([])
    setModif(true)
  }
  const annuler = () => { setModif(false); setSaisie({}); setAjouts([]); setChoix('') }

  const poser = (lineId: string, v: string, plafond: number, nom: string) => {
    const n = v.replace(',', '.')
    if (n !== '' && !/^\d*\.?\d*$/.test(n)) return
    if (n !== '' && toNumber(n) > plafond) {
      void confirmer({
        title: 'Quantité trop élevée',
        message: `${nom} : au plus ${formatQty(plafond)} à servir sur ce passage.`,
        single: true, tone: 'warn', confirmLabel: 'OK',
      })
      return
    }
    setSaisie((s) => ({ ...s, [lineId]: n }))
  }

  const ajouter = () => {
    const c = edition?.candidats.find((x) => x.lineId === choix)
    if (!c || ajouts.some((a) => a.lineId === c.lineId)) return
    setAjouts((a) => [...a, c])
    setSaisie((s) => ({ ...s, [c.lineId]: '' }))
    setChoix('')
  }
  const retirerAjout = (lineId: string) => {
    setAjouts((a) => a.filter((x) => x.lineId !== lineId))
    setSaisie((s) => { const n = { ...s }; delete n[lineId]; return n })
  }

  const enregistrer = async () => {
    if (!edition) return
    const lines = Object.entries(saisie).map(([lineId, v]) => ({ lineId, quantity: toNumber(v) }))
    const vide = lines.every((l) => l.quantity <= 0)
    const ok = await confirmer({
      title: `Enregistrer le ${rang}ᵉ servi ?`,
      message: vide
        ? 'Toutes les quantités sont à zéro : ce servi sera supprimé.'
        : `Les quantités du ${rang}ᵉ servi seront remplacées par celles saisies. Le bon devra être réémis.`,
      confirmLabel: 'Enregistrer',
      tone: vide ? 'danger' : 'warn',
    })
    if (!ok) return
    setBusy(true)
    try {
      const d = await gql<{ setRefillLines: boolean }>(SET_LINES, { id: edition.refillId, lines })
      if (d.setRefillLines) {
        push('success', `${rang}ᵉ servi supprimé : il ne portait plus aucune ligne.`)
        router.push(edition.retour)
        return
      }
      push('success', `${rang}ᵉ servi enregistré.`)
      annuler()
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const disponibles = (edition?.candidats ?? []).filter((c) => !ajouts.some((a) => a.lineId === c.lineId))

  return (
    <GlassCard overflowVisible>
      <div className="no-print flex flex-wrap items-center gap-2 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
        <SearchField value={recherche} onChange={setRecherche} className="min-w-0 flex-1 basis-56 sm:max-w-md" />
        {edition ? (
          modif ? (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={annuler} disabled={busy}>
                <Undo2 className="size-3.5" />
                Annuler
              </Button>
              <Button variant="primary" size="sm" loading={busy} onClick={enregistrer}>
                {!busy ? <Save className="size-3.5" /> : null}
                Enregistrer
              </Button>
            </div>
          ) : (
            <Button variant="secondary" size="sm" className="ml-auto" onClick={commencer}>
              <Pencil className="size-3.5" />
              Modifier ce servi
            </Button>
          )
        ) : null}
      </div>

      {modif && edition ? (
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-[rgb(var(--glass-edge)/0.16)] bg-warn/[0.06] px-4 py-2.5 text-[0.83rem] sm:px-5">
          <span className="font-medium text-fg">Ajouter un article du ticket :</span>
          <select
            value={choix}
            onChange={(e) => setChoix(e.target.value)}
            aria-label="Article à ajouter"
            className="field h-9 min-w-0 flex-1 basis-64 px-2 text-[0.83rem]"
          >
            <option value="">— choisir —</option>
            {disponibles.map((c) => (
              <option key={c.lineId} value={c.lineId}>
                {c.rang}. {c.productName} — reste {formatQty(c.reste)} {c.unitSymbol}
              </option>
            ))}
          </select>
          <Button variant="secondary" size="sm" onClick={ajouter} disabled={choix === ''}>
            <Plus className="size-3.5" />
            Ajouter
          </Button>
        </div>
      ) : null}

      <TableWrap minWidth={`${44 + rangsAvant.length * 6 + (modif ? 4 : 0)}rem`}>
        <thead>
          <tr>
            <Th className="w-10 text-right">#</Th>
            <Th className="w-full">Article</Th>
            <Th className="text-right">Commande</Th>
            <Th className="text-right">1ᵉʳ servi</Th>
            {rangsAvant.map((r) => (
              <Th key={r} className="text-right">{r}ᵉ servi</Th>
            ))}
            <Th className="text-right">{rang}ᵉ servi</Th>
            <Th className="text-right">Reste</Th>
            <Th>État</Th>
            {modif ? <Th className="w-10" /> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
          {visibles.length === 0 && ajouts.length === 0 ? (
            <tr>
              <td colSpan={colonnes} className="px-4 py-6 text-center text-[0.85rem] text-fg-muted">
                Aucun article ne correspond à « {recherche} ».
              </td>
            </tr>
          ) : null}
          {visibles.map((l, i) => {
            const enCours = modif && l.lineId ? toNumber(saisie[l.lineId] ?? '') : l.quantity
            // En correction, le reste suit la saisie : on voit tout de suite
            // ce que la quantité posée laisse encore dû.
            const reste = modif ? Math.max((l.plafond ?? 0) - enCours, 0) : l.remaining
            const solde = reste === 0
            return (
              <tr key={l.id} className={cn(solde ? 'bg-ok/[0.08]' : 'bg-warn/[0.07]')}>
                <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{l.rang || i + 1}</Td>
                <Td className="max-w-0">
                  <p className="truncate text-[0.85rem] font-medium text-fg">{l.productName}</p>
                  <p className="truncate font-mono text-[0.7rem] text-fg-subtle">{l.productRef}</p>
                </Td>
                <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">
                  {formatQty(l.quantityAsked)} {l.unitSymbol}
                </Td>
                <Td className="whitespace-nowrap text-right tabular-nums">
                  {l.firstServed === 0 ? (
                    <span className="font-semibold text-danger">Rupture</span>
                  ) : (
                    <span className="text-fg-muted">{formatQty(l.firstServed)} {l.unitSymbol}</span>
                  )}
                </Td>
                {rangsAvant.map((r) => {
                  const q = l.parRang[r] ?? 0
                  return (
                    <Td key={r} className="whitespace-nowrap text-right tabular-nums text-fg-muted">
                      {q > 0 ? `${formatQty(q)} ${l.unitSymbol}` : <span className="text-fg-subtle">—</span>}
                    </Td>
                  )
                })}
                <Td className="whitespace-nowrap text-right font-bold tabular-nums text-fg">
                  {modif && l.lineId ? (
                    <span className="inline-flex items-center justify-end gap-1">
                      <input
                        inputMode="decimal"
                        value={saisie[l.lineId] ?? ''}
                        onChange={(e) => poser(l.lineId!, e.target.value, l.plafond ?? 0, l.productName)}
                        aria-label={`${rang}e servi — ${l.productName}`}
                        className="field h-9 w-20 px-2 py-0 text-right text-[0.85rem] tabular-nums"
                      />
                      <span className="w-6 text-left text-[0.75rem] font-medium text-fg-muted">{l.unitSymbol}</span>
                    </span>
                  ) : (
                    <>{formatQty(l.quantity)} {l.unitSymbol}</>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-right font-bold tabular-nums">
                  {solde ? (
                    <span className="text-ok">—</span>
                  ) : (
                    <span className="text-warn">{formatQty(reste)} {l.unitSymbol}</span>
                  )}
                </Td>
                <Td>
                  <Badge tone={solde ? 'ok' : 'warn'}>{solde ? 'Soldé' : 'Encore dû'}</Badge>
                </Td>
                {modif ? (
                  <Td>
                    {l.lineId ? (
                      <button
                        type="button"
                        onClick={() => setSaisie((s) => ({ ...s, [l.lineId!]: '' }))}
                        title="Retirer cette ligne du servi"
                        aria-label={`Retirer ${l.productName} du servi`}
                        className="grid size-7 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <X className="size-4" />
                      </button>
                    ) : null}
                  </Td>
                ) : null}
              </tr>
            )
          })}
          {modif ? ajouts.map((c) => {
            const q = toNumber(saisie[c.lineId] ?? '')
            const reste = Math.max(c.reste - q, 0)
            return (
              <tr key={`ajout-${c.lineId}`} className="bg-info/[0.07]">
                <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{c.rang}</Td>
                <Td className="max-w-0">
                  <p className="truncate text-[0.85rem] font-medium text-fg">{c.productName}</p>
                  <p className="truncate font-mono text-[0.7rem] text-fg-subtle">{c.productRef} · ajouté</p>
                </Td>
                <Td colSpan={2 + rangsAvant.length} className="text-right text-[0.78rem] text-fg-muted">
                  reste {formatQty(c.reste)} {c.unitSymbol}
                </Td>
                <Td className="whitespace-nowrap text-right font-bold tabular-nums text-fg">
                  <span className="inline-flex items-center justify-end gap-1">
                    <input
                      inputMode="decimal"
                      value={saisie[c.lineId] ?? ''}
                      onChange={(e) => poser(c.lineId, e.target.value, c.reste, c.productName)}
                      aria-label={`${rang}e servi — ${c.productName}`}
                      className="field h-9 w-20 px-2 py-0 text-right text-[0.85rem] tabular-nums"
                      autoFocus
                    />
                    <span className="w-6 text-left text-[0.75rem] font-medium text-fg-muted">{c.unitSymbol}</span>
                  </span>
                </Td>
                <Td className="whitespace-nowrap text-right font-bold tabular-nums">
                  {reste === 0 ? <span className="text-ok">—</span> : <span className="text-warn">{formatQty(reste)} {c.unitSymbol}</span>}
                </Td>
                <Td><Badge tone="info">Ajout</Badge></Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => retirerAjout(c.lineId)}
                    title="Ne pas ajouter cette ligne"
                    aria-label={`Ne pas ajouter ${c.productName}`}
                    className="grid size-7 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <X className="size-4" />
                  </button>
                </Td>
              </tr>
            )
          }) : null}
        </tbody>
      </TableWrap>
    </GlassCard>
  )
}
