'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Siren } from 'lucide-react'
import { ChoixDepartement } from '@/components/orders/urgent-order-button'
import { urgenceDepartement } from '../departement/actions'

type Dept = { id: string; name: string; color: string; icon: string | null }

/**
 * Le menu s'ouvre d'emblée, le même que celui de l'administration ; fermé,
 * un bouton rouge le rouvre.
 */
export function ChoixUrgence({ departments }: { departments: Dept[] }) {
  const router = useRouter()
  const [ouvert, setOuvert] = React.useState(true)
  const [enCours, startTransition] = React.useTransition()
  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        disabled={enCours}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#7f1d1d] px-3.5 text-[0.85rem] font-bold text-white shadow-[0_6px_16px_-8px_rgb(127_29_29/0.7)] transition-colors hover:bg-[#661717] disabled:opacity-60"
      >
        <Siren className="size-4" aria-hidden="true" />
        {enCours ? 'Ouverture de la feuille…' : 'Choisir le département'}
      </button>
      {ouvert ? (
        <ChoixDepartement
          departments={departments}
          onClose={() => { setOuvert(false); router.refresh() }}
          choisir={(id) => { setOuvert(false); startTransition(() => urgenceDepartement(Number(id))) }}
        />
      ) : null}
    </>
  )
}
