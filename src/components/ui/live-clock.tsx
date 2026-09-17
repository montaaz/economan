'use client'

import * as React from 'react'
import { formatTime } from '@/lib/utils'

/**
 * Heure courante de l'établissement, en HH:mm.
 *
 * Rendue côté client et rafraîchie chaque minute : une heure calculée sur le
 * serveur se figerait à l'instant du rendu et afficherait bientôt une heure
 * fausse, d'autant que la page est servie en `force-dynamic` mais reste
 * ouverte longtemps pendant la saisie d'une commande.
 *
 * Rien n'est rendu au premier passage : le serveur et le client produiraient
 * deux heures différentes, ce que React signalerait comme une divergence
 * d'hydratation.
 */
export function LiveClock({ className }: { className?: string }) {
  const [now, setNow] = React.useState<Date | null>(null)

  React.useEffect(() => {
    setNow(new Date())

    // On se cale sur la seconde 0 de la minute suivante, puis on avance de
    // minute en minute : un intervalle fixe dériverait de l'affichage réel.
    let interval: ReturnType<typeof setInterval>
    const timeout = setTimeout(() => {
      setNow(new Date())
      interval = setInterval(() => setNow(new Date()), 60_000)
    }, (60 - new Date().getSeconds()) * 1000)

    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [])

  if (!now) return null

  return (
    <time className={className} dateTime={now.toISOString()}>
      {formatTime(now)}
    </time>
  )
}
