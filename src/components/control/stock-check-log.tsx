'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { History, Pencil, X, Loader2, Package, MessageSquareText } from 'lucide-react'
import { gql, errorMessage } from '@/lib/graphql-client'
import { cn, formatQty, formatLongDate } from '@/lib/utils'

const LOGS = /* GraphQL */ `
  query StockCheckLogs($departmentId: ID!, $productId: ID!, $day: Date!) {
    stockCheckLogs(departmentId: $departmentId, productId: $productId, day: $day) {
      id field oldValue newValue userName createdAt
    }
  }
`

type Log = { id: string; field: 'REEL' | 'REMARQUE'; oldValue: string | null; newValue: string | null; userName: string; createdAt: string }

/** « 02/10/2026 à 08:22 » */
function quand(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} à ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Ce qu'une modification a fait, en une phrase. */
function phrase(l: Log, unite: string) {
  const q = (v: string) => `${formatQty(Number(v))} ${unite}`.trim()
  if (l.field === 'REEL') {
    if (l.oldValue === null) return <>a saisi le stock réel : <strong>{q(l.newValue!)}</strong></>
    if (l.newValue === null) return <>a effacé le stock réel (était {q(l.oldValue)})</>
    return <>a modifié le stock réel : {q(l.oldValue)} → <strong>{q(l.newValue)}</strong></>
  }
  if (l.oldValue === null) return <>a ajouté la remarque : <strong>« {l.newValue} »</strong></>
  if (l.newValue === null) return <>a effacé la remarque « {l.oldValue} »</>
  return <>a modifié la remarque : <strong>« {l.newValue} »</strong> <span className="text-[#9a7b5a]">(avant : « {l.oldValue} »)</span></>
}

/**
 * Le bouton LOG d'une ligne du contrôle, et l'historique qu'il ouvre.
 *
 * Réservé à l'administration : chaque saisie du stock réel ou de la remarque
 * y figure, avec son auteur, l'ancienne et la nouvelle valeur, la date et
 * l'heure exactes.
 */
export function StockCheckLogButton({ departmentId, productId, productName, unitSymbol, day, count }: {
  departmentId: string
  productId: string
  productName: string
  unitSymbol: string
  day: string
  count: number
}) {
  const [ouvert, setOuvert] = React.useState(false)
  const [logs, setLogs] = React.useState<Log[] | null>(null)
  const [erreur, setErreur] = React.useState<string | null>(null)

  const ouvrir = async () => {
    setOuvert(true); setLogs(null); setErreur(null)
    try {
      const r = await gql<{ stockCheckLogs: Log[] }>(LOGS, { departmentId, productId, day })
      setLogs(r.stockCheckLogs)
    } catch (e) { setErreur(errorMessage(e)) }
  }

  React.useEffect(() => {
    if (!ouvert) return
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false) }
    window.addEventListener('keydown', echap)
    return () => window.removeEventListener('keydown', echap)
  }, [ouvert])

  return (
    <>
      <button
        type="button"
        onClick={() => void ouvrir()}
        aria-label={`Historique des modifications — ${productName}`}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wide text-white shadow-[0_4px_12px_-4px_rgb(234_88_12/0.6)] transition-[filter,transform] hover:brightness-110 active:translate-y-px',
          count > 0 ? 'bg-gradient-to-b from-[#fb923c] to-[#ea580c]' : 'bg-gradient-to-b from-[#fdba74] to-[#fb923c] opacity-70',
        )}
      >
        <History className="size-3.5" />
        Log
        {count > 0 ? <span className="rounded-full bg-white/25 px-1.5 text-[0.65rem]">{count}</span> : null}
      </button>

      {ouvert ? createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgb(15_23_42/0.45)] p-4 backdrop-blur-sm" onClick={() => setOuvert(false)}>
          <div role="dialog" aria-modal="true" aria-label="Historique des modifications"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-[1.75rem] bg-white shadow-[0_30px_80px_-20px_rgb(15_23_42/0.55)]">
            <div className="relative bg-gradient-to-br from-[#9a6a2f] via-[#b4602a] to-[#c2410c] px-6 pb-5 pt-6 text-white">
              <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer"
                className="absolute right-4 top-4 grid size-8 place-items-center rounded-full text-white/80 hover:bg-white/15 hover:text-white">
                <X className="size-4" />
              </button>
              <h2 className="flex items-center gap-2.5 text-[1.05rem] font-extrabold uppercase tracking-wide">
                <History className="size-5" /> Historique des modifications
              </h2>
              <p className="mt-1 text-[0.8rem] font-semibold text-white/90">{productName}</p>
              <p className="text-[0.72rem] font-medium uppercase tracking-[0.12em] text-white/75">{formatLongDate(day)}</p>
            </div>
            <div className="max-h-[60vh] space-y-3 overflow-y-auto px-6 py-5">
              {erreur ? <p className="text-[0.85rem] text-danger">{erreur}</p>
                : logs === null ? <p className="flex items-center gap-2 text-[0.85rem] text-fg-muted"><Loader2 className="size-4 animate-spin" /> Chargement…</p>
                  : logs.length === 0 ? <p className="py-6 text-center text-[0.88rem] text-fg-muted">Aucune modification sur cette ligne.</p>
                    : logs.map((l) => (
                      <div key={l.id} className="flex items-start gap-3 rounded-2xl border border-[#f0e2c8] bg-[#fdf9f1] px-4 py-3">
                        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[#f3e6d0] text-[#9a6a2f]">
                          {l.field === 'REEL' ? <Package className="size-4" /> : l.oldValue === null ? <MessageSquareText className="size-4" /> : <Pencil className="size-4" />}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[0.88rem] leading-snug text-[#3f2a14]">
                            <strong className="text-[#9a5a1c]">{l.userName}</strong> {phrase(l, unitSymbol)}
                          </p>
                          <p className="mt-0.5 text-[0.72rem] text-[#a8957c]">{quand(l.createdAt)}</p>
                        </div>
                      </div>
                    ))}
            </div>
            <div className="flex justify-end border-t border-[#f3ece0] px-6 py-3">
              <button type="button" onClick={() => setOuvert(false)}
                className="rounded-lg px-3 py-1.5 text-[0.8rem] font-extrabold uppercase tracking-[0.12em] text-[#9a6a2f] hover:bg-[#fdf3e3]">
                Fermer
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  )
}
