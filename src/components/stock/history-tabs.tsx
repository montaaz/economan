import Link from 'next/link'
import { ClipboardList, Warehouse } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Les deux journaux de l'historique, et le filtre du stock général.
 *
 * Le stock général est un « département » comme les autres pour qui relit
 * la journée : ses entrées et ses sorties se lisent ici, à côté des
 * tickets, avec la même période.
 */
export function HistoryTabs({
  selfPath, stock, from, to, type, tout,
}: {
  selfPath: string
  stock: boolean
  from?: string
  to?: string
  type?: string
  tout?: string
}) {
  const lien = (vue: 'commandes' | 'stock') => {
    const p = new URLSearchParams()
    if (from) p.set('du', from)
    if (to) p.set('au', to)
    if (vue === 'stock') p.set('vue', 'stock')
    // Le filtre entrées/sorties et « tout l'historique » suivent sur le stock.
    if (vue === 'stock' && type) p.set('type', type)
    if (vue === 'stock' && tout === '1') p.set('tout', '1')
    return p.size ? `${selfPath}?${p}` : selfPath
  }
  const onglet = 'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[0.8rem] font-semibold transition-colors'
  const actif = 'border-accent/40 bg-accent/12 text-accent'
  const inactif = 'border-[rgb(var(--glass-edge)/0.34)] bg-white/65 text-fg-muted hover:bg-white hover:text-fg'
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Link href={lien('commandes')} className={cn(onglet, !stock ? actif : inactif)}>
        <ClipboardList className="size-3.5" />
        Commandes
      </Link>
      <Link href={lien('stock')} className={cn(onglet, stock ? actif : inactif)}>
        <Warehouse className="size-3.5" />
        Stock général
      </Link>
      {/* Entrées / Sorties se choisissent sur leurs cartes, plus bas ; ici
          seul le journal se choisit. */}
    </div>
  )
}
