'use client'

import * as React from 'react'
import * as Lucide from 'lucide-react'
import { Circle, type LucideProps } from 'lucide-react'

type IconRegistry = Record<string, React.ComponentType<LucideProps>>

/** « cake-slice » et « cake_slice » deviennent « CakeSlice ». */
function toPascalCase(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/**
 * Résout une icône lucide par son nom, pour les icônes choisies en base.
 *
 * Le registre lucide est en PascalCase, alors que les icônes sont stockées en
 * kebab-case. Sans conversion, chaque recherche échouait et retombait sur le
 * cercle par défaut. Le nom est essayé tel quel d'abord, pour les appels du
 * code qui passent déjà « LayoutDashboard ».
 */
export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const registry = Lucide as unknown as IconRegistry
  const Cmp = registry[name] ?? registry[toPascalCase(name)] ?? Circle
  return <Cmp {...props} />
}
