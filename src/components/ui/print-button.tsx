'use client'

import { Button, type ButtonProps } from '@/components/ui/glass'

/** Déclenche l'impression du document courant, mise en page par @media print. */
export function PrintButton({ children, ...props }: ButtonProps) {
  return (
    <Button {...props} onClick={() => window.print()}>
      {children}
    </Button>
  )
}
