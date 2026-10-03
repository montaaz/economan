'use client'

import * as React from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * La réponse immédiate au clic.
 *
 * Chaque page se fabrique sur le serveur : entre le clic et la page, une
 * demi-seconde à une seconde et demie où rien ne bougeait — sur une
 * tablette, on croyait le bouton mort et on cliquait encore. Une barre fine
 * part en haut de l'écran dès le clic sur un lien, et se termine quand la
 * nouvelle page est là.
 *
 * Elle récupère aussi l'onglet resté ouvert pendant une mise à jour : un
 * bouton qui appelle une action du serveur disparue (« Failed to find
 * Server Action ») ou un morceau de code renommé ne faisait rien. On
 * recharge la page à sa place, une fois par minute au plus.
 */
export function NavigationProgress() {
  const pathname = usePathname()
  const params = useSearchParams()
  const [etat, setEtat] = React.useState<'repos' | 'charge' | 'fin'>('repos')
  const debut = React.useRef(0)
  // Les actions en cours (enregistrer, valider…) : la barre s'allume si
  // l'une dure plus de 300 ms, et s'éteint quand toutes sont finies.
  const [actions, setActions] = React.useState(0)
  const [visibleAction, setVisibleAction] = React.useState(false)
  React.useEffect(() => {
    const surActivite = (e: Event) => setActions((n) => Math.max(0, n + ((e as CustomEvent<number>).detail ?? 0)))
    window.addEventListener('economan:activite', surActivite)
    return () => window.removeEventListener('economan:activite', surActivite)
  }, [])
  React.useEffect(() => {
    if (actions === 0) { const t = window.setTimeout(() => setVisibleAction(false), 0); return () => window.clearTimeout(t) }
    const t = window.setTimeout(() => setVisibleAction(true), 300)
    return () => window.clearTimeout(t)
  }, [actions])

  // La page a changé : la barre se termine.
  const cle = `${pathname}?${params?.toString() ?? ''}`
  const precedente = React.useRef(cle)
  React.useEffect(() => {
    if (precedente.current === cle) return
    precedente.current = cle
    setEtat((e) => (e === 'charge' ? 'fin' : e))
  }, [cle])
  React.useEffect(() => {
    if (etat !== 'fin') return
    const t = window.setTimeout(() => setEtat('repos'), 260)
    return () => window.clearTimeout(t)
  }, [etat])
  // Garde-fou : jamais plus de 15 s à l'écran.
  React.useEffect(() => {
    if (etat !== 'charge') return
    const t = window.setTimeout(() => setEtat('fin'), 15000)
    return () => window.clearTimeout(t)
  }, [etat])

  React.useEffect(() => {
    const auClic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest('a')
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const href = a.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      let url: URL
      try { url = new URL(href, window.location.href) } catch { return }
      if (url.origin !== window.location.origin || url.pathname.startsWith('/api/')) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      debut.current = Date.now()
      setEtat('charge')
    }
    // Un écran qui navigue par le code (router.push) peut l'annoncer.
    const auSignal = () => { debut.current = Date.now(); setEtat('charge') }
    document.addEventListener('click', auClic, true)
    window.addEventListener('economan:navigation', auSignal)
    return () => { document.removeEventListener('click', auClic, true); window.removeEventListener('economan:navigation', auSignal) }
  }, [])

  // Code périmé après une mise à jour : on recharge, une fois par minute au plus.
  React.useEffect(() => {
    const perime = (m: string) => /Failed to find Server Action|ChunkLoadError|Loading chunk [\w-]+ failed|Failed to load chunk|dynamically imported module/i.test(m)
    const recharger = () => {
      try {
        const k = 'economan:rechargement'
        if (Date.now() - Number(sessionStorage.getItem(k) ?? 0) < 60_000) return
        sessionStorage.setItem(k, String(Date.now()))
      } catch { /* sans stockage, on recharge quand même */ }
      window.location.reload()
    }
    const surErreur = (e: ErrorEvent) => { if (perime(`${e.message} ${e.error?.name ?? ''}`)) recharger() }
    const surRejet = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string; name?: string } | undefined
      if (perime(`${r?.message ?? String(e.reason)} ${r?.name ?? ''}`)) recharger()
    }
    window.addEventListener('error', surErreur)
    window.addEventListener('unhandledrejection', surRejet)
    return () => { window.removeEventListener('error', surErreur); window.removeEventListener('unhandledrejection', surRejet) }
  }, [])

  if (etat === 'repos' && !visibleAction) return null
  if (etat === 'repos') {
    // Une action en cours : une bande qui court, sans fin annoncée.
    return (
      <div aria-hidden className="no-print pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden">
        <div className="h-full w-1/3 bg-accent shadow-[0_0_10px_var(--accent)] animate-[nav-action_1.1s_ease-in-out_infinite]" />
        <style>{'@keyframes nav-action { from { transform: translateX(-100%) } to { transform: translateX(300%) } }'}</style>
      </div>
    )
  }
  return (
    <div aria-hidden className="no-print pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]">
      <div className={etat === 'charge'
        ? 'h-full w-[85%] origin-left bg-accent shadow-[0_0_10px_var(--accent)] animate-[nav-progres_8s_cubic-bezier(.1,.7,.2,1)_forwards]'
        : 'h-full w-full bg-accent opacity-0 transition-opacity duration-200'} />
      <style>{'@keyframes nav-progres { from { transform: scaleX(0.05) } to { transform: scaleX(1) } }'}</style>
    </div>
  )
}
