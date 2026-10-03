'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { Check, Clock, Loader2, RotateCcw, Users } from 'lucide-react'
import { GlassCard, Button, EmptyState, TableWrap, Th, Td } from '@/components/ui/glass'
import { SearchField } from '@/components/ui/search-field'
import { useToast } from '@/components/ui/toast'
import { gql, errorMessage } from '@/lib/graphql-client'
import { correspond, normaliser } from '@/lib/search'
import { cn } from '@/lib/utils'

/**
 * Le réglage des horaires de commande.
 *
 * En haut, la plage générale : elle vaut pour tous les départements. En
 * dessous, les utilisateurs : chacun suit la plage générale, sauf si on lui
 * en donne une. Des raccourcis posent d'un geste les horaires habituels —
 * ramadan, été — qu'on ajuste ensuite à la minute.
 */

const QUERY = /* GraphQL */ `
  query OrderSchedule {
    orderSchedule {
      enabled opensAt closesAt label now
      users { userId fullName username departmentId departmentName departmentColor opensAt closesAt }
    }
  }
`
const SET_GENERAL = /* GraphQL */ `
  mutation SetOrderSchedule($enabled: Boolean!, $opensAt: String!, $closesAt: String!, $label: String) {
    setOrderSchedule(enabled: $enabled, opensAt: $opensAt, closesAt: $closesAt, label: $label)
  }
`
const SET_USERS = /* GraphQL */ `
  mutation SetUsersOrderSchedule($userIds: [ID!]!, $opensAt: String, $closesAt: String) {
    setUsersOrderSchedule(userIds: $userIds, opensAt: $opensAt, closesAt: $closesAt)
  }
`

type Utilisateur = {
  userId: string; fullName: string; username: string
  departmentId: string | null; departmentName: string | null; departmentColor: string | null
  opensAt: string | null; closesAt: string | null
}
type Horaire = { enabled: boolean; opensAt: string; closesAt: string; label: string | null; now: string; users: Utilisateur[] }

const RACCOURCIS = [
  { nom: 'Normal', opensAt: '08:00', closesAt: '12:00' },
  { nom: 'Été', opensAt: '07:00', closesAt: '11:00' },
  { nom: 'Ramadan', opensAt: '20:00', closesAt: '02:00' },
]

/** L'heure tombe-t-elle dans la plage ? La même règle que le serveur. */
function ouvert(heure: string, de: string, a: string): boolean {
  if (de === a) return true
  if (de < a) return heure >= de && heure < a
  return heure >= de || heure < a
}
/** « de 20:00 à 02:00 (le lendemain) » : une plage qui passe minuit se dit. */
function libellePlage(de: string, a: string): string {
  if (de === a) return 'toute la journée'
  return `de ${de} à ${a}${de > a ? ' (le lendemain)' : ''}`
}

/**
 * Le choix d'une heure, sur 24 heures.
 *
 * Un bouton affiche l'heure en grand ; il ouvre un panneau avec la grille
 * des heures et celle des minutes. Les listes déroulantes du navigateur
 * s'ouvraient en longue colonne grise, par-dessus la page : ici, deux clics
 * et c'est réglé, sur ordinateur comme sur téléphone.
 */
