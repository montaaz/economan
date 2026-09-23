'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Siren, ChevronRight } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

type Dept = { id: string; name: string; color: string; icon: string | null }

/**
 * Commande urgente, passée par l'administration.
 *
 * Le bouton ouvre le choix du département — des cartes, une par rayon —
 * puis la feuille de ce rayon s'ouvre telle que ses employés la remplissent.
 * Choisir, c'est tout ce que fait cette fenêtre : la saisie a son écran.
 */
export function UrgentOrderButton({ departments, className }: { departments: Dept[]; className?: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-xl bg-[#7f1d1d] px-3.5 text-[0.85rem] font-bold text-white shadow-[0_6px_16px_-8px_rgb(127_29_29/0.7)] transition-colors hover:bg-[#661717] sm:h-9 sm:text-[0.8rem]',
          className,
        )}
      >
        <Siren className="size-4" aria-hidden="true" />
        Commande urgente
      </button>
      {open ? <ChoixDepartement departments={departments} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function ChoixDepartement({ departments, onClose }: { departments: Dept[]; onClose: () => void }) {
  const router = useRouter()
  return (
    <Modal title="Commande urgente — pour quel département ?" onClose={onClose} wide>
      <p className="mb-3 text-[0.85rem] text-fg-muted">
        La feuille du rayon s’ouvrira telle que ses employés la remplissent. Le ticket portera votre nom.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {departments.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => { onClose(); router.push(`/admin/commande-urgente/${d.id}`) }}
            className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border p-3.5 text-left transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-14px_rgb(var(--shadow-ambient)/0.55)] sm:p-4"
            style={{
              borderColor: `${d.color}55`,
              background: `linear-gradient(135deg, ${d.color}24, ${d.color}08 65%, transparent)`,
            }}
          >
            <span
              className="grid size-12 shrink-0 place-items-center rounded-xl text-white shadow-md sm:size-14"
              style={{ background: `linear-gradient(140deg, ${d.color}, ${d.color}b8)` }}
            >
              <Icon name={d.icon ?? 'Building2'} className="size-6 sm:size-7" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.98rem] font-bold leading-tight text-fg">{d.name}</span>
              <span className="mt-0.5 block text-[0.75rem] font-medium text-fg-muted">Ouvrir la feuille</span>
            </span>
            <ChevronRight
              className="size-4 shrink-0 text-fg-subtle transition-transform duration-200 group-hover:translate-x-0.5"
              style={{ color: d.color }}
            />
          </button>
        ))}
      </div>
    </Modal>
  )
}
