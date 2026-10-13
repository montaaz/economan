'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { PlusCircle } from 'lucide-react'
import { ChoixDepartement } from '@/components/orders/urgent-order-button'

type Dept = { id: string; name: string; color: string; icon: string | null }

/** Le menu s'ouvre d'emblée ; fermé, un bouton le rouvre. */
export function ChoixNouvelleCommande({ departments }: { departments: Dept[] }) {
  const router = useRouter()
  const [ouvert, setOuvert] = React.useState(true)
  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-[0.9rem] font-bold text-white shadow-md hover:brightness-110"
      >
        <PlusCircle className="size-4" /> Choisir le département
      </button>
      {ouvert ? (
        <ChoixDepartement
          departments={departments}
          titre="Nouvelle commande — pour quel département ?"
          onClose={() => setOuvert(false)}
          choisir={(id) => { setOuvert(false); router.push(`/admin/nouvelle-commande/${id}`) }}
        />
      ) : null}
    </>
  )
}
