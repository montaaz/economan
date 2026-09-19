'use client'

import { Button, type ButtonProps } from '@/components/ui/glass'

/**
 * Ouvre la feuille en PDF, dans un onglet.
 *
 * `window.print()` faisait écrire au navigateur, en marge de chaque page, le
 * titre de l'onglet, l'URL, la date et la pagination. Aucun CSS ne les
 * retire — vérifié : `@page { margin: 0 }` et ses variantes par axe n'y
 * changent rien, ils sont ajoutés après le rendu du document.
 *
 * Le PDF est donc produit sur le serveur, par un navigateur sans interface
 * qui n'ajoute rien. Il s'ouvre dans le visualiseur intégré, d'où l'employé
 * imprime un document déjà propre.
 */
export function PrintButton({
  orderId, children, ...props
}: ButtonProps & { orderId: string }) {
  return (
    <Button
      {...props}
      onClick={() => window.open(`/api/bon/${orderId}`, '_blank', 'noopener')}
      title="Ouvre la feuille en PDF, prête à imprimer"
    >
      {children}
    </Button>
  )
}
