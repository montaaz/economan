'use client'

import * as React from 'react'
import { RotateCcw } from 'lucide-react'

/**
 * Ce qui s'affiche quand une page casse en cours de route.
 *
 * Le cas de loin le plus fréquent n'est pas une erreur du programme : après
 * un redéploiement (ou un redémarrage du serveur de développement), l'onglet
 * resté ouvert réclame un morceau de code qui n'existe plus sous ce nom —
 * « ChunkLoadError ». La bonne réponse est de recharger la page, et on le
 * fait à sa place, une seule fois, pour ne pas boucler si le rechargement
 * échoue aussi. Toute autre erreur est montrée telle quelle, avec le moyen de
 * réessayer.
 */
export default function ErreurPage({
  error, reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const perime = error.name === 'ChunkLoadError' || /Failed to load chunk|Loading chunk/i.test(error.message)

  React.useEffect(() => {
    if (!perime) return
    try {
      const cle = 'economan:rechargement'
      const dernier = Number(window.sessionStorage.getItem(cle) ?? 0)
      // Un seul rechargement automatique par minute : au-delà, c'est autre
      // chose qu'un code périmé, et on laisse l'écran d'erreur.
      if (Date.now() - dernier < 60_000) return
      window.sessionStorage.setItem(cle, String(Date.now()))
    } catch {
      // Sans stockage, on recharge quand même : c'est le geste attendu.
    }
    window.location.reload()
  }, [perime])

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-[1.1rem] font-bold text-fg">
        {perime ? 'Une nouvelle version est disponible' : 'Quelque chose s’est mal passé'}
      </p>
      <p className="mt-2 text-[0.88rem] text-fg-muted">
        {perime
          ? 'La page se recharge pour la prendre en compte…'
          : (error.message || 'Réessayez ; si le problème persiste, prévenez l’administration.')}
      </p>
      <button
        type="button"
        onClick={() => (perime ? window.location.reload() : reset())}
        className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--glass-edge)/0.34)] bg-white/70 px-4 py-2 text-[0.85rem] font-semibold text-fg transition-colors hover:bg-white"
      >
        <RotateCcw className="size-4" />
        {perime ? 'Recharger maintenant' : 'Réessayer'}
      </button>
    </div>
  )
}
