'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Check, ScanFace, Trash2, X } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import { analyser, chargerVisage, fermerCamera, ouvrirCamera, type Analyse } from '@/lib/face'
import { formatDateTime } from '@/lib/utils'
import { TRAITS, ViseurVisage, type EtatScan } from './face-id'

/** Huit directions à couvrir ; une prise par direction, plus trois de face. */
const SECTEURS = 8
const DE_FACE = 3
/** Écart de rotation à partir duquel la tête est « tournée ». */
const TOURNE = 0.16

type Phase = 'accueil' | 'scan' | 'envoi' | 'fini'

/**
 * L'enregistrement du visage d'un agent, par l'administration, à la façon
 * de Face ID : l'agent se place dans le cercle, regarde droit devant, puis
 * tourne lentement la tête ; chaque direction allume sa part du cercle et
 * donne une prise. Le cercle complet, les prises partent au serveur.
 */
export function FaceEnrollModal({ user, enregistreLe, onClose }: {
  user: { id: number; fullName: string }
  enregistreLe: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const { push } = useToast()
  const confirmer = useConfirm()
  const video = React.useRef<HTMLVideoElement>(null)
  const flux = React.useRef<MediaStream | null>(null)
  const actif = React.useRef(false)
  // Une confirmation ouverte par-dessus : Échap est pour elle, pas pour cet écran.
  const confirmation = React.useRef(false)
  const [phase, setPhase] = React.useState<Phase>('accueil')
  const [allumes, setAllumes] = React.useState<boolean[]>(() => Array(TRAITS).fill(false))
  const [consigne, setConsigne] = React.useState('')
  const [etat, setEtat] = React.useState<EtatScan>('attente')

  const arreter = React.useCallback(() => { actif.current = false; fermerCamera(flux.current); flux.current = null }, [])
  React.useEffect(() => arreter, [arreter])
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !confirmation.current) { e.stopPropagation(); arreter(); onClose() } }
    document.addEventListener('keydown', k, true)
    return () => document.removeEventListener('keydown', k, true)
  }, [arreter, onClose])

  /** Dit à l'agent comment se placer ; null s'il est bien placé. */
  const placement = (a: Analyse | null) => {
    if (!a) return 'Placez votre visage dans le cercle'
    if (a.taille < 0.22) return 'Approchez-vous'
    if (a.taille > 0.75) return 'Reculez un peu'
    if (Math.abs(a.centreX - 0.5) > 0.2 || Math.abs(a.centreY - 0.5) > 0.22) return 'Centrez votre visage dans le cercle'
    return null
  }

  const commencer = async () => {
    setPhase('scan'); setEtat('attente'); setAllumes(Array(TRAITS).fill(false)); setConsigne('Ouverture de la caméra…')
    actif.current = true
    try {
      await new Promise((r) => requestAnimationFrame(r))
      const [, f] = await Promise.all([chargerVisage(), ouvrirCamera(video.current!)])
      flux.current = f
      const prises: number[][] = []
      const secteursPris = new Set<number>()
      const traits = Array(TRAITS).fill(false) as boolean[]
      let base: { lacet: number; tangage: number } | null = null
      const calibrage: Analyse[] = []
      const debut = Date.now()

      while (actif.current) {
        const dureeS = (Date.now() - debut) / 1000
        if (dureeS > 60) throw new Error('Enregistrement trop long : bonne lumière, une seule personne, et recommencez.')
        // La signature ne se calcule que lorsqu'on va s'en servir.
        const veutPrise = !base ? calibrage.length >= 3 && prises.length < DE_FACE : true
        const a = await analyser(video.current!, veutPrise)
        if (!actif.current) return
        const mal = placement(a)

        // 1. De face : on apprend la position neutre et on prend trois prises.
        if (!base) {
          if (mal) { setConsigne(mal); calibrage.length = 0; continue }
          setConsigne('Regardez droit devant')
          calibrage.push(a!)
          if (a!.signature && prises.length < DE_FACE) prises.push(a!.signature)
          if (calibrage.length >= 6 && prises.length >= DE_FACE) {
            const med = (xs: number[]) => xs.sort((x, y) => x - y)[Math.floor(xs.length / 2)]
            base = { lacet: med(calibrage.map((x) => x.lacet)), tangage: med(calibrage.map((x) => x.tangage)) }
            setEtat('scan')
          }
          continue
        }

        // 2. Le tour de tête : chaque direction allume sa part du cercle.
        if (!a) { setConsigne('Placez votre visage dans le cercle'); continue }
        if (a.taille < 0.18) { setConsigne('Approchez-vous'); continue }
        const dx = a.lacet - base.lacet
        const dy = (a.tangage - base.tangage) * 3
        const force = Math.hypot(dx, dy)
        if (force < TOURNE) { setConsigne('Bougez lentement la tête pour compléter le cercle'); continue }
        const angle = (Math.atan2(dy, dx) + Math.PI * 2.5) % (Math.PI * 2)
        const i = Math.round((angle / (Math.PI * 2)) * TRAITS) % TRAITS
        for (let k = -3; k <= 3; k++) traits[(i + k + TRAITS) % TRAITS] = true
        setAllumes([...traits])
        const secteur = Math.floor((angle / (Math.PI * 2)) * SECTEURS) % SECTEURS
        if (a.signature && !secteursPris.has(secteur)) { secteursPris.add(secteur); prises.push(a.signature) }
        const fait = traits.filter(Boolean).length / TRAITS
        setConsigne(fait > 0.6 ? 'Continuez à tourner la tête…' : 'Bougez lentement la tête pour compléter le cercle')
        // Le cercle presque complet et assez d'angles : c'est fini. Passé
        // 25 secondes, la moitié du cercle suffit ; passé 45, quelques angles
        // en plus de la face — personne ne reste bloqué devant la caméra.
        if ((fait >= 0.9 && secteursPris.size >= 6)
          || (dureeS > 25 && fait >= 0.5 && secteursPris.size >= 4)
          || (dureeS > 45 && prises.length >= DE_FACE + 2)) {
          traits.fill(true); setAllumes([...traits])
          break
        }
      }
      if (!actif.current) return

      arreter()
      setPhase('envoi'); setConsigne('Enregistrement…')
      const r = await fetch('/api/face/enroll', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: user.id, descriptors: prises }) })
      const res = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(res.error ?? 'Enregistrement impossible.')
      setEtat('ok'); setPhase('fini'); setConsigne('Visage enregistré')
      router.refresh()
    } catch (e) {
      arreter()
      setEtat('ko'); setPhase('accueil')
      push('error', e instanceof Error ? (/Permission|NotAllowed/i.test(e.name + e.message) ? 'Accès à la caméra refusé : autorisez-le dans le navigateur.' : e.message) : 'Caméra indisponible.')
    }
  }

  const retirer = async () => {
    confirmation.current = true
    const ok = await confirmer({ title: `Retirer le visage de ${user.fullName} ?`, message: 'Il se connectera de nouveau avec son mot de passe.', confirmLabel: 'Retirer', tone: 'danger' })
    confirmation.current = false
    if (!ok) return
    const r = await fetch(`/api/face/enroll?userId=${user.id}`, { method: 'DELETE' })
    if (r.ok) { push('success', 'Visage retiré.'); router.refresh(); onClose() } else push('error', 'Suppression impossible.')
  }

  const fermer = () => { arreter(); onClose() }
  const progression = allumes.filter(Boolean).length / TRAITS

  return createPortal(
    <div className="fixed inset-0 z-[45] flex flex-col items-center justify-center bg-[#05080f]/95 px-4 text-white backdrop-blur-md" role="dialog" aria-modal="true" aria-label={`Visage de ${user.fullName}`}>
      <button type="button" onClick={fermer} aria-label="Fermer"
        className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white">
        <X className="size-5" />
      </button>

      <p className="mb-1 text-[0.8rem] font-semibold uppercase tracking-[0.18em] text-white/50">Reconnaissance du visage</p>
      <h2 className="mb-6 text-center text-[1.5rem] font-bold tracking-tight">{user.fullName}</h2>

      {phase === 'accueil' ? (
        <div className="flex max-w-sm flex-col items-center text-center">
          <span className="mb-6 grid size-32 place-items-center rounded-[2rem] bg-gradient-to-br from-[#1e3a8a] to-[#0f766e] shadow-[0_20px_60px_-15px_rgba(59,130,246,.6)]">
            <ScanFace className="size-16" strokeWidth={1.4} />
          </span>
          <p className="text-[1.05rem] font-semibold">Configurer la connexion par le visage</p>
          <p className="mt-2 text-[0.9rem] leading-relaxed text-white/65">
            L’agent se place face à la caméra, bien éclairé, puis tourne lentement la tête pour compléter le cercle. Seule une signature du visage est gardée, pas de photo.
          </p>
          {enregistreLe ? (
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-[0.8rem] font-semibold text-emerald-300">
              <Check className="size-3.5" /> Visage enregistré le {formatDateTime(enregistreLe)}
            </p>
          ) : null}
          <button type="button" onClick={() => void commencer()}
            className="mt-8 h-12 w-full rounded-2xl bg-[#2563eb] text-[1rem] font-semibold shadow-[0_10px_30px_-10px_rgba(37,99,235,.9)] transition-[filter,transform] hover:brightness-110 active:scale-[0.98]">
            {enregistreLe ? 'Refaire le visage' : 'Commencer'}
          </button>
          {enregistreLe ? (
            <button type="button" onClick={() => void retirer()} className="mt-3 inline-flex items-center gap-1.5 text-[0.88rem] font-semibold text-red-400 hover:text-red-300">
              <Trash2 className="size-4" /> Retirer le visage
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <ViseurVisage video={video} allumes={allumes} etat={etat} progression={progression} />
          <p role="status" aria-live="polite" className="mt-6 min-h-[1.75rem] text-center text-[1.15rem] font-semibold">{consigne}</p>
          {phase === 'scan' && etat === 'scan' ? (
            <p className="mt-1 text-[0.85rem] tabular-nums text-white/50">{Math.round(progression * 100)} %</p>
          ) : null}
          {phase === 'fini' ? (
            <button type="button" onClick={fermer}
              className="mt-8 h-12 w-64 rounded-2xl bg-[#2563eb] text-[1rem] font-semibold transition-[filter] hover:brightness-110">
              Terminé
            </button>
          ) : (
            <button type="button" onClick={() => { arreter(); setPhase('accueil'); setEtat('attente') }}
              className="mt-8 text-[0.9rem] font-semibold text-white/60 hover:text-white">
              Annuler
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  )
}
