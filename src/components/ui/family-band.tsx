import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Bandeau qui ouvre le bloc d'une famille dans un tableau d'articles.
 *
 * Le compte d'articles accompagne le nom, comme sur les pastilles de filtre :
 * sur une feuille de cent lignes, savoir qu'une famille en porte trois ou
 * vingt-trois se lisait jusqu'ici en les comptant à l'œil.
 */
export function FamilyBand({
  name, count, colSpan, className,
}: {
  name: string
  /** Nombre d'articles de la famille dans ce tableau. */
  count: number
  colSpan: number
  /** Le ticket papier a sa propre teinte, imprimable en noir et blanc. */
  className?: string
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className={cn(
          'bg-ok/12 px-2 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.06em] text-ok sm:px-3 sm:text-[0.76rem]',
          className,
        )}
      >
        {name}
        <span className="ml-1.5 font-semibold opacity-70">({count})</span>
      </td>
    </tr>
  )
}

/**
 * Nombre d'articles par famille dans une liste déjà rangée.
 *
 * Les lignes arrivent groupées : on compte sans réordonner, pour que le
 * bandeau annonce exactement ce que le lecteur va parcourir en dessous.
 */
export function countByFamily(lines: { categoryName: string }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const l of lines) counts.set(l.categoryName, (counts.get(l.categoryName) ?? 0) + 1)
  return counts
}
