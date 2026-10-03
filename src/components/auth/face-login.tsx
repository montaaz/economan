'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, RotateCcw } from 'lucide-react'
import { analyser, chargerVisage, fermerCamera, ouvrirCamera } from '@/lib/face'
import { cn } from '@/lib/utils'
import { ViseurVisage, type EtatScan } from './face-id'

/** Trois images successives par vérification ; trois vérifications avant le mot de passe. */
const IMAGES = 3
const ESSAIS = 3

/**
 * La connexion par le visage, à la façon de Face ID : le cercle balaie
 * pendant la reconnaissance, devient vert avec une coche quand l'agent est
 * reconnu, tremble en rouge sinon. « Utiliser mon mot de passe » est
 * toujours là.
 */
export function FaceLogin({ userId, username, role, onPassword }: {
  /** Un agent, choisi sur la page de son département… */
  userId?: number
  /** …ou le personnel, par son identifiant et l'espace où il entre. */
  username?: string
  role?: 'ADMIN' | 'ECONOMAN' | 'CONTROLEUR'
  onPassword: () => void
}) {
  const router = useRouter()
  const video = React.useRef<HTMLVideoElement>(null)
  const [etat, setEtat] = React.useState<EtatScan>('attente')
  const [message, setMessage] = React.useState('Ouverture de la caméra…')
  const [fini, setFini] = React.useState(false)
  const [essai, setEssai] = React.useState(0)

  React.useEffect(() => {
    let vivant = true
    let flux: MediaStream | null = null
    ;(async () => {
      try {
        setFini(false); setEtat('attente'); setMessage('Ouverture de la caméra…')
        // Les modèles et la caméra en même temps : c'est le plus long.
        const [, f] = await Promise.all([chargerVisage(), ouvrirCamera(video.current!)])
        flux = f
        if (!vivant) return
        setEtat('scan'); setMessage('Regardez la caméra')
        let refus = 0
        const debut = Date.now()
        let images: number[][] = []
        while (vivant) {
          const a = await analyser(video.current!, true)
          if (!vivant) return
          const mal = !a ? 'Placez votre visage dans le cercle'
            : a.taille < 0.2 ? 'Approchez-vous'
              : Math.abs(a.centreX - 0.5) > 0.25 || Math.abs(a.centreY - 0.5) > 0.27 ? 'Centrez votre visage' : null
          if (mal || !a?.signature) {
            images = []
            setMessage(mal ?? 'Regardez la caméra')
            if (Date.now() - debut > 25000) { setEtat('ko'); setFini(true); setMessage('Aucun visage reconnu : approchez-vous, face à la lumière.'); return }
            continue
          }
          setMessage('Reconnaissance…')
          images.push(a.signature)
          if (images.length < IMAGES) continue

          const r = await fetch('/api/face/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId, username, role, descriptors: images }) })
          const res = await r.json().catch(() => ({}))
          images = []
          if (!vivant) return
          if (r.ok) {
            setEtat('ok'); setMessage('Reconnu')
            fermerCamera(flux); flux = null
            await new Promise((ok) => setTimeout(ok, 650))
            router.push(res.redirect ?? '/employe'); router.refresh()
            return
          }
          if (res.raison !== 'non-reconnu') { setEtat('ko'); setFini(true); setMessage(res.error ?? 'Connexion par le visage impossible.'); return }
          refus += 1
          setEtat('ko'); setMessage('Visage non reconnu')
          if (refus >= ESSAIS) { setFini(true); setMessage('Visage non reconnu. Réessayez, ou utilisez votre mot de passe.'); return }
          await new Promise((ok) => setTimeout(ok, 700))
          if (!vivant) return
          setEtat('scan'); setMessage('Regardez la caméra')
        }
      } catch (e) {
        if (!vivant) return
        setEtat('ko'); setFini(true)
        setMessage(e instanceof Error && /Permission|NotAllowed/i.test(e.name + e.message) ? 'Accès à la caméra refusé : autorisez-le, ou utilisez votre mot de passe.' : e instanceof Error ? e.message : 'Caméra indisponible.')
      } finally {
        // La boucle finie — reconnu, échec ou départ — la caméra s'éteint.
        fermerCamera(flux); flux = null
      }
    })()
    return () => { vivant = false; fermerCamera(flux) }
  }, [userId, username, role, essai, router])

  return (
    <div className="space-y-4 rounded-3xl bg-[#05080f] px-3 py-6 text-white">
      <ViseurVisage video={video} etat={etat} taille={230} />
      <p role="status" aria-live="polite" className={cn('min-h-[1.5rem] text-center text-[1.05rem] font-semibold',
        etat === 'ok' ? 'text-emerald-300' : etat === 'ko' ? 'text-red-300' : 'text-white')}>
        {message}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {fini ? (
          <button type="button" onClick={() => setEssai((n) => n + 1)}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white/12 px-4 text-[0.88rem] font-semibold text-white transition-colors hover:bg-white/20">
            <RotateCcw className="size-4" /> Réessayer
          </button>
        ) : null}
        <button type="button" onClick={onPassword} disabled={etat === 'ok'}
          className={cn('inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-[0.88rem] font-semibold transition-colors disabled:opacity-40',
            fini ? 'bg-[#2563eb] text-white hover:brightness-110' : 'text-white/70 hover:bg-white/10 hover:text-white')}>
          <KeyRound className="size-4" /> Utiliser mon mot de passe
        </button>
      </div>
    </div>
  )
}
