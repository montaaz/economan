import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Retour vers l'écran précédent, en bouton plutôt qu'en lien discret.
 *
 * Un libellé gris sans cadre se lit comme un titre : on ne devine pas qu'il
 * se clique, et le seul chemin de retour d'une fiche passait inaperçu. Le
 * cadre, le fond et la flèche encadrée le désignent comme un bouton, au même
 * titre que ceux de la barre d'actions juste en dessous.
 */
export function BackLink({
  href, children, className,
}: {
  href: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        'no-print group mb-4 inline-flex items-center gap-2 rounded-xl border',
        'border-[rgb(var(--glass-edge)/0.34)] bg-white/65 py-2 pl-2 pr-3.5 backdrop-blur-md',
        'text-[0.85rem] font-semibold text-fg shadow-[0_2px_8px_-4px_rgb(var(--shadow-ambient)/0.4)]',
        'transition-[background-color,border-color,box-shadow] hover:border-accent/40 hover:bg-white',
        'hover:shadow-[0_6px_16px_-8px_rgb(var(--shadow-ambient)/0.5)]',
        className,
      )}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent transition-colors group-hover:bg-accent/18">
        <ArrowLeft className="size-4" />
      </span>
      {children}
    </Link>
  )
}
