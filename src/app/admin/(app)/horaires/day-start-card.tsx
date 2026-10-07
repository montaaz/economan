'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Sunrise, Check, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { enregistrerDebutJournee } from './actions'

/**
 * Quand commence la journée de travail. Réglée à 05:00, tout ce qui se passe
 * entre minuit et 05:00 appartient encore à la veille : le tableau du jour ne
 * se vide plus à minuit, et la commande de 01 h reste dans sa journée.
 */
export function DayStartCard({ initial, journee }: { initial: string; journee: string }) {
  const router = useRouter()
  const { push } = useToast()
  const [heure, setHeure] = React.useState(initial)
  const [enCours, setEnCours] = React.useState(false)
  const fin = heure === '00:00' ? 'minuit' : heure

  const enregistrer = async () => {
    setEnCours(true)
    try {
      const r = await enregistrerDebutJournee(heure)
      if (!r.ok) { push('error', r.error ?? 'Enregistrement impossible.'); return }
      push('success', `La journée de travail commence maintenant à ${heure}.`)
      router.refresh()
    } finally { setEnCours(false) }
  }

  return (
    <section className="mb-5 rounded-3xl border border-[rgb(var(--glass-edge)/0.25)] bg-white/70 p-5 shadow-sm">
      <p className="flex items-center gap-2 text-[0.8rem] font-bold uppercase tracking-[0.06em] text-accent">
        <Sunrise className="size-4" /> Journée de travail
      </p>
      <p className="mt-1 text-[0.86rem] text-fg-muted">
        L’heure où commence une nouvelle journée. Avant elle, on est encore la veille : les commandes, les servis et le tableau du jour restent sur la même journée jusqu’à cette heure.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-[0.78rem] font-semibold text-fg-muted">La journée commence à</span>
          <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} className="field h-12 w-36 text-[1.1rem] font-bold tabular-nums" />
        </label>
        <div className="flex flex-wrap gap-1.5 pb-1">
          {['00:00', '04:00', '05:00', '06:00'].map((h) => (
            <button key={h} type="button" onClick={() => setHeure(h)}
              className="rounded-full border border-[rgb(var(--glass-edge)/0.35)] bg-white/80 px-3 py-1.5 text-[0.8rem] font-semibold text-fg-muted hover:text-fg">
              {h === '00:00' ? 'Minuit' : h}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void enregistrer()} disabled={enCours || heure === initial}
          className="ml-auto inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-[0.88rem] font-bold text-white shadow-md hover:brightness-110 disabled:opacity-50">
          {enCours ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Enregistrer
        </button>
      </div>
      <p className="mt-3 rounded-xl bg-accent/[0.08] px-3 py-2 text-[0.84rem] text-fg">
        Une journée va de <strong>{fin}</strong> à <strong>{fin}</strong> le lendemain. Journée en cours : <strong className="capitalize">{journee}</strong>.
      </p>
    </section>
  )
}
