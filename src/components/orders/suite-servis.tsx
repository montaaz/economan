'use client'

import * as React from 'react'
import Link from 'next/link'
import { Truck, PackagePlus, PackageCheck, UserCheck, MessageSquareWarning, ExternalLink, Check, X, ClipboardList, Layers } from 'lucide-react'
import { GlassCard, Badge } from '@/components/ui/glass'
import { ServiTable, type ServiLigne } from './servi-table'
import { cn, formatTime } from '@/lib/utils'

export type ServiResume = {
  id: string
  rank: number
  createdAt: string
  deliveredAt: string | null
  receivedAt: string | null
  createdBy: string | null
  receivedBy: string | null
  receptionNote: string | null
  lineCount: number
  /** La fiche du passage seul (l'administration y corrige) ; sa réception, pour l'employé. */
  href: string
}

/**
 * Les passages d'une suite de commande, et le tableau qu'ils filtrent.
 *
 * Cliquer un passage ne quitte pas la page : il ne garde dans le tableau que
 * les articles que ce passage a servis, colonnes intactes. Le même clic, ou
 * « Tous », rend la liste entière. La fiche du passage seul reste à portée,
 * par un petit lien à part.
 */
export function SuiteServis({ servis, lignes, toutesLignes, dernier, rangsAvant, entete, employe, retour, actions, lienCommande }: {
  servis: ServiResume[]
  /** Les articles qu'un passage a touchés. */
  lignes: ServiLigne[]
  /** Toute la commande, ligne par ligne, avec les mêmes colonnes. */
  toutesLignes: ServiLigne[]
  dernier: number
  rangsAvant: number[]
  entete: React.ReactNode
  employe: boolean
  retour: React.ReactNode
  actions?: React.ReactNode
  /** La fiche de la commande principale, pour qui veut la traiter ou l'imprimer. */
  lienCommande: string
}) {
  const [filtre, setFiltre] = React.useState<number | null>(null)
  // « Voir toute la commande » : les 109 lignes, pas seulement celles que la
  // suite a complétées — avec les mêmes colonnes, du 1ᵉʳ servi au dernier.
  const [toute, setToute] = React.useState(false)
  const source = toute ? toutesLignes : lignes
  const visibles = filtre === null ? source : source.filter((l) => (l.parRang[filtre] ?? 0) > 0)

  return (
    <>
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        {retour}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setToute((v) => !v)}
            aria-pressed={toute}
            className={cn('inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[0.83rem] font-semibold transition-colors',
              toute ? 'border-accent/50 bg-accent/12 text-accent' : 'border-[rgb(var(--glass-edge)/0.34)] bg-white/65 text-fg hover:bg-white')}
          >
            {toute ? <Check className="size-4" /> : <Layers className="size-4" />}
            {toute ? `Toute la commande · ${toutesLignes.length} articles` : 'Voir toute la commande'}
          </button>
          <Link href={lienCommande} title="Ouvrir la fiche de la commande principale" className="inline-flex items-center gap-1.5 rounded-xl border border-[rgb(var(--glass-edge)/0.34)] bg-white/65 px-3 py-2 text-[0.83rem] font-semibold text-fg transition-colors hover:bg-white">
            <ClipboardList className="size-4" />
            Fiche
          </Link>
          {actions}
        </div>
      </div>
      <GlassCard>
        {entete}
        <ul className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
          {servis.map((r) => {
            const actif = filtre === r.rank
            return (
              <li key={r.id} className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-[0.83rem] transition-colors sm:px-5', actif && 'bg-accent/[0.08]')}>
                <button
                  type="button"
                  onClick={() => setFiltre(actif ? null : r.rank)}
                  aria-pressed={actif}
                  title={actif ? 'Afficher de nouveau tous les articles' : `N’afficher que les articles du ${r.rank}ᵉ servi`}
                  className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg text-left"
                >
                  <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-bold', actif ? 'bg-accent text-white' : 'bg-[rgb(var(--glass-edge)/0.16)] text-fg')}>
                    {actif ? <Check className="size-3.5" /> : null}{r.rank}ᵉ servi
                  </span>
                  <span className="tabular-nums"><span className="font-semibold text-fg">Servi </span><span className="font-bold text-accent">{formatTime(r.createdAt)}</span>{r.createdBy ? <span className="text-fg-muted"> par {r.createdBy}</span> : null}</span>
                  {r.deliveredAt ? <span className="tabular-nums"><Truck className="mr-1 inline size-3.5 text-info" /><span className="font-semibold text-fg">Bon </span><span className="font-bold text-accent">{formatTime(r.deliveredAt)}</span></span> : null}
                  <span className="text-fg-muted">{r.lineCount} article{r.lineCount > 1 ? 's' : ''}</span>
                  {r.receptionNote ? <span className="flex items-center gap-1 text-danger"><MessageSquareWarning className="size-3.5" />{r.receptionNote}</span> : null}
                </button>
                <span className="flex items-center gap-2">
                  {r.receivedAt ? (
                    <Badge tone="ok" icon={<UserCheck className="size-3.5" />}>Reçu par {r.receivedBy ?? 'le département'} à {formatTime(r.receivedAt)}</Badge>
                  ) : !r.deliveredAt ? (
                    <Badge tone="warn" icon={<PackagePlus className="size-3.5" />}>Ouvert</Badge>
                  ) : employe ? (
                    <Link href={r.href} className="inline-flex items-center gap-1 rounded-full border border-info/40 bg-info/10 px-2.5 py-0.5 text-[0.78rem] font-semibold text-info hover:bg-info/15"><PackageCheck className="size-3.5" />Réceptionner</Link>
                  ) : (
                    <Badge tone="info" icon={<PackageCheck className="size-3.5" />}>À réceptionner</Badge>
                  )}
                  {!employe ? (
                    <Link href={r.href} title={`Ouvrir la fiche du ${r.rank}ᵉ servi`} aria-label={`Ouvrir la fiche du ${r.rank}ᵉ servi`}
                      className="grid size-7 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-accent/[0.1] hover:text-accent">
                      <ExternalLink className="size-3.5" />
                    </Link>
                  ) : null}
                </span>
              </li>
            )
          })}
          {servis.length === 0 ? <li className="px-4 py-4 text-[0.85rem] text-fg-muted sm:px-5">Aucun servi après le premier pour cette commande.</li> : null}
        </ul>
        {filtre !== null || toute ? (
          <p className="flex flex-wrap items-center gap-2 border-t border-[rgb(var(--glass-edge)/0.16)] px-4 py-2 text-[0.8rem] text-fg-muted sm:px-5">
            {filtre !== null
              ? `Seuls les ${visibles.length} article${visibles.length > 1 ? 's' : ''} du ${filtre}ᵉ servi sont affichés.`
              : `Toute la commande : ${visibles.length} article${visibles.length > 1 ? 's' : ''}, y compris ceux soldés dès le 1ᵉʳ servi.`}
            <button type="button" onClick={() => { setFiltre(null); setToute(false) }} className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--glass-edge)/0.3)] px-2 py-0.5 font-semibold text-fg hover:bg-white"><X className="size-3.5" />{toute && filtre === null ? 'Revenir à la suite' : 'Tous les articles de la suite'}</button>
          </p>
        ) : null}
      </GlassCard>

      {dernier >= 2 ? <ServiTable lignes={visibles} rang={dernier} rangsAvant={rangsAvant} edition={null} /> : null}
    </>
  )
}
