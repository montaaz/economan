'use client'

import * as Lucide from 'lucide-react'
import { Circle, type LucideProps } from 'lucide-react'

type IconRegistry = Record<string, React.ComponentType<LucideProps>>

/** Résout une icône lucide par son nom, pour les icônes choisies en base. */
export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const registry = Lucide as unknown as IconRegistry
  const Cmp = registry[name] ?? Circle
  return <Cmp {...props} />
}
