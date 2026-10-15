'use client'

import * as React from 'react'
import { Volume2, BellRing } from 'lucide-react'

type Attente = { id: number; reference: string; urgent: boolean; departement: string; son: string }

/** Ce que dit la voix de secours, si le fichier n'existe pas encore. */
const PHRASES: Record<string, string> = { 'fast-food': 'Fast food', menage: 'Ménage', embalage: 'Emballage' }
const texte = (a: Attente) => {
  const nom = PHRASES[a.son] ?? a.departement
  return a.urgent ? `Attention ! Commande urgente ! ${nom} ! Commande urgente, ${nom} !` : `Nouvelle commande ! ${nom} ! Nouvelle commande, ${nom} !`
}

/**
 * L'annonce sonore de l'économat, sur toutes ses pages.
 *
 * Tant qu'une commande attend d'être acceptée, la voix de son département
 * revient en boucle — l'urgente d'abord. Elle se tait dès que la commande
 * est acceptée. Les voix sont des fichiers (public/sons) ; s'il en manque
 * un, la voix française du navigateur prend le relais.
 *
 * Un navigateur ne joue pas de son avant un premier geste : si la lecture
 * est refusée, un bouton propose d'activer l'annonce.
 */
export function AnnonceCommandes() {
  const [attente, setAttente] = React.useState<Attente[]>([])
  const [bloque, setBloque] = React.useState(false)
  const audio = React.useRef<HTMLAudioElement | null>(null)
  const enCours = React.useRef(false)
  const attenteRef = React.useRef<Attente[]>([])
  const relance = React.useRef<() => void>(() => {})
  React.useEffect(() => { attenteRef.current = attente }, [attente])

  // Les commandes en attente : toutes les 8 s, et aussitôt après un geste de l'économat.
  React.useEffect(() => {
    let vivant = true
    const lire = async () => {
      try {
        const r = await fetch('/api/economat/en-attente', { cache: 'no-store' })
        if (!r.ok) return
        const d = (await r.json()) as { commandes: Attente[] }
        if (!vivant) return
        setAttente(d.commandes)
        attenteRef.current = d.commandes
        // Quelque chose attend : on annonce ; plus rien : on se tait.
        if (d.commandes.length > 0) relance.current()
        else {
          audio.current?.pause()
          if ('speechSynthesis' in window) window.speechSynthesis.cancel()
          enCours.current = false
        }
      } catch { /* réseau absent : on réessaie au prochain tour */ }
    }
    void lire()
    const t = window.setInterval(lire, 8000)
    const apres = () => window.setTimeout(lire, 800)
    window.addEventListener('economan:activite', apres)
    return () => { vivant = false; window.clearInterval(t); window.removeEventListener('economan:activite', apres) }
  }, [])

  // Une annonce, puis la suivante après un court silence, tant que quelque chose attend.
  const annoncer = React.useCallback(async () => {
    if (enCours.current) return
    const a = attenteRef.current[0]
    if (!a) return
    enCours.current = true
    const fin = () => { enCours.current = false; window.setTimeout(() => relance.current(), 2500) }
    const secours = () => {
      if (!('speechSynthesis' in window)) { fin(); return }
      const u = new SpeechSynthesisUtterance(texte(a))
      u.lang = 'fr-FR'; u.rate = 1; u.pitch = 1.15; u.volume = 1
      const voix = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('fr') && /female|femme|amelie|audrey|marie|google/i.test(v.name))
        ?? window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('fr'))
      if (voix) u.voice = voix
      u.onend = fin; u.onerror = fin
      window.speechSynthesis.speak(u)
    }
    audio.current?.pause()
    const el = new Audio(`/sons/${a.urgent ? 'urgent' : 'commande'}-${a.son}.mp3`)
    el.addEventListener('ended', fin)
    el.addEventListener('error', secours)
    audio.current = el
    try {
      await el.play()
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') { enCours.current = false; setBloque(true); return }
      secours()
    }
  }, [])

  React.useEffect(() => { relance.current = () => { void annoncer() } }, [annoncer])

  // Le son se débloque au premier geste, n'importe où dans l'application
  // (un clic, une touche, un toucher) : plus besoin de viser le bandeau. Le
  // déblocage vaut ensuite pour toute la session de l'onglet.
  React.useEffect(() => {
    const debloquer = () => {
      const ctx = (window as unknown as { __economanAudio?: AudioContext }).__economanAudio
        ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      ;(window as unknown as { __economanAudio?: AudioContext }).__economanAudio = ctx
      void ctx.resume()
      setBloque(false)
      if (attenteRef.current.length > 0) relance.current()
    }
    const evenements = ['pointerdown', 'keydown', 'touchstart'] as const
    for (const e of evenements) window.addEventListener(e, debloquer, { capture: true, once: true })
    return () => { for (const e of evenements) window.removeEventListener(e, debloquer, { capture: true }) }
  }, [])


  if (attente.length === 0) return null
  const urgentes = attente.filter((a) => a.urgent).length
  return (
    <div className="no-print fixed bottom-20 right-4 z-[60] lg:bottom-5">
      <button
        type="button"
        onClick={() => { setBloque(false); void annoncer() }}
        className={`flex items-center gap-2.5 rounded-2xl px-4 py-3 text-left text-white shadow-[0_14px_34px_-12px_rgb(15_23_42/0.6)] ${urgentes ? 'animate-pulse bg-[#b91c1c]' : 'bg-accent'}`}
      >
        {bloque ? <Volume2 className="size-5 shrink-0" /> : <BellRing className="size-5 shrink-0" />}
        <span>
          <span className="block text-[0.92rem] font-bold leading-tight">
            {attente.length} commande{attente.length > 1 ? 's' : ''} en attente{urgentes ? ` · ${urgentes} urgente${urgentes > 1 ? 's' : ''}` : ''}
          </span>
          <span className="block text-[0.74rem] opacity-85">
            {bloque ? 'Le navigateur attend un premier clic pour le son' : `${attente[0].departement} — l’annonce s’arrête à l’acceptation`}
          </span>
        </span>
      </button>
      {bloque ? (
        <p className="mt-2 max-w-[19rem] rounded-xl bg-white/95 px-3 py-2 text-[0.72rem] leading-snug text-fg-muted shadow-md">
          Pour un son <strong className="text-fg">toujours automatique</strong> : cliquez le cadenas à gauche de l’adresse →
          Paramètres du site → <strong className="text-fg">Son / Lecture automatique : Autoriser</strong>.
        </p>
      ) : null}
    </div>
  )
}
