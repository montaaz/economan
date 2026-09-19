'use client'

import * as React from 'react'
import { Button, type ButtonProps } from '@/components/ui/glass'

/**
 * Imprime la feuille sans les en-têtes que le navigateur ajoute en marge.
 *
 * Chrome écrit en haut le titre de l'onglet et en bas l'URL de la page. Aucun
 * CSS ne les retire — vérifié : ni `@page { margin: 0 }` ni les variantes par
 * axe n'y changent rien, ils sont ajoutés après le rendu du document.
 *
 * Ce qu'on contrôle, en revanche, c'est ce qu'ils contiennent. Le titre de
 * l'onglet est vidé le temps de l'impression, donc l'en-tête haut reste blanc,
 * et il est rétabli aussitôt pour ne pas casser l'historique du navigateur.
 *
 * L'URL du pied de page, elle, appartient au navigateur : seule la case
 * « En-têtes et pieds de page » de la boîte d'impression la supprime. Le
 * bouton le rappelle dans son infobulle.
 */
export function PrintButton({ children, ...props }: ButtonProps) {
  const imprimer = React.useCallback(() => {
    const titre = document.title
    document.title = ''

    // Le titre doit revenir quelle que soit l'issue — impression lancée ou
    // annulée — sinon l'onglet reste sans nom pour toute la session.
    const restaurer = () => {
      document.title = titre
      window.removeEventListener('afterprint', restaurer)
    }
    window.addEventListener('afterprint', restaurer)
    // Filet de sécurité : `afterprint` ne se déclenche pas partout.
    window.setTimeout(restaurer, 3000)

    window.print()
  }, [])

  return (
    <Button
      {...props}
      onClick={imprimer}
      title="Pour retirer aussi l’URL en bas de page, décochez « En-têtes et pieds de page » dans la boîte d’impression"
    >
      {children}
    </Button>
  )
}