function ChampHeure({ value, onChange, label, disabled }: { value: string; onChange: (v: string) => void; label: string; disabled?: boolean }) {
  const [h, m] = (/^\d{2}:\d{2}$/.test(value) ? value : '08:00').split(':')
  const [ouvert, setOuvert] = React.useState(false)
  const bouton = React.useRef<HTMLButtonElement>(null)
  const panneau = React.useRef<HTMLDivElement>(null)
  const [pos, setPos] = React.useState<{ left: number; top?: number; bottom?: number } | null>(null)

  React.useLayoutEffect(() => {
    if (!ouvert) return
    const maj = () => {
      const r = bouton.current?.getBoundingClientRect(); if (!r) return
      const largeur = 304
      const left = Math.max(8, Math.min(r.left, window.innerWidth - largeur - 8))
      const enBas = window.innerHeight - r.bottom
      setPos(enBas < 330 && r.top > enBas ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: r.bottom + 6 })
    }
    maj()
    window.addEventListener('scroll', maj, true); window.addEventListener('resize', maj)
    return () => { window.removeEventListener('scroll', maj, true); window.removeEventListener('resize', maj) }
  }, [ouvert])
  React.useEffect(() => {
    if (!ouvert) return
    const clic = (e: MouseEvent) => {
      const t = e.target as Node
      if (panneau.current?.contains(t) || bouton.current?.contains(t)) return
      setOuvert(false)
    }
    const clavier = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false) }
    document.addEventListener('mousedown', clic); document.addEventListener('keydown', clavier)
    return () => { document.removeEventListener('mousedown', clic); document.removeEventListener('keydown', clavier) }
  }, [ouvert])

  const heures = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
  const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))
  const pastille = (actif: boolean) => cn(
    'h-9 rounded-lg text-[0.9rem] font-semibold tabular-nums transition-colors',
    actif ? 'bg-accent text-white shadow-[0_4px_12px_-4px_rgb(47_127_224/0.7)]' : 'text-fg hover:bg-accent/12',
  )

  return (
    <>
      <button ref={bouton} type="button" disabled={disabled} onClick={() => setOuvert((v) => !v)}
        aria-label={`${label} : ${h}:${m}`} aria-expanded={ouvert} aria-haspopup="dialog"
        className={cn('field inline-flex h-11 w-[8.5rem] items-center gap-2 px-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          ouvert && 'border-accent ring-2 ring-accent/25')}>
        <Clock className="size-4 shrink-0 text-accent" />
        <span className="text-[1.15rem] font-bold tabular-nums tracking-wide text-fg">{h}<span className="mx-0.5 text-fg-muted">:</span>{m}</span>
      </button>
      {ouvert && pos ? createPortal(
        <div ref={panneau} role="dialog" aria-label={label}
          style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: 304 }}
          className="animate-rise z-[80] rounded-2xl border border-[rgb(var(--glass-edge)/0.35)] bg-white p-3 shadow-[0_18px_40px_-14px_rgb(var(--shadow-ambient)/0.55)]">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[0.72rem] font-bold uppercase tracking-wide text-fg-muted">{label}</p>
            <p className="text-[1.25rem] font-bold tabular-nums text-accent">{h}:{m}</p>
          </div>
          <p className="mb-1 text-[0.7rem] font-semibold uppercase tracking-wide text-fg-subtle">Heure</p>
          <div className="grid grid-cols-6 gap-1">
            {heures.map((x) => (
              <button key={x} type="button" onClick={() => onChange(`${x}:${m}`)} aria-pressed={x === h} className={pastille(x === h)}>{x}</button>
            ))}
          </div>
          <p className="mb-1 mt-3 text-[0.7rem] font-semibold uppercase tracking-wide text-fg-subtle">Minutes</p>
          <div className="grid grid-cols-6 gap-1">
            {minutes.map((x) => (
              <button key={x} type="button" onClick={() => { onChange(`${h}:${x}`); setOuvert(false) }} aria-pressed={x === m} className={pastille(x === m)}>{x}</button>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="primary" size="sm" onClick={() => setOuvert(false)}><Check className="size-3.5" />OK</Button>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  )
}

export function ScheduleManager() {
  const { push } = useToast()
  const [data, setData] = React.useState<Horaire | null>(null)
  const [erreur, setErreur] = React.useState<string | null>(null)
  const [version, setVersion] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  // La plage générale en cours de réglage.
  const [actif, setActif] = React.useState(false)
  const [de, setDe] = React.useState('08:00')
  const [a, setA] = React.useState('12:00')
  const [nom, setNom] = React.useState('')
  // Les utilisateurs : recherche, filtre, sélection, et la plage à leur poser.
  const [recherche, setRecherche] = React.useState('')
  const [filtre, setFiltre] = React.useState<'tous' | 'perso' | string>('tous')
  const [choisis, setChoisis] = React.useState<string[]>([])
  const [deU, setDeU] = React.useState('08:00')
  const [aU, setAU] = React.useState('12:00')

  React.useEffect(() => {
    let vivant = true
    gql<{ orderSchedule: Horaire }>(QUERY)
      .then((d) => {
        if (!vivant) return
        const h = d.orderSchedule
        setData(h); setErreur(null)
        setActif(h.enabled); setDe(h.opensAt); setA(h.closesAt); setNom(h.label ?? '')
      })
      .catch((e) => { if (vivant) setErreur(errorMessage(e)) })
    return () => { vivant = false }
  }, [version])
  const recharger = () => setVersion((v) => v + 1)

  const change = !!data && (actif !== data.enabled || de !== data.opensAt || a !== data.closesAt || nom.trim() !== (data.label ?? ''))
  const enregistrerGeneral = async () => {
    setBusy(true)
    try {
      await gql(SET_GENERAL, { enabled: actif, opensAt: de, closesAt: a, label: nom.trim() || null })
      push('success', actif ? `Commandes ouvertes ${libellePlage(de, a)}, pour tous.` : 'Horaire général désactivé : on commande à toute heure.')
      recharger()
    } catch (e) { push('error', errorMessage(e)) } finally { setBusy(false) }
  }

  const poser = async (ids: string[], o: string | null, c: string | null) => {
    if (ids.length === 0) return
    setBusy(true)
    try {
      await gql(SET_USERS, { userIds: ids, opensAt: o, closesAt: c })
      push('success', o && c
        ? `${ids.length} utilisateur${ids.length > 1 ? 's' : ''} : commandes ${libellePlage(o, c)}.`
        : `${ids.length} utilisateur${ids.length > 1 ? 's' : ''} : retour à l’horaire général.`)
      setChoisis([])
      recharger()
    } catch (e) { push('error', errorMessage(e)) } finally { setBusy(false) }
  }

  const utilisateurs = data?.users ?? []
  const departements = [...new Map(utilisateurs.filter((u) => u.departmentId).map((u) => [u.departmentId!, { id: u.departmentId!, nom: u.departmentName ?? '', couleur: u.departmentColor ?? '#64748b' }])).values()]
  const mot = normaliser(recherche)
  const visibles = utilisateurs.filter((u) =>
    (filtre === 'tous' || (filtre === 'perso' ? !!u.opensAt : u.departmentId === filtre))
    && correspond(mot, u.fullName, u.username, u.departmentName ?? ''))
  const tousCoches = visibles.length > 0 && visibles.every((u) => choisis.includes(u.userId))
  const nbPerso = utilisateurs.filter((u) => u.opensAt).length

  // Ce qui s'applique à un utilisateur : sa plage, la générale, ou rien.
  const plageDe = (u: Utilisateur) => (u.opensAt && u.closesAt
    ? { de: u.opensAt, a: u.closesAt, perso: true }
    : data?.enabled ? { de: data.opensAt, a: data.closesAt, perso: false } : null)

  if (erreur) return <GlassCard className="p-4"><p role="alert" className="text-[0.85rem] font-medium text-danger">{erreur}</p></GlassCard>
  if (!data) return <GlassCard className="p-4"><p className="flex items-center gap-2 text-[0.85rem] text-fg-muted"><Loader2 className="size-4 animate-spin" /> Chargement…</p></GlassCard>

  const ouvertMaintenant = !actif || ouvert(data.now, de, a)

  return (
    <div className="space-y-4">
      {/* 1. La plage générale : pour tous. */}
      <GlassCard className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-[0.74rem] font-bold uppercase tracking-wide text-accent"><Clock className="size-4" /> Horaire général — tous les départements</p>
            <p className="mt-1 text-[0.84rem] text-fg-muted">Il vaut pour chaque utilisateur qui n’a pas son propre horaire.</p>
          </div>
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.8rem] font-bold', ouvertMaintenant ? 'bg-ok/15 text-ok' : 'bg-danger/12 text-danger')}>
            <span className={cn('size-2 rounded-full', ouvertMaintenant ? 'bg-ok' : 'bg-danger')} />
            Il est {data.now} — commandes {ouvertMaintenant ? 'ouvertes' : 'fermées'}
          </span>
        </div>

        <label className="mt-4 flex w-fit cursor-pointer items-center gap-3">
          <button type="button" role="switch" aria-checked={actif} onClick={() => setActif((v) => !v)} aria-label="Limiter les heures de commande"
            className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', actif ? 'bg-accent' : 'bg-[rgb(var(--glass-edge)/0.6)]')}>
            <span className={cn('absolute top-0.5 size-6 rounded-full bg-white shadow transition-[left]', actif ? 'left-[1.4rem]' : 'left-0.5')} />
          </button>
          <span className="text-[0.92rem] font-semibold text-fg">{actif ? 'Les commandes sont limitées à une plage horaire' : 'Aucune limite : on commande à toute heure'}</span>
        </label>

        <div className={cn('mt-4 flex flex-wrap items-end gap-3', !actif && 'opacity-60')}>
          <label className="block text-[0.8rem] font-medium text-fg-muted">De
            <span className="mt-1 block"><ChampHeure value={de} onChange={setDe} label="Heure d’ouverture des commandes" disabled={!actif} /></span>
          </label>
          <label className="block text-[0.8rem] font-medium text-fg-muted">À
            <span className="mt-1 block"><ChampHeure value={a} onChange={setA} label="Heure de fermeture des commandes" disabled={!actif} /></span>
          </label>
          <label className="block min-w-[12rem] flex-1 text-[0.8rem] font-medium text-fg-muted">Nom de l’horaire <span className="font-normal text-fg-subtle">(facultatif)</span>
            <input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={60} placeholder="Ramadan, Été…" disabled={!actif}
              aria-label="Nom de l’horaire" className="field mt-1 h-11 w-full px-3 text-[0.9rem] disabled:opacity-50" />
          </label>
        </div>
        <div className={cn('mt-3 flex flex-wrap items-center gap-1.5', !actif && 'pointer-events-none opacity-50')}>
          <span className="text-[0.78rem] text-fg-muted">Raccourcis :</span>
          {RACCOURCIS.map((r) => (
            <button key={r.nom} type="button" onClick={() => { setDe(r.opensAt); setA(r.closesAt); setNom(r.nom === 'Normal' ? '' : r.nom) }}
              className={cn('inline-flex h-8 items-center rounded-full border px-3 text-[0.78rem] font-semibold transition-colors',
                de === r.opensAt && a === r.closesAt ? 'border-accent/50 bg-accent/12 text-accent' : 'border-[rgb(var(--glass-edge)/0.34)] bg-white/65 text-fg-muted hover:bg-white hover:text-fg')}>
              {r.nom} · {r.opensAt} – {r.closesAt}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[rgb(var(--glass-edge)/0.16)] pt-3">
          <p className="text-[0.85rem] text-fg">
            {actif ? <>Les départements commandent <strong>{libellePlage(de, a)}</strong>.</> : 'Les départements commandent à toute heure.'}
            <span className="ml-1 text-fg-muted">La commande urgente de l’administration passe toujours.</span>
          </p>
          <Button variant="primary" loading={busy} disabled={!change} onClick={() => void enregistrerGeneral()}>
            {!busy ? <Check className="size-4" /> : null}
            Enregistrer l’horaire
          </Button>
        </div>
      </GlassCard>

      {/* 2. Les utilisateurs : chacun son horaire, ou le général. */}
      <GlassCard overflowVisible>
        <div className="border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
          <p className="flex items-center gap-1.5 text-[0.74rem] font-bold uppercase tracking-wide text-accent"><Users className="size-4" /> Horaire par utilisateur</p>
          <p className="mt-1 text-[0.84rem] text-fg-muted">Cochez un ou plusieurs utilisateurs, choisissez leurs heures, appliquez. Sans horaire propre, l’utilisateur suit le général.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SearchField value={recherche} onChange={setRecherche} placeholder="Rechercher un utilisateur…" className="min-w-0 flex-1 basis-56 sm:max-w-sm" />
            <div className="flex flex-wrap gap-1.5">
              {[{ id: 'tous', nom: `Tous (${utilisateurs.length})`, couleur: '#103528' }, { id: 'perso', nom: `Horaire propre (${nbPerso})`, couleur: '#b4630f' },
                ...departements.map((d) => ({ id: d.id, nom: `${d.nom} (${utilisateurs.filter((u) => u.departmentId === d.id).length})`, couleur: d.couleur }))].map((f) => (
                <button key={f.id} type="button" aria-pressed={filtre === f.id} onClick={() => setFiltre(f.id)}
                  className={cn('inline-flex h-9 items-center rounded-full border-2 px-3 text-[0.8rem] font-semibold transition-colors', filtre === f.id ? 'text-white' : 'bg-white/70 text-fg hover:bg-white')}
                  style={filtre === f.id ? { background: f.couleur, borderColor: f.couleur } : { borderColor: `${f.couleur}55` }}>
                  {f.nom}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* La barre d'application : visible dès qu'un utilisateur est coché. */}
        {choisis.length > 0 ? (
          <div className="flex flex-wrap items-end gap-3 border-b border-accent/30 bg-accent/[0.07] px-4 py-3 sm:px-5">
            <p className="self-center text-[0.88rem] font-bold text-fg">{choisis.length} utilisateur{choisis.length > 1 ? 's' : ''} choisi{choisis.length > 1 ? 's' : ''}</p>
            <label className="block text-[0.78rem] font-medium text-fg-muted">De
              <span className="mt-1 block"><ChampHeure value={deU} onChange={setDeU} label="Heure d’ouverture pour les utilisateurs choisis" /></span>
            </label>
            <label className="block text-[0.78rem] font-medium text-fg-muted">À
              <span className="mt-1 block"><ChampHeure value={aU} onChange={setAU} label="Heure de fermeture pour les utilisateurs choisis" /></span>
            </label>
            <Button variant="primary" loading={busy} disabled={!deU || !aU} onClick={() => void poser(choisis, deU, aU)}>
              {!busy ? <Check className="size-4" /> : null}
              Appliquer {libellePlage(deU, aU)}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void poser(choisis, null, null)}>
              <RotateCcw className="size-4" />
              Revenir à l’horaire général
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setChoisis([])}>Tout décocher</Button>
          </div>
        ) : null}

        {visibles.length === 0 ? (
          <EmptyState icon={<Users className="size-6" />} title="Aucun utilisateur" description="Aucun utilisateur ne correspond à ce filtre." />
        ) : (
          <TableWrap minWidth="42rem">
            <thead>
              <tr>
                <Th className="w-12">
                  <input type="checkbox" checked={tousCoches} aria-label="Tout cocher"
                    onChange={() => setChoisis(tousCoches ? choisis.filter((id) => !visibles.some((u) => u.userId === id)) : [...new Set([...choisis, ...visibles.map((u) => u.userId)])])}
                    className="size-4 cursor-pointer accent-[var(--accent)]" />
                </Th>
                <Th className="w-full">Utilisateur</Th>
                <Th>Département</Th>
                <Th className="whitespace-nowrap">Peut commander</Th>
                <Th className="whitespace-nowrap">Maintenant</Th>
                <Th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
              {visibles.map((u) => {
                const coche = choisis.includes(u.userId)
                const plage = plageDe(u)
                const ok = !plage || ouvert(data.now, plage.de, plage.a)
                return (
                  <tr key={u.userId} className={cn('transition-colors', coche ? 'bg-accent/[0.07]' : 'hover:bg-white/40')}>
                    <Td>
                      <input type="checkbox" checked={coche} aria-label={`Choisir ${u.fullName}`}
                        onChange={() => setChoisis((v) => (coche ? v.filter((id) => id !== u.userId) : [...v, u.userId]))}
                        className="size-4 cursor-pointer accent-[var(--accent)]" />
                    </Td>
                    <Td>
                      <p className="text-[0.9rem] font-semibold text-fg">{u.fullName}</p>
                      <p className="font-mono text-[0.72rem] text-fg-subtle">{u.username}</p>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {u.departmentName ? (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.76rem] font-semibold text-white" style={{ background: u.departmentColor ?? '#64748b' }}>{u.departmentName}</span>
                      ) : <span className="text-fg-subtle">—</span>}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {plage ? (
                        <span className="flex items-center gap-2">
                          <span className="text-[0.95rem] font-bold tabular-nums text-fg">{plage.de} – {plage.a}</span>
                          <span className={cn('rounded-md px-1.5 py-0.5 text-[0.7rem] font-semibold', plage.perso ? 'bg-warn/15 text-warn' : 'bg-[rgb(var(--glass-edge)/0.2)] text-fg-muted')}>
                            {plage.perso ? 'horaire propre' : 'général'}
                          </span>
                        </span>
                      ) : <span className="text-[0.84rem] text-fg-muted">à toute heure</span>}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <span className={cn('inline-flex items-center gap-1.5 text-[0.8rem] font-semibold', ok ? 'text-ok' : 'text-danger')}>
                        <span className={cn('size-2 rounded-full', ok ? 'bg-ok' : 'bg-danger')} />
                        {ok ? 'ouvert' : 'fermé'}
                      </span>
                    </Td>
                    <Td>
                      {u.opensAt ? (
                        <button type="button" disabled={busy} onClick={() => void poser([u.userId], null, null)} title="Revenir à l’horaire général" aria-label={`Retirer l’horaire propre de ${u.fullName}`}
                          className="grid size-8 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-[rgb(var(--glass-edge)/0.2)] hover:text-fg">
                          <RotateCcw className="size-4" />
                        </button>
                      ) : null}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </TableWrap>
        )}
      </GlassCard>
    </div>
  )
}
