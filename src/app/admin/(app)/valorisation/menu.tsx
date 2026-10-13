'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Layers, ChevronRight, Coins } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Icon } from '@/components/ui/icon'

type Dept = { id: string; name: string; color: string; icon: string | null }

/** Le choix : tous les départements, ou un seul. S'ouvre d'emblée. */
export function MenuValorisation({ departments, suffixe = '' }: { departments: Dept[]; suffixe?: string }) {
  const router = useRouter()
  const [ouvert, setOuvert] = React.useState(true)
  const aller = (dep: string) => { setOuvert(false); router.push(`/admin/valorisation/${dep}${suffixe}`) }
  return (
    <>
      <button type="button" onClick={() => setOuvert(true)}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-[0.9rem] font-bold text-white shadow-md hover:brightness-110">
        <Coins className="size-4" /> Choisir les départements
      </button>
      {ouvert ? (
        <Modal title="Commandes valorisées — quels départements ?" onClose={() => setOuvert(false)} wide>
          <button type="button" onClick={() => aller('tous')}
            className="mb-3 flex w-full items-center gap-3 rounded-2xl border-2 border-accent/40 bg-gradient-to-br from-accent/12 to-transparent p-4 text-left transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md">
            <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-accent text-white shadow-md"><Layers className="size-7" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[1.05rem] font-bold text-fg">Tous les départements</span>
              <span className="block text-[0.8rem] text-fg-muted">Chaque département avec son total, et le total général</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-accent" />
          </button>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {departments.map((d) => (
              <button key={d.id} type="button" onClick={() => aller(d.id)}
                className="flex items-center gap-3 overflow-hidden rounded-2xl border p-3.5 text-left transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md"
                style={{ borderColor: `${d.color}55`, background: `linear-gradient(135deg, ${d.color}24, ${d.color}08 65%, transparent)` }}>
                <span className="grid size-12 shrink-0 place-items-center rounded-xl text-white shadow-md" style={{ background: `linear-gradient(140deg, ${d.color}, ${d.color}b8)` }}>
                  <Icon name={d.icon ?? 'Building2'} className="size-6" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[0.98rem] font-bold text-fg">{d.name}</span>
                <ChevronRight className="size-4 shrink-0" style={{ color: d.color }} />
              </button>
            ))}
          </div>
        </Modal>
      ) : null}
    </>
  )
}
