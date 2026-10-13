'use client'

import * as React from 'react'
import { Printer, Layers, ChevronRight } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Icon } from '@/components/ui/icon'

type Dept = { id: string; name: string; color: string; icon: string | null; articles: number }

/** Le menu d'impression : tous les départements, ou un seul. S'ouvre d'emblée. */
export function ChoixImpression({ departments }: { departments: Dept[] }) {
  const [ouvert, setOuvert] = React.useState(true)
  const imprimer = (dep: string) => window.open(`/api/feuilles-commande?dep=${dep}`, '_blank', 'noopener')
  const total = departments.reduce((n, d) => n + d.articles, 0)

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-b from-[#4f6ef7] to-[#3b4fd8] px-5 text-[1rem] font-bold text-white shadow-[0_10px_24px_-10px_rgb(59_79_216/0.8)] hover:brightness-110"
      >
        <Printer className="size-5" /> Choisir ce qu’on imprime
      </button>
      {ouvert ? (
        <Modal title="Imprimer — quels départements ?" onClose={() => setOuvert(false)} wide>
          <button
            type="button"
            onClick={() => imprimer('tous')}
            className="group mb-3 flex w-full items-center gap-3 rounded-2xl border-2 border-[#3b4fd8]/40 bg-gradient-to-br from-[#4f6ef7]/12 to-transparent p-4 text-left transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#4f6ef7] to-[#3b4fd8] text-white shadow-md">
              <Layers className="size-7" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[1.05rem] font-bold text-fg">Tous les départements</span>
              <span className="block text-[0.8rem] text-fg-muted">Un seul PDF · {departments.length} départements · {total} articles · chacun sur ses pages</span>
            </span>
            <Printer className="size-5 shrink-0 text-[#3b4fd8]" />
          </button>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {departments.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => imprimer(d.id)}
                className="group flex items-center gap-3 overflow-hidden rounded-2xl border p-3.5 text-left transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md"
                style={{ borderColor: `${d.color}55`, background: `linear-gradient(135deg, ${d.color}24, ${d.color}08 65%, transparent)` }}
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-xl text-white shadow-md" style={{ background: `linear-gradient(140deg, ${d.color}, ${d.color}b8)` }}>
                  <Icon name={d.icon ?? 'Building2'} className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.98rem] font-bold leading-tight text-fg">{d.name}</span>
                  <span className="mt-0.5 block text-[0.75rem] font-medium text-fg-muted">{d.articles} articles</span>
                </span>
                <ChevronRight className="size-4 shrink-0" style={{ color: d.color }} />
              </button>
            ))}
          </div>
        </Modal>
      ) : null}
    </>
  )
}
