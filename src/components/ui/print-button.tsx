'use client'

import { Button, type ButtonProps } from '@/components/ui/glass'
import { cn } from '@/lib/utils'
import { TEINTES_FORTES, type TeinteBon } from '@/components/ui/bon-style'

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
  orderId, teinte = 'livraison', children, className, ...props
}: ButtonProps & { orderId: string; teinte?: TeinteBon }) {
  return (
    <Button
      variant="primary"
      size="lg"
      {...props}
      className={cn('!h-12 !rounded-2xl !px-6 !text-[1rem] !font-bold !text-white hover:!brightness-110', TEINTES_FORTES[teinte], className)}
      onClick={() => window.open(`/api/bon/${orderId}`, '_blank', 'noopener')}
      title="Ouvre la feuille en PDF, prête à imprimer"
    >
      {children}
    </Button>
  )
}
