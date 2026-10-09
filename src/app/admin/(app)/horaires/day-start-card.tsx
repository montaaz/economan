'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Moon, Sunrise, Check, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { enregistrerDebutJournee } from './actions'

const HEURES_NUIT = ['02:00', '03:00', '04:00', '05:00', '06:00']

/**
 * Quand un nouveau jour commence : deux choix, en clair.
 *
 * « Minuit » : comme avant, le jour change à 00:00. « Après minuit » : la
 * journée continue jusqu'à l'heure choisie — une commande passée la nuit
 * reste dans la journée de la veille.
 */
export function DayStartCard({ initial }: { initial: string }) {
  const router = useRouter()
  const { push } = useToast()
  const [heure, setHeure] = React.useState(initial)
  const [enCours, setEnCours] = React.useState(false)
  const nuit = heure !== '00:00'
  const change = heure !== initial
  const heureNuit = nuit ? heure : '05:00'
  const h = Number(heureNuit.slice(0, 2))
  // Un exemple concret, à mi-chemin entre minuit et l'heure choisie.
  const exemple = `${String(Math.max(1, Math.floor(h / 2))).padStart(2, '0')}:30`

  const enregistrer = async () => {
    setEnCours(true)
    try {
      const r = await enregistrerDebutJournee(heure)
      if (!r.ok) { push('error', r.error ?? 'Enregistrement impossible.'); return }
      push('success', heure === '00:00'
        ? 'Enregistré : un nouveau jour commence à minuit.'
        : `Enregistré : la journée continue jusqu’à ${heure} le lendemain.`)
      router.refresh()
    } finally { setEnCours(false) }
  }

  const choix = (actif: boolean) => cn(
    'flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors',
    actif ? 'border-accent bg-accent/[0.07]' : 'border-[rgb(var(--glass-edge)/0.3)] bg-white/70 hover:border-accent/40',
  )
  const rond = (actif: boolean) => cn(
    'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2',
    actif ? 'border-accent bg-accent text-white' : 'border-[rgb(var(--glass-edge)/0.6)]',
  )

  return (
    <section className="mb-5 rounded-3xl border border-[rgb(var(--glass-edge)/0.25)] bg-white/70 p-5 shadow-sm">
      <h2 className="text-[1.05rem] font-bold text-fg">Quand commence un nouveau jour ?</h2>
      <p className="mt-0.5 text-[0.86rem] text-fg-muted">
        Ce réglage décide sur quelle journée tombent les commandes passées la nuit.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <button type="button" onClick={() => setHeure('00:00')} className={choix(!nuit)} aria-pressed={!nuit}>
          <span className={rond(!nuit)}>{!nuit ? <Check className="size-3" /> : null}</span>
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-[1rem] font-bold text-fg"><Moon className="size-4 text-accent" /> À minuit (normal)</span>
            <span className="mt-1 block text-[0.85rem] text-fg-muted">Chaque jour va de <strong className="text-fg">00:00</strong> à <strong className="text-fg">00:00</strong>.</span>
          </span>
        </button>

        <div className={choix(nuit)}>
          <button type="button" onClick={() => setHeure(heureNuit)} className={rond(nuit)} aria-pressed={nuit} aria-label="La journée continue après minuit">
            {nuit ? <Check className="size-3" /> : null}
          </button>
          <span className="min-w-0 flex-1">
            <button type="button" onClick={() => setHeure(heureNuit)} className="flex items-center gap-2 text-left text-[1rem] font-bold text-fg">
              <Sunrise className="size-4 text-accent" /> La journée continue après minuit
            </button>
            <span className="mt-1 block text-[0.85rem] text-fg-muted">Jusqu’à :</span>
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {HEURES_NUIT.map((x) => (
                <button
                  key={x}
                  type="button"
                  onClick={() => setHeure(x)}
                  className={cn('rounded-lg border px-3 py-1.5 text-[0.88rem] font-bold tabular-nums transition-colors',
                    heure === x ? 'border-accent bg-accent text-white' : 'border-[rgb(var(--glass-edge)/0.35)] bg-white text-fg-muted hover:text-fg')}
                >
                  {x}
                </button>
              ))}
            </span>
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-[rgb(var(--glass-edge)/0.1)] px-4 py-3">
        <p className="min-w-0 flex-1 text-[0.88rem] text-fg">
          {nuit ? (
            <>Exemple : une commande passée le 8 à <strong>{exemple}</strong> compte pour la journée du <strong>7</strong>. À <strong>{heure}</strong>, le 8 commence.</>
          ) : (
            <>Exemple : une commande passée le 8 à <strong>00:30</strong> compte pour la journée du <strong>8</strong>.</>
          )}
        </p>
        {change ? (
          <button type="button" onClick={() => void enregistrer()} disabled={enCours}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-[0.9rem] font-bold text-white shadow-md hover:brightness-110 disabled:opacity-60">
            {enCours ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Enregistrer
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/12 px-3 py-1.5 text-[0.82rem] font-semibold text-ok">
            <Check className="size-4" /> Réglage en service
          </span>
        )}
      </div>
    </section>
  )
}
