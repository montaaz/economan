'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

/** Toutes les combien de secondes on demande « quelque chose a changé ? ». */
const INTERVALLE = 6000

/**
 * Le rafraîchissement automatique, sur toutes les pages.
 *
 * Toutes les quelques secondes, une empreinte des données est relue — une
 * seule requête légère. Si elle a changé (nouvelle commande, acceptation,
 * servi, stock…), la page recharge ses données en place, sans rechargement
 * complet : on voit la nouvelle commande arriver sans rien toucher.
 *
 * Il ne dérange jamais une saisie : tant qu'un champ a le focus, qu'une
 * fenêtre est ouverte ou qu'un envoi est en cours, il attend. Onglet caché,
 * il se met en pause ; au retour, il vérifie aussitôt.
 */
export function LiveRefresh() {
  const router = useRouter()
  const derniere = React.useRef<string | null>(null)
  const enAttente = React.useRef(false)
  const envois = React.useRef(0)

  React.useEffect(() => {
    // Les envois en cours (mutations) : on ne rafraîchit pas au milieu.
    const surActivite = (e: Event) => { envois.current = Math.max(0, envois.current + ((e as CustomEvent<number>).detail ?? 0)) }
    window.addEventListener('economan:activite', surActivite)

    const occupe = () => {
      const a = document.activeElement as HTMLElement | null
      const saisie = !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)
      const fenetre = !!document.querySelector('[role="dialog"], [role="alertdialog"], [role="listbox"]')
      return saisie || fenetre || envois.current > 0
    }
    const rafraichir = () => {
      if (occupe()) { enAttente.current = true; return }
      enAttente.current = false
      router.refresh()
    }
    const verifier = async () => {
      if (document.hidden) return
      try {
        const r = await fetch('/api/version', { cache: 'no-store' })
        if (!r.ok) return
        const { v } = (await r.json()) as { v: string | null }
        if (v === null) return
        if (derniere.current !== null && v !== derniere.current) rafraichir()
        derniere.current = v
      } catch { /* réseau absent : on réessaie au prochain tour */ }
      // Un rafraîchissement retenu part dès que l'utilisateur a fini.
      if (enAttente.current && !occupe()) rafraichir()
    }

    void verifier()
    const t = window.setInterval(() => { void verifier() }, INTERVALLE)
    const retour = () => { if (!document.hidden) void verifier() }
    document.addEventListener('visibilitychange', retour)
    window.addEventListener('focus', retour)
    window.addEventListener('online', retour)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('economan:activite', surActivite)
      document.removeEventListener('visibilitychange', retour)
      window.removeEventListener('focus', retour)
      window.removeEventListener('online', retour)
    }
  }, [router])

  return null
}
