'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Loader2, ScanFace, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/glass'
import { chargerVisage, fermerCamera, ouvrirCamera, signature } from '@/lib/face'
import { cn } from '@/lib/utils'

type Etat = 'chargement' | 'recherche' | 'verification' | 'reconnu' | 'echec'

/**
 * La connexion par le visage : la caméra s'ouvre, le visage est cherché et
 * envoyé au serveur, qui le compare à celui de l'agent. Reconnu, la session
 * s'ouvre. Sinon on réessaie quelques fois, puis on propose le mot de passe ;
 * « Utiliser mon mot de passe » est toujours là.
 */
export function FaceLogin({ userId, onPassword }: { userId: number; onPassword: () => void }) {
  const router = useRouter()
  const video = React.useRef<HTMLVideoElement>(null)
  const [etat, setEtat] = React.useState<Etat>('chargement')
  const [message, setMessage] = React.useState<string | null>(null)
  const [essai, setEssai] = React.useState(0)

  React.useEffect(() => {
    let vivant = true
    let flux: MediaStream | null = null
    const ESSAIS = 4
    ;(async () => {
      try {
        setEtat('chargement'); setMessage(null)
        // Les modèles et la caméra en même temps : c'est le plus long.
        const [, f] = await Promise.all([chargerVisage(), ouvrirCamera(video.current!)])
        flux = f
        if (!vivant) return
        setEtat('recherche')
        let refus = 0
        const debut = Date.now()
        while (vivant) {
          const d = await signature(video.current!)
          if (!vivant) return
          if (!d) {
            if (Date.now() - debut > 20000) { setEtat('echec'); setMessage('Aucun visage détecté : approchez-vous, face à la lumière.'); return }
            await new Promise((r) => setTimeout(r, 120))
            continue
          }
          setEtat('verification')
          const r = await fetch('/api/face/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId, descriptor: d }) })
          const res = await r.json().catch(() => ({}))
          if (!vivant) return
          if (r.ok) {
            setEtat('reconnu')
            fermerCamera(flux); flux = null
            router.push(res.redirect ?? '/employe'); router.refresh()
            return
          }
          if (res.raison !== 'non-reconnu') { setEtat('echec'); setMessage(res.error ?? 'Connexion par le visage impossible.'); return }
          refus += 1
          if (refus >= ESSAIS) { setEtat('echec'); setMessage('Visage non reconnu. Réessayez, ou utilisez votre mot de passe.'); return }
          setEtat('recherche')
          await new Promise((r) => setTimeout(r, 400))
        }
      } catch (e) {
        if (!vivant) return
        setEtat('echec')
        setMessage(e instanceof Error && /Permission|NotAllowed/i.test(e.name + e.message) ? 'Accès à la caméra refusé : autorisez-le, ou utilisez votre mot de passe.' : e instanceof Error ? e.message : 'Caméra indisponible.')
      } finally {
        // La boucle finie — reconnu, échec ou départ — la caméra s'éteint.
        fermerCamera(flux); flux = null
      }
    })()
    return () => { vivant = false; fermerCamera(flux) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, essai])

  const textes: Record<Etat, string> = {
    chargement: 'Ouverture de la caméra…',
    recherche: 'Regardez la caméra',
    verification: 'Vérification…',
    reconnu: 'Reconnu — connexion…',
    echec: message ?? 'Non reconnu',
  }

  return (
    <div className="space-y-3">
      <div className={cn('relative mx-auto aspect-[4/3] w-full max-w-sm overflow-hidden rounded-2xl bg-[#0f1e33] ring-4 transition-colors',
        etat === 'reconnu' ? 'ring-ok' : etat === 'echec' ? 'ring-danger/60' : etat === 'verification' ? 'ring-accent' : 'ring-[rgb(var(--glass-edge)/0.3)]')}>
        <video ref={video} playsInline muted className="size-full -scale-x-100 object-cover" />
        {/* Le cadre où placer son visage. */}
        <span aria-hidden className={cn('pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-[45%] border-[3px] border-dashed transition-colors',
          etat === 'reconnu' ? 'border-ok' : etat === 'verification' ? 'border-accent' : 'border-white/60')} />
        {etat === 'chargement' ? (
          <span className="absolute inset-0 grid place-items-center bg-[#0f1e33]/70 text-white"><Loader2 className="size-8 animate-spin" /></span>
        ) : null}
      </div>
      <p role="status" className={cn('flex items-center justify-center gap-2 text-center text-[0.9rem] font-semibold',
        etat === 'reconnu' ? 'text-ok' : etat === 'echec' ? 'text-danger' : 'text-fg')}>
        {etat === 'echec' ? null : etat === 'reconnu' ? <ScanFace className="size-4" /> : <Loader2 className="size-4 animate-spin" />}
        {textes[etat]}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {etat === 'echec' ? (
          <Button variant="secondary" onClick={() => setEssai((n) => n + 1)}><RotateCcw className="size-4" /> Réessayer</Button>
        ) : null}
        <Button variant={etat === 'echec' ? 'primary' : 'ghost'} onClick={onPassword} disabled={etat === 'reconnu'}>
          <KeyRound className="size-4" /> Utiliser mon mot de passe
        </Button>
      </div>
    </div>
  )
}
