'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Check, Loader2, Trash2 } from 'lucide-react'
import { Button, Badge } from '@/components/ui/glass'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import { chargerVisage, fermerCamera, ouvrirCamera, signature } from '@/lib/face'
import { formatDateTime } from '@/lib/utils'

const PRISES = 5

/**
 * Le visage d'un agent, enregistré par l'administration : l'agent se place
 * devant la caméra de l'administrateur, cinq prises sont moyennées par le
 * serveur. Seule l'administration l'enregistre, le refait ou le retire.
 */
export function FaceEnrollModal({ user, enregistreLe, onClose }: {
  user: { id: number; fullName: string }
  enregistreLe: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const { push } = useToast()
  const confirmer = useConfirm()
  const video = React.useRef<HTMLVideoElement>(null)
  const flux = React.useRef<MediaStream | null>(null)
  const [actif, setActif] = React.useState(false)
  const [prises, setPrises] = React.useState(0)
  const [etat, setEtat] = React.useState<string | null>(null)

  React.useEffect(() => () => fermerCamera(flux.current), [])

  const commencer = async () => {
    setActif(true); setPrises(0); setEtat('Ouverture de la caméra…')
    try {
      await new Promise((r) => requestAnimationFrame(r))
      const [, f] = await Promise.all([chargerVisage(), ouvrirCamera(video.current!)])
      flux.current = f
      setEtat(`${user.fullName} regarde la caméra, sans bouger…`)
      const releves: number[][] = []
      const debut = Date.now()
      while (releves.length < PRISES) {
        if (Date.now() - debut > 30000) throw new Error('Visage introuvable : face à la lumière, une seule personne devant la caméra.')
        const d = await signature(video.current!)
        if (d) { releves.push(d); setPrises(releves.length) }
        await new Promise((r) => setTimeout(r, d ? 250 : 120))
      }
      setEtat('Enregistrement…')
      const r = await fetch('/api/face/enroll', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: user.id, descriptors: releves }) })
      const res = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(res.error ?? 'Enregistrement impossible.')
      push('success', `Visage de ${user.fullName} enregistré : il se connecte désormais en regardant la caméra.`)
      router.refresh()
      onClose()
    } catch (e) {
      push('error', e instanceof Error ? e.message : 'Caméra indisponible.')
    } finally {
      fermerCamera(flux.current); flux.current = null
      setActif(false); setEtat(null)
    }
  }

  const retirer = async () => {
    const ok = await confirmer({ title: `Retirer le visage de ${user.fullName} ?`, message: 'Il se connectera de nouveau avec son mot de passe.', confirmLabel: 'Retirer', tone: 'danger' })
    if (!ok) return
    const r = await fetch(`/api/face/enroll?userId=${user.id}`, { method: 'DELETE' })
    if (r.ok) { push('success', 'Visage retiré.'); router.refresh(); onClose() } else push('error', 'Suppression impossible.')
  }

  return (
    <Modal title={`Visage — ${user.fullName}`} onClose={onClose}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {enregistreLe && !actif ? <Button variant="ghost" onClick={() => void retirer()} className="text-danger"><Trash2 className="size-4" /> Retirer le visage</Button> : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={actif}>Fermer</Button>
            {!actif ? (
              <Button variant="primary" onClick={() => void commencer()}>
                <Camera className="size-4" /> {enregistreLe ? 'Refaire le visage' : 'Enregistrer le visage'}
              </Button>
            ) : null}
          </div>
        </div>
      }>
      <div className="space-y-3">
        <p className="text-[0.85rem] text-fg-muted">
          L’agent se connectera en regardant la caméra, sans mot de passe. Seule une signature du visage est gardée, pas de photo.
        </p>
        {enregistreLe ? <Badge tone="ok"><Check className="size-3.5" /> Visage enregistré le {formatDateTime(enregistreLe)}</Badge> : null}
        {actif ? (
          <div className="space-y-2">
            <div className="relative mx-auto aspect-[4/3] w-full max-w-sm overflow-hidden rounded-2xl bg-[#0f1e33]">
              <video ref={video} playsInline muted className="size-full -scale-x-100 object-cover" />
              <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-[45%] border-[3px] border-dashed border-white/60" />
            </div>
            <p role="status" className="flex items-center justify-center gap-2 text-center text-[0.88rem] font-semibold text-fg">
              <Loader2 className="size-4 animate-spin" /> {etat} {prises > 0 ? `(${prises}/${PRISES})` : ''}
            </p>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
