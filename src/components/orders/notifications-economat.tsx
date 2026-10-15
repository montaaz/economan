'use client'

import * as React from 'react'
import { BellRing, BellOff, X } from 'lucide-react'

/** Convertit la clé publique VAPID (base64url) pour PushManager. */
function cle(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const brut = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(brut, (c) => c.charCodeAt(0))
}

/** Abonne cet appareil (s'il ne l'est pas déjà) et l'enregistre côté serveur. */
async function abonner() {
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const { key } = (await (await fetch('/api/push')).json()) as { key: string | null }
  if (!key) throw new Error('Notifications non configurées sur le serveur.')
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cle(key) })
  const r = await fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub.toJSON()) })
  if (!r.ok) throw new Error('Enregistrement impossible.')
}

/**
 * Les notifications de l'économat : une fois activées sur un téléphone ou un
 * PC, chaque nouvelle commande y sonne — même écran éteint, application
 * fermée — et revient en rappel tant qu'elle n'est pas acceptée.
 */
export function NotificationsEconomat() {
  const [etat, setEtat] = React.useState<'inconnu' | 'actives' | 'a-activer' | 'refusees' | 'impossible'>('inconnu')
  const [cache, setCache] = React.useState(false)
  const [erreur, setErreur] = React.useState<string | null>(null)

  React.useEffect(() => {
    let vivant = true
    const verifier = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { if (vivant) setEtat('impossible'); return }
      if (Notification.permission === 'denied') { if (vivant) setEtat('refusees'); return }
      if (Notification.permission === 'granted') {
        // Déjà autorisé : on (re)vérifie l'abonnement sans rien demander.
        try { await abonner(); if (vivant) setEtat('actives') } catch { if (vivant) setEtat('a-activer') }
        return
      }
      if (vivant) setEtat('a-activer')
    }
    void verifier()
    return () => { vivant = false }
  }, [])

  const activer = async () => {
    setErreur(null)
    try {
      const p = await Notification.requestPermission()
      if (p !== 'granted') { setEtat(p === 'denied' ? 'refusees' : 'a-activer'); return }
      await abonner()
      setEtat('actives')
    } catch (e) { setErreur(e instanceof Error ? e.message : 'Activation impossible.') }
  }

  if (cache || etat === 'inconnu' || etat === 'actives') return null
  return (
    <div className="no-print fixed bottom-20 left-4 z-[59] max-w-[21rem] rounded-2xl border border-[rgb(var(--glass-edge)/0.3)] bg-white p-3.5 shadow-[0_18px_44px_-14px_rgb(15_30_51/0.45)] lg:bottom-5 lg:left-[17.5rem]">
      <button type="button" onClick={() => setCache(true)} aria-label="Masquer" className="absolute right-2 top-2 grid size-7 place-items-center rounded-lg text-fg-subtle hover:bg-[rgb(var(--glass-edge)/0.14)]">
        <X className="size-4" />
      </button>
      {etat === 'a-activer' ? (
        <>
          <p className="flex items-center gap-2 pr-6 text-[0.92rem] font-bold text-fg"><BellRing className="size-5 text-accent" /> Alertes des commandes</p>
          <p className="mt-1 text-[0.8rem] leading-snug text-fg-muted">Recevez chaque nouvelle commande sur cet appareil, <strong className="text-fg">même écran éteint</strong>, avec rappel tant qu’elle n’est pas acceptée.</p>
          <button type="button" onClick={() => void activer()} className="mt-2.5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[0.88rem] font-bold text-white hover:brightness-110">
            <BellRing className="size-4" /> Activer les notifications
          </button>
          {erreur ? <p className="mt-1.5 text-[0.75rem] text-danger">{erreur}</p> : null}
        </>
      ) : etat === 'refusees' ? (
        <>
          <p className="flex items-center gap-2 pr-6 text-[0.92rem] font-bold text-fg"><BellOff className="size-5 text-danger" /> Notifications bloquées</p>
          <p className="mt-1 text-[0.8rem] leading-snug text-fg-muted">Cliquez le cadenas à gauche de l’adresse → <strong className="text-fg">Notifications : Autoriser</strong>, puis rechargez la page.</p>
        </>
      ) : (
        <>
          <p className="flex items-center gap-2 pr-6 text-[0.92rem] font-bold text-fg"><BellOff className="size-5 text-warn" /> Notifications indisponibles ici</p>
          <p className="mt-1 text-[0.8rem] leading-snug text-fg-muted">Sur iPhone, ajoutez d’abord l’application à l’écran d’accueil (Partager → <strong className="text-fg">Sur l’écran d’accueil</strong>), puis ouvrez-la depuis l’icône.</p>
        </>
      )}
    </div>
  )
}
