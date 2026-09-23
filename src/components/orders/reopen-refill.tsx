'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Lock, LockOpen } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm'
import { useToast } from '@/components/ui/toast'
import { gql, errorMessage } from '@/lib/graphql-client'
import { cn } from '@/lib/utils'

const REOPEN = /* GraphQL */ `
  mutation ReopenRefill($id: ID!) { reopenRefill(id: $id) }
`
const LOCK = /* GraphQL */ `
  mutation LockRefill($id: ID!) { lockRefill(id: $id) }
`

/**
 * Rouvrir un servi dont le bon est émis, ou le refermer — le geste de
 * l'administration.
 *
 * Le bon fige le passage pour l'économat : rien ne s'y corrige plus. Quand il
 * faut pourtant y revenir, c'est l'administration qui lève le verrou, depuis
 * la carte du servi ; l'économat retrouve alors la colonne ouverte et réémet
 * le bon une fois la correction faite. Le même bouton referme un servi
 * rouvert par erreur, sans attendre l'économat. Il vit hors du lien de la
 * carte pour ne pas ouvrir la fiche en même temps.
 */
export function ReopenRefill({
  id, rank, ouvert,
}: {
  id: string
  rank: number
  /** Vrai quand le bon n'est pas émis : le bouton propose alors de refermer. */
  ouvert: boolean
}) {
  const router = useRouter()
  const confirmer = useConfirm()
  const { push } = useToast()
  const [busy, setBusy] = React.useState(false)

  const agir = async () => {
    const ok = await confirmer(ouvert
      ? {
          title: `Refermer le ${rank}ᵉ servi ?`,
          message: `Le bon de livraison du ${rank}ᵉ servi sera considéré comme émis : l’économat ne `
            + 'pourra plus le modifier. Vous pourrez le rouvrir de nouveau si besoin.',
          confirmLabel: 'Refermer',
          tone: 'info',
        }
      : {
          title: `Rouvrir le ${rank}ᵉ servi ?`,
          message: `Le bon de livraison du ${rank}ᵉ servi est émis. En le rouvrant, l’économat pourra `
            + 'de nouveau compléter ce passage, puis devra réémettre le bon.',
          confirmLabel: 'Rouvrir',
          tone: 'warn',
        })
    if (!ok) return
    setBusy(true)
    try {
      if (ouvert) {
        const d = await gql<{ lockRefill: number }>(LOCK, { id })
        push('success', `${rank}ᵉ servi refermé (${d.lockRefill} passage${d.lockRefill > 1 ? 's' : ''}).`)
      } else {
        const d = await gql<{ reopenRefill: number }>(REOPEN, { id })
        push('success', `${rank}ᵉ servi rouvert (${d.reopenRefill} passage${d.reopenRefill > 1 ? 's' : ''}).`)
      }
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={agir}
      disabled={busy}
      title={ouvert ? 'Refermer ce servi (administration)' : 'Rouvrir ce servi (administration)'}
      aria-label={`${ouvert ? 'Refermer' : 'Rouvrir'} le ${rank}e servi`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border bg-white/80 px-2.5 py-1 text-[0.76rem] font-semibold shadow-sm transition-colors disabled:opacity-60',
        ouvert
          ? 'border-info/40 text-info hover:bg-info/10'
          : 'border-warn/40 text-warn hover:bg-warn/10',
      )}
    >
      {ouvert ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
      <span>{ouvert ? 'Refermer' : 'Rouvrir'}</span>
    </button>
  )
}
