'use client'

import * as React from 'react'

type Brouillon = { onHand: Record<string, string>; note: string; at: number }

/**
 * Conserve la saisie en cours dans le navigateur.
 *
 * Compter 109 articles prend du temps : une session expirée, un téléphone
 * verrouillé ou un onglet fermé ne doivent pas tout effacer.
 *
 * La clé porte l'employé, son département et la journée de service. Sans cela,
 * une tablette partagée servirait le brouillon d'un collègue, et un stock
 * compté la veille reviendrait le lendemain alors qu'il ne veut plus rien dire.
 *
 * Le stockage peut échouer — navigation privée, quota atteint, cookies
 * bloqués — donc chaque accès est protégé : au pire on perd la reprise, jamais
 * la saisie en cours.
 */
export function useDraft({
  userName, departmentName, businessDay,
}: {
  userName: string
  departmentName: string
  businessDay: string
}) {
  const key = `economan:draft:${departmentName}:${userName}:${businessDay.slice(0, 10)}`

  // Ce qu'on a trouvé au chargement. Lu une seule fois : relire ensuite
  // écraserait la saisie en cours.
  const [restored, setRestored] = React.useState<Brouillon | null>(null)
  const [checked, setChecked] = React.useState(false)

  React.useEffect(() => {
    try {
      const brut = window.localStorage.getItem(key)
      if (brut) {
        const d = JSON.parse(brut) as Brouillon
        // Un brouillon vide n'a rien à proposer.
        if (d && typeof d === 'object' && Object.keys(d.onHand ?? {}).length > 0) {
          setRestored(d)
        }
      }
    } catch {
      // Stockage indisponible : on démarre sur une feuille vierge.
    }
    setChecked(true)
  }, [key])

  const save = React.useCallback(
    (onHand: Record<string, string>, note: string) => {
      try {
        // Ne garder que les lignes réellement saisies : un objet de 109 clés
        // vides grossirait le stockage sans rien apporter.
        const utiles = Object.fromEntries(
          Object.entries(onHand).filter(([, v]) => (v ?? '').trim() !== ''),
        )
        if (Object.keys(utiles).length === 0 && note.trim() === '') {
          window.localStorage.removeItem(key)
          return
        }
        window.localStorage.setItem(
          key,
          JSON.stringify({ onHand: utiles, note, at: Date.now() } satisfies Brouillon),
        )
      } catch {
        // Quota ou mode privé : la saisie continue, seule la reprise est perdue.
      }
    },
    [key],
  )

  const clear = React.useCallback(() => {
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* rien à faire */
    }
  }, [key])

  /** Purge les brouillons des journées passées, laissés par ce navigateur. */
  React.useEffect(() => {
    try {
      const prefix = `economan:draft:${departmentName}:${userName}:`
      for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
        const k = window.localStorage.key(i)
        if (k && k.startsWith(prefix) && k !== key) window.localStorage.removeItem(k)
      }
    } catch {
      /* rien à faire */
    }
  }, [key, departmentName, userName])

  return { restored, checked, save, clear }
}
