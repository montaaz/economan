'use client'

import * as React from 'react'
import { ComboSelect, type ComboOption } from '@/components/ui/combo-select'
import { cn } from '@/lib/utils'

/** Un département, tel qu'une famille le cite. */
export type FamilleDep = { id: number; name: string; color: string }

/** Une famille, avec les départements dont la feuille l'utilise. */
export type FamilleRef = { id: string; name: string; articles?: number; departements?: FamilleDep[] }

/** Les départements d'une famille, en pastilles à leur couleur. */
export function PastillesDepartements({ departements, actif, className }: {
  departements: FamilleDep[]
  /** Le département ouvert, mis en avant. */
  actif?: number
  className?: string
}) {
  if (departements.length === 0) {
    return <span className={cn('text-[0.72rem] italic text-fg-subtle', className)}>Aucun département</span>
  }
  return (
    <span className={cn('flex flex-wrap gap-1', className)}>
      {departements.map((d) => (
        <span
          key={d.id}
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[0.68rem] font-medium leading-4',
            d.id === actif ? 'text-white' : 'bg-[rgb(var(--glass-edge)/0.12)] text-fg-muted',
          )}
          style={d.id === actif ? { backgroundColor: d.color } : undefined}
        >
          {d.id === actif ? null : <span className="size-1.5 rounded-full" style={{ backgroundColor: d.color }} />}
          {d.name}
        </span>
      ))}
    </span>
  )
}

/**
 * Le choix de la famille d'un article.
 *
 * Les noms seuls ne disaient pas à qui sert une famille : EMBALLAGES sert
 * cinq départements, EMBALLAGE PÂTISSERIE un seul. Chaque famille montre ses
 * départements en pastilles ; celles de la feuille ouverte viennent d'abord.
 * On cherche aussi par département (« bar »).
 */
export function FamilleSelect({ id, name, defaultValue, categories, departmentId, departmentName }: {
  id: string
  name: string
  defaultValue: string
  categories: FamilleRef[]
  departmentId: number
  departmentName: string
}) {
  const [choix, setChoix] = React.useState(defaultValue)
  const ici = (c: FamilleRef) => c.departements?.some((d) => d.id === departmentId) ?? false

  const options: ComboOption[] = [...categories.filter(ici), ...categories.filter((c) => !ici(c))].map((c) => ({
    value: c.id,
    label: c.name,
    group: ici(c) ? `Familles de ${departmentName}` : 'Autres familles',
    keywords: (c.departements ?? []).map((d) => d.name).join(' '),
    meta: <PastillesDepartements departements={c.departements ?? []} actif={departmentId} />,
  }))
  const choisie = categories.find((c) => c.id === choix)

  return (
    <>
      <input type="hidden" id={id} name={name} value={choix} />
      <ComboSelect
        value={choix}
        onChange={setChoix}
        options={options}
        label="Famille"
        placeholder="Choisir une famille…"
        searchPlaceholder="Famille ou département…"
      />
      {choisie ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.75rem] text-fg-subtle">
          <span>Utilisée par :</span>
          <PastillesDepartements departements={choisie.departements ?? []} actif={departmentId} />
        </div>
      ) : null}
    </>
  )
}
